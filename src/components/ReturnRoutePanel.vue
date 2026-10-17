<script setup lang="ts">
import type { RouteCity, RouteDetail } from '@/utils/returnRoute'
import { Icon } from '@iconify/vue'
import { useNow } from '@vueuse/core'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { useAppStore } from '@/stores/app'
import { useReturnRoutesStore } from '@/stores/returnRoutes'
import { formatDateTime } from '@/utils/helper'
import { carrierNames, cityName, collectReturnRoute, readReturnRoute, routeCities, routeFailure, routeRequestError, routeTone } from '@/utils/returnRoute'

const props = defineProps<{ uuid: string, online: boolean }>()
const app = useAppStore()
const routeStore = useReturnRoutesStore()
const now = useNow({ interval: 1000 })
const city = ref<RouteCity>(routeStore.summaries[props.uuid]?.city ?? 'beijing')
const selected = ref('')
const detail = ref<RouteDetail | null>(null)
const loading = ref(false)
const starting = ref(false)
const error = ref('')
let controller: AbortController | null = null
let poll: ReturnType<typeof setTimeout> | undefined
let generation = 0

const pending = computed(() => detail.value?.latest_attempt?.state === 'pending')
const remaining = computed(() => {
  const attempt = detail.value?.latest_attempt
  if (!attempt)
    return 0
  return Math.max(0, Math.ceil((Date.parse(attempt.started_at) + (detail.value?.cooldown_seconds ?? 120) * 1000 - now.value.getTime()) / 1000))
})
const stale = computed(() => detail.value?.snapshot && now.value.getTime() - Date.parse(detail.value.snapshot.measured_at) > 7 * 86400_000)

async function load(reset = false) {
  clearTimeout(poll)
  controller?.abort()
  const current = new AbortController()
  controller = current
  const version = ++generation
  if (reset)
    detail.value = null
  loading.value = true
  error.value = ''
  try {
    const result = await readReturnRoute(props.uuid, city.value, selected.value, current.signal)
    if (version !== generation || current.signal.aborted)
      return
    detail.value = result
    if (result.latest_attempt?.state === 'pending')
      poll = setTimeout(() => void load(), 3000)
  }
  catch (cause) {
    if (version === generation && !current.signal.aborted)
      error.value = routeRequestError(cause)
  }
  finally {
    if (version === generation)
      loading.value = false
  }
}

async function collect() {
  if (starting.value || pending.value)
    return
  clearTimeout(poll)
  controller?.abort()
  const current = new AbortController()
  controller = current
  const version = ++generation
  starting.value = true
  error.value = ''
  try {
    await collectReturnRoute(props.uuid, city.value, current.signal)
    if (current.signal.aborted || version !== generation)
      return
    selected.value = ''
    await load()
  }
  catch (cause) {
    if (!current.signal.aborted && version === generation)
      error.value = routeRequestError(cause)
  }
  finally {
    starting.value = false
  }
}

watch(city, () => {
  selected.value = ''
  void load(true)
})
watch(() => app.isLoggedIn, () => void load(true))
watch(() => detail.value?.snapshot?.id, () => void routeStore.refresh())
void load(true)
onScopeDispose(() => {
  generation++
  clearTimeout(poll)
  controller?.abort()
})
</script>

