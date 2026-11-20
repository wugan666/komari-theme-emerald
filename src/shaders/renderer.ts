// Draws one full-screen fragment shader. Runs unchanged on the main thread or
// inside a worker (OffscreenCanvas), so it must not touch the DOM.

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export interface ShaderRenderer {
  resize: (width: number, height: number) => void
  draw: (seconds: number, dark: boolean) => void
  dispose: () => void
}

export function createShaderRenderer(canvas: HTMLCanvasElement | OffscreenCanvas, fragmentSource: string, lowPower: boolean): ShaderRenderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: lowPower ? 'low-power' : 'default',
  }) as WebGLRenderingContext | null
  if (!gl)
    return null

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader)
      return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[shader] compile error:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program)
    return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[shader] link error:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)
  const timeLocation = gl.getUniformLocation(program, 'iTime')
  const resolutionLocation = gl.getUniformLocation(program, 'iResolution')
  const darkLocation = gl.getUniformLocation(program, 'isDark')
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  return {
    resize(width, height) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    },
    draw(seconds, dark) {
      gl.uniform1f(timeLocation, seconds)
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform1f(darkLocation, dark ? 1 : 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

export interface LoopState {
  dark: boolean
  /** tab hidden: draw nothing */
  paused: boolean
  /** low-power devices get a still frame, redrawn only when something changes */
  still: boolean
  fps: number
}

/**
 * Frame loop shared by both hosts. The animation clock only advances for
 * frames that are drawn, and frames are paced against a fixed interval with
 * the remainder carried over, so a 30 fps cap on a 60 Hz screen draws every
 * second refresh instead of alternating between 33 ms and 50 ms gaps.
 */
export function createShaderLoop(
  renderer: ShaderRenderer,
  state: LoopState,
  raf: (callback: (now: number) => void) => number,
  caf: (handle: number) => void,
  onFrame?: () => void,
) {
  let handle = 0
  let clock = 0
  let lastDraw = 0
  let stillDirty = true
  let running = true
  function frame(now: number) {
    if (!running)
      return
    handle = raf(frame)
    if (state.paused)
      return
    if (state.still) {
      if (!stillDirty)
        return
      stillDirty = false
    }
    else {
      const interval = 1000 / state.fps
      const elapsed = now - lastDraw
      // 2 ms of slack absorbs refresh-rate jitter
      if (lastDraw && elapsed < interval - 2)
        return
      if (lastDraw)
        clock += Math.min(elapsed, 100)
      lastDraw = lastDraw && elapsed < interval * 2 ? now - (elapsed % interval) : now
    }
    renderer.draw(clock / 1000, state.dark)
    onFrame?.()
  }
  handle = raf(frame)
  return {
    /** something visible changed (size, colour scheme): a still frame must be redrawn */
    invalidate() {
      stillDirty = true
    },
    stop() {
      running = false
      caf(handle)
    },
  }
}
