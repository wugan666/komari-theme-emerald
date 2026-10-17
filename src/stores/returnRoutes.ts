import type { RouteSnapshot } from '@/utils/returnRoute'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { readRouteSummaries } from '@/utils/returnRoute'

export const useReturnRoutesStore = defineStore('returnRoutes', () => {
  const summaries = ref<Record<string, RouteSnapshot>>({})
  const app = useAppStore()
  const nodes = useNodesStore()
  let active = false
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | null = null

  async function refresh() {
    if (controller || document.hidden)
      return
    const uuids = nodes.nodes.map(node => node.uuid)
    if (!uuids.length) {
      summaries.value = {}
      return
    }
    const current = new AbortController()
    controller = current
    try {
      const next: Record<string, RouteSnapshot> = {}
      for (let index = 0; index < uuids.length; index += 200) {
        const result = await readRouteSummaries(uuids.slice(index, index + 200), current.signal)
        Object.assign(next, result.nodes)
      }
      if (!current.signal.aborted)
        summaries.value = next
    }
    catch {
      // Cards keep the previous timestamped snapshot; the detail panel exposes errors.
    }
    finally {
      if (controller === current)
        controller = null
    }
  }

  function start() {
    if (active)
      return
    active = true
    void refresh()
    timer = setInterval(() => void refresh(), 60_000)
  }

  function stop() {
    active = false
    clearInterval(timer)
    timer = undefined
    controller?.abort()
    controller = null
  }

  watch(() => app.isLoggedIn, () => {
    controller?.abort()
    controller = null
    summaries.value = {}
    if (active)
      void refresh()
  })
  watch(() => nodes.nodes.map(node => node.uuid).join(','), () => {
    const visible = new Set(nodes.nodes.map(node => node.uuid))
    summaries.value = Object.fromEntries(Object.entries(summaries.value).filter(([uuid]) => visible.has(uuid)))
    if (active)
      void refresh()
  })

  return { summaries, start, stop, refresh }
})
