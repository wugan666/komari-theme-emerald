import { ref } from 'vue'

/** Shader 背景的自适应画质；地球仅用该等级限制帧率，不以低档禁用旋转。 */
export type PerfTier = 'high' | 'medium' | 'low'

const STORAGE_KEY = 'emerald-perf-tier-v1'
const reducedMotion = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)')

// 档位不再跨访问记住：一次加载时的偶然卡顿不应该让这台设备的背景永远静止。
// 旧版本存下的结果在这里清掉。
function readStoredTier(): PerfTier | null {
  try {
    localStorage.removeItem(STORAGE_KEY)
  }
  catch {
  }
  return null
}

// 探测前的保守默认：桌面 high，移动端 medium，明显弱的设备直接 low
function defaultTier(): PerfTier {
  if (typeof window === 'undefined')
    return 'high'
  const nav = navigator as Navigator & { deviceMemory?: number }
  if ((nav.deviceMemory != null && nav.deviceMemory <= 2) || navigator.hardwareConcurrency <= 3)
    return 'low'
  return window.innerWidth < 768 ? 'medium' : 'high'
}

export const perfTier = ref<PerfTier>(reducedMotion?.matches ? 'low' : readStoredTier() ?? defaultTier())

function applyTier(tier: PerfTier, persist: boolean): void {
  perfTier.value = tier
  void persist
}

function measureFps(durationMs: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0
    const start = performance.now()
    function tick(now: number) {
      frames++
      if (now - start < durationMs)
        requestAnimationFrame(tick)
      else
        resolve(frames / ((now - start) / 1000))
    }
    requestAnimationFrame(tick)
  })
}

/**
 * 地球展开后调用；已有存档不再探测。
 * 已有存档则直接应用；否则跑 1 秒帧率探针，掉帧则降档并存档。
 */
const handleMotionPreference = () => applyTier(reducedMotion?.matches ? 'low' : readStoredTier() ?? defaultTier(), false)
reducedMotion?.addEventListener('change', handleMotionPreference)
if (import.meta.hot)
  import.meta.hot.dispose(() => reducedMotion?.removeEventListener('change', handleMotionPreference))

export async function initPerfTier(): Promise<void> {
  if (reducedMotion?.matches) {
    applyTier('low', false)
    return
  }
  const stored = readStoredTier()
  if (stored) {
    applyTier(stored, false)
    return
  }
  const base = defaultTier()
  applyTier(base, false)
  if (document.visibilityState !== 'visible') {
    // 后台标签页 rAF 被节流，测出来全是假掉帧，放弃本次探测
    return
  }
  const fps = await measureFps(1000)
  let result = base
  if (fps < 28)
    result = 'low'
  else if (fps < 48)
    result = base === 'high' ? 'medium' : 'low'
  applyTier(result, true)
}
