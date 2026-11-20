/// <reference lib="webworker" />
import type { LoopState } from './renderer'
import { createShaderLoop, createShaderRenderer } from './renderer'

// The background renders here, away from the page's main thread, so data
// refreshes, chart work and the globe can never stall its animation.

let renderer: ReturnType<typeof createShaderRenderer> = null
let loop: ReturnType<typeof createShaderLoop> | null = null
const state: LoopState = { dark: false, paused: false, still: false, fps: 30 }
let frames = 0

globalThis.onmessage = (event: MessageEvent) => {
  const message = event.data
  if (message.type === 'init') {
    renderer = createShaderRenderer(message.canvas as OffscreenCanvas, message.fragment, message.lowPower)
    if (!renderer) {
      postMessage({ type: 'failed' })
      return
    }
    Object.assign(state, message.state)
    renderer.resize(message.width, message.height)
    loop = createShaderLoop(renderer, state, callback => requestAnimationFrame(callback), handle => cancelAnimationFrame(handle), () => {
      frames++
    })
    // frame counter for diagnostics; one tiny message a second
    setInterval(() => postMessage({ type: 'frames', frames }), 1000)
  }
  else if (message.type === 'state') {
    Object.assign(state, message.state)
    loop?.invalidate()
  }
  else if (message.type === 'resize') {
    renderer?.resize(message.width, message.height)
    loop?.invalidate()
  }
  else if (message.type === 'dispose') {
    loop?.stop()
    renderer?.dispose()
    close()
  }
}