<template>
  <section aria-label="三网回程线路">
    <CardX class="glass-surface rounded-xl border border-border" content-class="!p-4 sm:!p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="flex items-center gap-2 text-sm font-semibold sm:text-base">
            <Icon icon="lucide:route" width="18" class="text-primary" />三网回程线路
          </h2>
          <p class="mt-1 text-xs text-muted-foreground">
            从此 VPS 出发，观察到国内电信、联通、移动的 IPv4 路径。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="city" aria-label="回程目标城市" :disabled="starting" class="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option v-for="item in routeCities" :key="item.id" :value="item.id">
              {{ item.name }}三网
            </option>
          </select>
          <Button variant="outline" size="sm" :disabled="loading || starting" aria-label="刷新回程结果" @click="load()">
            <Icon icon="lucide:refresh-cw" width="14" :class="loading && 'animate-spin'" />
          </Button>
          <Button v-if="app.isLoggedIn" size="sm" :disabled="!online || starting || pending || remaining > 0" @click="collect">
            <Icon v-if="starting || pending" icon="lucide:loader-circle" width="14" class="animate-spin" />
            {{ starting || pending ? '检测中' : remaining > 0 ? `${remaining}s 后可重测` : '检测回程' }}
          </Button>
        </div>
      </div>

      <p v-if="error" role="alert" class="mt-4 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
        {{ error }}
      </p>
      <p v-if="pending" role="status" class="mt-4 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
        正在由节点采集 {{ cityName(city) }} 三网路径，通常需要约 30 秒。已有结果会继续保留。
      </p>
      <p v-else-if="detail?.latest_attempt?.state === 'failed'" role="status" class="mt-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        {{ routeFailure(detail.latest_attempt.error) }}
      </p>

      <div v-if="detail?.snapshot" class="mt-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {{ selected ? '历史采集' : '最近有效采集' }} · {{ formatDateTime(detail.snapshot.measured_at) }}
            <span v-if="stale" class="ml-1 text-amber-600 dark:text-amber-400">· 已超过 7 天</span>
            <span v-if="!online" class="ml-1">· 节点离线</span>
          </span>
          <select v-model="selected" aria-label="回程历史记录" class="max-w-full rounded-md border border-input bg-background px-2 py-1 text-xs" @change="load()">
            <option value="">
              最近有效结果
            </option>
            <option v-for="entry in detail.history" :key="entry.id" :value="entry.id">
              {{ formatDateTime(entry.finished_at ?? entry.started_at) }}
            </option>
          </select>
        </div>
        <div class="grid items-start gap-3 lg:grid-cols-3">
          <details v-for="route in detail.snapshot.routes" :key="`${detail.snapshot.id}-${route.carrier}`" class="min-w-0 overflow-hidden rounded-xl border border-border bg-background/35">
            <summary class="cursor-pointer list-none space-y-3 p-4 focus-visible:outline-2 focus-visible:outline-primary">
              <div class="flex items-center justify-between text-xs text-muted-foreground">
                <span>{{ carrierNames[route.carrier] }} · {{ cityName(city) }}</span>
                <span>{{ route.reached ? '到达目标' : '部分路径' }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-md border px-2 py-1 text-sm font-medium" :class="routeTone(route)">
                  {{ route.classification.label }}
                </span>
                <span v-if="route.classification.grade" class="text-[11px] text-muted-foreground">{{ route.classification.grade }}</span>
              </div>
              <p class="min-h-8 text-[11px] leading-4 text-muted-foreground">
                {{ route.classification.evidence }}
              </p>
              <p v-if="route.changed_from" class="text-xs text-amber-700 dark:text-amber-300">
                上次：{{ route.changed_from }}
              </p>
              <div class="flex items-center gap-1 text-[11px] text-primary">
                <Icon icon="lucide:list-tree" width="13" />查看逐跳路径
                <span class="ml-auto tabular-nums">{{ route.hops?.filter(hop => hop.ip).length ?? 0 }} 个响应</span>
              </div>
            </summary>
            <div class="border-t border-border/60 p-3">
              <p class="mb-2 break-all text-[11px] text-muted-foreground">
                此 VPS → {{ route.target }}
              </p>
              <p v-if="route.error" class="mb-2 text-[11px] text-muted-foreground">
                {{ routeFailure(route.error) }}
              </p>
              <div class="max-h-80 overflow-y-auto">
                <table class="w-full text-left text-[11px] tabular-nums">
                  <thead class="text-muted-foreground">
                    <tr>
                      <th class="py-1 font-normal">
                        跳
                      </th><th class="py-1 font-normal">
                        IP / 骨干 ASN
                      </th><th class="py-1 text-right font-normal">
                        延迟
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="hop in route.hops" :key="hop.ttl" class="border-t border-border/40">
                      <td class="py-2 pr-2 align-top text-muted-foreground">
                        {{ hop.ttl }}
                      </td>
                      <td class="py-2">
                        <span class="break-all">{{ hop.ip || '*' }}</span><span v-if="hop.asn" class="mt-0.5 block text-primary">{{ hop.asn }}</span>
                      </td>
                      <td class="whitespace-nowrap py-2 pl-2 text-right align-top">
                        {{ hop.rtt_ms == null ? '—' : `${hop.rtt_ms.toFixed(1)} ms` }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
        <p class="text-[11px] leading-5 text-muted-foreground">
          判定基于实测跳点及已知骨干 IP 段，不代表当前网络质量。* 表示该跳未回应，不等于业务丢包；不同城市可能经过不同线路。每个城市保留最近 {{ detail.history_limit }} 次有效采集。
        </p>
      </div>
      <div v-else-if="!loading && !error" class="py-8 text-center">
        <Icon icon="lucide:route" width="28" class="mx-auto text-muted-foreground/40" />
        <p class="mt-3 text-sm text-muted-foreground">
          {{ pending ? '正在采集第一份回程记录' : '暂无回程记录' }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ app.isLoggedIn ? online ? '选择目标城市，检测后可查看三网线路和逐跳依据。' : '节点上线后可发起检测。' : '管理员完成检测后，这里会显示已保存的结果。' }}
        </p>
      </div>
      <p v-else-if="loading && !detail" class="py-8 text-center text-xs text-muted-foreground">
        正在读取回程记录…
      </p>
    </CardX>
  </section>
</template>
