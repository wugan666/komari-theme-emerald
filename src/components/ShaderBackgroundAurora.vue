<script setup lang="ts">
import { useDocumentVisibility, useElementVisibility } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { createScrollFreeze, perfTier } from '@/utils/perfTier'

const appStore = useAppStore()
const canvasRef = ref<HTMLCanvasElement>()
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let animationId = 0
// 动画时钟只在真正绘制时前进：滚动冻结、标签页切走或限帧跳过之后从原处继续，
// 不会因为按墙上时钟取时间而一下子跳过去（那就是背景“抽搐”的来源）。
let animTime = 0
let lastFrameTime = 0

const isMobile = window.innerWidth < 768
// 装饰背景限制帧率，避免高刷新率屏幕持续占满 GPU。
function getFrameInterval(): number {
  return 1000 / (isMobile ? 24 : 30)
}

// low 档：渲一帧就冻结。背景静止后合成器缓存全部 backdrop-filter 结果，玻璃成本归零。
// 暗色切换/窗口尺寸变化时解冻重绘一帧。
let lowTierPainted = false
watch(() => appStore.isDark, () => {
  lowTierPainted = false
})
function handleWindowResize() {
  lowTierPainted = false
}

// 滚动中挂起背景重绘，避免滚动失效 + 动画失效双重叠加
const scrollFreeze = createScrollFreeze()

// Visibility-based pause
const documentVisibility = useDocumentVisibility()
const elementVisible = useElementVisibility(canvasRef)

// Cache uniform locations
let uTimeLoc: WebGLUniformLocation | null = null
let uResLoc: WebGLUniformLocation | null = null
let uDarkLoc: WebGLUniformLocation | null = null

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// 极光：几道随噪声缓慢摆动的光幕，下缘锐利、向上拖出长尾。暗色是夜空里的绿/紫极光，
// 亮色把同一组光幕化成淡彩丝带。画面本身很柔和，所以用低分辨率渲染再由浏览器放大。
function getFragmentShader(octaves: number): string {
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float iTime;
uniform vec2 iResolution;
uniform float isDark;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < ${octaves}; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec2 p = vec2(uv.x * iResolution.x / iResolution.y, uv.y);
  float t = iTime * 0.05;

  vec3 glow = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = fbm(vec2(p.x * 1.5 + fi * 3.1 + t * (1.0 + fi * 0.35), fi * 1.7 + t * 0.6));
    float centre = 0.3 + 0.17 * fi + (wave - 0.5) * 0.8;
    float d = uv.y - centre;
    float band = smoothstep(-0.035, 0.0, d) * exp(-max(d, 0.0) * (4.5 + fi * 1.5));
    float rays = 0.35 + 0.65 * noise(vec2(p.x * 16.0 + fi * 5.0 + wave * 4.0, t * 3.0 + fi));
    vec3 tint = mix(vec3(0.1, 0.95, 0.6), vec3(0.45, 0.35, 1.0), clamp(d * 3.0 + 0.22 * fi + 0.15 * sin(t * 2.0 + fi), 0.0, 1.0));
    glow += tint * band * rays * (0.6 - 0.12 * fi);
  }
  float strength = max(glow.r, max(glow.g, glow.b));

  vec3 darkColor = mix(vec3(0.02, 0.035, 0.06), vec3(0.03, 0.07, 0.09), uv.y) + glow * 0.7;
  float star = step(0.9975, hash(floor(gl_FragCoord.xy / 2.0))) * (0.35 + 0.25 * sin(iTime * 1.5 + gl_FragCoord.x));
  darkColor += vec3(star) * (1.0 - clamp(strength * 2.0, 0.0, 1.0));

  vec3 pastel = mix(vec3(1.0), glow / max(strength, 0.001), 0.62);
  vec3 lightColor = mix(mix(vec3(0.975, 0.985, 0.98), vec3(0.93, 0.965, 0.985), uv.y), pastel, clamp(strength * 1.3, 0.0, 0.85));

  gl_FragColor = vec4(mix(lightColor, darkColor, isDark), 1.0);
}
`
}

function createShader(glCtx: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = glCtx.createShader(type)
  if (!shader)
    return null
  glCtx.shaderSource(shader, source)
  glCtx.compileShader(shader)
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    console.warn('[ShaderBackgroundAurora] Shader compile error:', glCtx.getShaderInfoLog(shader))
    glCtx.deleteShader(shader)
    return null
  }
  return shader
}

function initWebGL() {
  const canvas = canvasRef.value
  if (!canvas)
    return false

  gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: isMobile ? 'low-power' : 'default',
  })
  if (!gl)
    return false

  const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, getFragmentShader(isMobile ? 3 : 4))
  if (!vs || !fs)
    return false

  program = gl.createProgram()
  if (!program)
    return false

  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[ShaderBackgroundAurora] Program link error:', gl.getProgramInfoLog(program))
    return false
  }

  gl.useProgram(program)

  // Cache uniform locations
  uTimeLoc = gl.getUniformLocation(program, 'iTime')
  uResLoc = gl.getUniformLocation(program, 'iResolution')
  uDarkLoc = gl.getUniformLocation(program, 'isDark')

  // Full-screen quad
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

  const posAttr = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(posAttr)
  gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0)

  return true
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas)
    return

  // 极光没有硬边，半分辨率渲染后放大看不出差别
  const dpr = isMobile ? 0.35 : 0.5
  const width = Math.floor(canvas.clientWidth * dpr)
  const height = Math.floor(canvas.clientHeight * dpr)

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    gl?.viewport(0, 0, width, height)
  }
}

function render(now: number) {
  if (!gl || !program)
    return

  animationId = requestAnimationFrame(render)

  // Pause when tab hidden or element off-screen
  if (documentVisibility.value !== 'visible' || !elementVisible.value)
    return

  if (perfTier.value === 'low') {
    if (lowTierPainted)
      return
    lowTierPainted = true
  }
  else if (scrollFreeze.isFrozen()) {
    return
  }
  else if (now - lastFrameTime < getFrameInterval()) {
    return
  }
  if (lastFrameTime)
    animTime += Math.min(now - lastFrameTime, 100)
  lastFrameTime = now

  resize()

  const time = animTime / 1000.0
  gl.uniform1f(uTimeLoc, time)
  gl.uniform2f(uResLoc, canvasRef.value!.width, canvasRef.value!.height)
  gl.uniform1f(uDarkLoc, appStore.isDark ? 1.0 : 0.0)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

onMounted(() => {
  lastFrameTime = 0
  window.addEventListener('resize', handleWindowResize)
  if (initWebGL()) {
    animationId = requestAnimationFrame(render)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  scrollFreeze.dispose()
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = 0
  }
  if (gl) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl = null
  }
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="absolute inset-0 w-full h-full"
    aria-hidden="true"
  />
</template>
