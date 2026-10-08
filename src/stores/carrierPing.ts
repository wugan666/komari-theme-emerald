import type { PingHistorySeries, PingSummary, PingTask, TaskTrends } from '@/utils/carrierPing'
import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { classifyCarrierTasks, indexPingHistory, TREND_MINUTES } from '@/utils/carrierPing'
import { getSharedRpc } from '@/utils/rpc'

const REFRESH_MS = 60_000

export const useCarrierPingStore = defineStore('carrierPing', () => {
  const app = useAppStore()
  const enabled = computed(() => app.publicSettings?.ping_record_enabled ?? (app.publicSettings?.ping_record_preserve_time !== 0))
  const tasks = shallowRef<PingTask[]>([])
  const summaries = shallowRef<PingSummary[]>([])
  const history = shallowRef<Map<string, TaskTrends>>(new Map())
  const historyError = ref(false)
  const historyEnd = ref(0)
  const loading = ref(false)
  const error = ref(false)
  const updatedAt = ref(0)
  const preferredRegion = useStorage('komari-emerald:ping-region', '')
  const carrierTasks = computed(() => classifyCarrierTasks(tasks.value))
  const regions = computed(() => [...new Set(carrierTasks.value.map(task => task.region))])
  const selectedRegion = computed({
    get: () => regions.value.includes(preferredRegion.value) ? preferredRegion.value : regions.value[0] ?? '',
    set: (value: string) => { preferredRegion.value = value },
  })
  const byNode = computed(() => {
    const result = new Map<string, PingSummary[]>()
    for (const stat of summaries.value) {
      const values = result.get(stat.entity_id) ?? []
      values.push(stat)
      result.set(stat.entity_id, values)
    }
    return result
  })

  let active = false
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | undefined

  async function refresh() {
    if (!active || document.hidden || !enabled.value || controller)
      return
    const request = new AbortController()
    controller = request
    loading.value = true
    try {
      const client = getSharedRpc().getClient()
      const end = Date.now()
      const start = Math.floor(end / 60_000) * 60_000 - (TREND_MINUTES - 1) * 60_000
      const [nextTasks, result, trend] = await Promise.allSettled([
        client.call<PingTask[]>('public:getPublicPingTasks', undefined, { signal: request.signal }),
        client.call<{ stats: PingSummary[] }>('public:getPingMetricStats', { hours: 5 / 60 }, { signal: request.signal }),
        client.call<{ series: PingHistorySeries[] }>('public:queryMetrics', {
          metric_keys: ['ping.latency_ms', 'ping.loss'],
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          max_points: TREND_MINUTES,
          aggregation: 'avg',
        }, { signal: request.signal }),
      ])
      if (!active || request.signal.aborted)
        return
      if (nextTasks.status === 'fulfilled')
        tasks.value = nextTasks.value
      if (result.status === 'fulfilled') {
        summaries.value = result.value.stats
        updatedAt.value = end
      }
      error.value = nextTasks.status === 'rejected' || result.status === 'rejected'
      historyError.value = trend.status === 'rejected'
      if (trend.status === 'fulfilled') {
        history.value = indexPingHistory(trend.value.series)
        historyEnd.value = end
      }
    }
    catch {
      if (active && !request.signal.aborted)
        error.value = true
    }
    finally {
      if (controller === request) {
        controller = undefined
        loading.value = false
      }
    }
  }

  function visibilityChanged() {
    if (document.hidden) {
      controller?.abort()
      controller = undefined
      loading.value = false
    }
    else {
      void refresh()
    }
  }

  function start() {
    if (active)
      return
    active = true
    // Revalidate on every return to the homepage rather than displaying an
    // indefinitely cached latency after the browser has been hidden.
    error.value = updatedAt.value > 0 && Date.now() - updatedAt.value > REFRESH_MS * 2
    void refresh()
    timer = setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', visibilityChanged)
  }

  function stop() {
    active = false
    clearInterval(timer)
    timer = undefined
    controller?.abort()
    controller = undefined
    loading.value = false
    document.removeEventListener('visibilitychange', visibilityChanged)
  }

  return { enabled, carrierTasks, regions, selectedRegion, byNode, history, historyError, historyEnd, loading, error, updatedAt, start, stop }
})
