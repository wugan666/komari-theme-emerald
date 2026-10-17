<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { RouteCity } from '@/utils/returnRoute'
import { Icon } from '@iconify/vue'
import { computed, onDeactivated, onScopeDispose, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useReturnRoutesStore } from '@/stores/returnRoutes'
import { getCountryCodeFromRegion } from '@/utils/geoHelper'
import { collectReturnRoute, readReturnRoute, routeCities, routeFailure, routeRequestError } from '@/utils/returnRoute'

const props = defineProps<{ nodes: NodeData[] }>()
const unsupportedOS = /windows|darwin|freebsd/i
const routes = useReturnRoutesStore()
const city = ref<RouteCity>('beijing')
const includeFresh = ref(false)
const running = ref(false)
const progress = ref<{ uuid: string, name: string, status: string, done: boolean }[]>([])
let controller: AbortController | null = null

const candidates = computed(() => props.nodes.filter((node) => {
  if (!node.online || getCountryCodeFromRegion(node.region) === 'CN' || unsupportedOS.test(node.os))
    return false
  const previous = routes.summaries[node.uuid]
  return includeFresh.value || !previous || previous.city !== city.value || Date.now() - Date.parse(previous.measured_at) > 7 * 86400_000
}))
const finished = computed(() => progress.value.filter(item => item.done).length)

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

function stop() {
  controller?.abort()
  for (const item of progress.value) {
    if (!item.done)
      item.status = item.status === '排队' ? '未派发' : '已派发，可在节点详情查看结果'
  }
}

async function run() {
  if (running.value || !candidates.value.length)
    return
  const selectedCity = city.value
  progress.value = candidates.value.slice(0, 200).map(node => ({ uuid: node.uuid, name: node.name, status: '排队', done: false }))
  const current = new AbortController()
  controller = current
  running.value = true
  let index = 0
  async function worker() {
    while (!current.signal.aborted && index < progress.value.length) {
      const item = progress.value[index++]!
      item.status = '检测中'
      try {
        const job = await collectReturnRoute(item.uuid, selectedCity, current.signal)
        const deadline = Date.now() + 125_000
        while (!current.signal.aborted) {
          await pause(3000, current.signal)
          const result = await readReturnRoute(item.uuid, selectedCity, '', current.signal)
          if (result.latest_attempt?.id !== job.id)
            throw new Error('Collection superseded')
          if (result.latest_attempt.state === 'complete') {
            item.status = '已完成'
            break
          }
          if (result.latest_attempt.state === 'failed') {
            item.status = routeFailure(result.latest_attempt.error)
            break
          }
          if (Date.now() > deadline) {
            item.status = routeFailure('timed_out')
            break
          }
        }
      }
      catch (error) {
        if (current.signal.aborted)
          return
        item.status = routeRequestError(error)
      }
      if (!current.signal.aborted) {
        item.done = true
        void routes.refresh()
      }
    }
  }
  try {
    await Promise.all([worker(), worker()])
  }
  finally {
    running.value = false
    if (controller === current)
      controller = null
    void routes.refresh()
  }
}

onDeactivated(stop)
onScopeDispose(stop)
</script>

<template>
  <details class="rounded-xl border border-border bg-background/40 p-3 text-xs">
    <summary class="flex cursor-pointer list-none items-center gap-2 font-medium focus-visible:outline-2 focus-visible:outline-primary">
      <Icon icon="lucide:route" width="15" class="text-primary" />回程检测
      <span class="ml-auto font-normal text-muted-foreground">{{ running ? `${finished} / ${progress.length}` : `${candidates.length} 台待测` }}</span>
    </summary>
    <div class="mt-3 space-y-3">
      <p class="leading-5 text-muted-foreground">
        对当前筛选中在线的境外 Linux 节点逐批检测，每批两台。默认跳过近 7 天已采集的结果。
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <select v-model="city" :disabled="running" aria-label="批量回程目标城市" class="h-8 rounded-md border border-input bg-background px-2">
          <option v-for="item in routeCities" :key="item.id" :value="item.id">
            {{ item.name }}三网
          </option>
        </select>
        <label class="flex items-center gap-2 text-muted-foreground"><input v-model="includeFresh" :disabled="running" type="checkbox" class="accent-primary">包含最近已测节点</label>
        <Button v-if="!running" size="sm" :disabled="!candidates.length" @click="run">
          检测 {{ Math.min(candidates.length, 200) }} 台
        </Button>
        <Button v-else variant="outline" size="sm" @click="stop">
          停止后续派发
        </Button>
      </div>
      <div v-if="progress.length" class="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-3" role="status" aria-live="polite">
        <div v-for="item in progress" :key="item.uuid" class="flex flex-wrap justify-between gap-1">
          <span class="max-w-full truncate">{{ item.name }}</span><span class="text-muted-foreground">{{ item.status }}</span>
        </div>
      </div>
    </div>
  </details>
</template>
