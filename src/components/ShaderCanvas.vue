<script setup lang="ts">
import type { LoopState } from '@/shaders/renderer'
import { useDocumentVisibility, useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createShaderLoop, createShaderRenderer } from '@/shaders/renderer'
import ShaderWorker from '@/shaders/worker?worker'
import { useAppStore } from '@/stores/app'
import { perfTier } from '@/utils/perfTier'

// One full-screen shader background. It renders in a worker when the browser
// supports OffscreenCanvas there, and falls back to the main thread otherwise.
const props = defineProps<{
  /** builds the fragment shader source */
  fragment: (mobile: boolean) => string
  /** render resolution relative to CSS pixels */
  scale: number
  mobileScale: number
}>()

const appStore = useAppStore()
const canvasRef = ref<HTMLCanvasElement>()
const visibility = useDocumentVisibility()
const mobile = window.innerWidth < 768

let worker: Worker | null = null
let fallback: { loop: ReturnType<typeof createShaderLoop>, renderer: NonNullable<ReturnType<typeof createShaderRenderer>>, state: LoopState } | null = null

function currentState(): LoopState {
  return {
    dark: appStore.isDark,
    paused: visibility.value !== 'visible',
    still: perfTier.value === 'low',
    // decorative background: capped so high-refresh screens do not keep the GPU busy
    fps: mobile ? 24 : 30,
  }
}
function size(): [number, number] {
  const canvas = canvasRef.value!
  const scale = mobile ? props.mobileScale : props.scale
  return [Math.max(1, Math.floor(canvas.clientWidth * scale)), Math.max(1, Math.floor(canvas.clientHeight * scale))]
}
function startOnMainThread(canvas: HTMLCanvasElement) {
  const renderer = createShaderRenderer(canvas, props.fragment(mobile), mobile)
  if (!renderer)
    return
  const state = currentState()
  renderer.resize(...size())
  fallback = { renderer, state, loop: createShaderLoop(renderer, state, requestAnimationFrame, cancelAnimationFrame) }
}

onMounted(() => {
  const canvas = canvasRef.value!
  const [width, height] = size()
  if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined') {
    try {
      const offscreen = canvas.transferControlToOffscreen()
      worker = new ShaderWorker()
      worker.onmessage = (event) => {
        if (event.data.type === 'frames')
          canvas.dataset.frames = String(event.data.frames)
      }
      worker.postMessage({ type: 'init', canvas: offscreen, fragment: props.fragment(mobile), lowPower: mobile, state: currentState(), width, height }, [offscreen])
      canvas.dataset.renderer = 'worker'
      return
    }
    catch (error) {
      console.warn('[shader] worker rendering unavailable, using the main thread:', error)
      worker?.terminate()
      worker = null
    }
  }
  // a canvas whose control was transferred cannot be used here, but the failure paths above happen before that
  startOnMainThread(canvas)
  canvas.dataset.renderer = 'main'
})

watch([() => appStore.isDark, visibility, perfTier], () => {
  const state = currentState()
  if (worker)
    worker.postMessage({ type: 'state', state })
  else if (fallback) {
    Object.assign(fallback.state, state)
    fallback.loop.invalidate()
  }
})
useResizeObserver(canvasRef, () => {
  const [width, height] = size()
  if (worker)
    worker.postMessage({ type: 'resize', width, height })
  else if (fallback) {
    fallback.renderer.resize(width, height)
    fallback.loop.invalidate()
  }
})
onBeforeUnmount(() => {
  worker?.postMessage({ type: 'dispose' })
  worker = null
  fallback?.loop.stop()
  fallback?.renderer.dispose()
  fallback = null
})
</script>

<template>
  <canvas ref="canvasRef" class="absolute inset-0 w-full h-full" aria-hidden="true" />
</template>
