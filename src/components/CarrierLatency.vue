<script setup lang="ts">
import type { CarrierReading } from '@/utils/carrierPing'
import { Icon } from '@iconify/vue'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed } from 'vue'
import CarrierSparkline from '@/components/CarrierSparkline.vue'
import { useCarrierPingStore } from '@/stores/carrierPing'
import { carrierReading, CARRIERS, carrierTrend } from '@/utils/carrierPing'

const props = defineProps<{ uuid: string, online: boolean, compact?: boolean }>()
const ping = useCarrierPingStore()
const rows = computed(() => ping.regions.map(region => ({
  region,
  carriers: CARRIERS.map(carrier => ({ ...carrier, ...carrierReading(ping.carrierTasks, ping.byNode.get(props.uuid) ?? [], region, carrier.id), trend: carrierTrend(ping.carrierTasks, ping.history.get(props.uuid), region, carrier.id, ping.historyEnd) })),
})))
const selected = computed(() => rows.value.find(row => row.region === ping.selectedRegion)?.carriers ?? CARRIERS.map(carrier => ({ ...carrier, latency: null, loss: null, samples: 0, targets: 0, trend: [] })))

const graphReady = computed(() => ping.enabled && !ping.historyError && !ping.error && ping.historyEnd > 0)
const ceiling = computed(() => Math.max(50, Math.ceil(Math.max(0, ...selected.value.flatMap(c => c.trend.map(p => p.latency ?? 0))) / 50) * 50))
const allCeiling = computed(() => Math.max(50, Math.ceil(Math.max(0, ...rows.value.flatMap(r => r.carriers.flatMap(c => c.trend.map(p => p.latency ?? 0)))) / 50) * 50))
const carrierColors = { telecom: 'text-teal-600 dark:text-teal-400', unicom: 'text-indigo-500 dark:text-indigo-400', mobile: 'text-sky-600 dark:text-sky-400' }

function label(reading: CarrierReading) {
  if (!props.online)
    return '离线'
  if (!ping.enabled)
    return '未启用'
  if (ping.error)
    return '更新失败'
  if (!ping.updatedAt && ping.loading)
    return '加载中'
  if (!reading.targets || !reading.samples)
    return '—'
  if (reading.latency === null)
    return reading.loss === 100 ? '不可达' : '—'
  return `${Math.round(reading.latency)} ms`
}

function lossLabel(reading: CarrierReading) {
  if (!props.online || !ping.enabled || ping.error)
    return ''
  if (!reading.targets)
    return '未配置'
  if (reading.loss === null)
    return '暂无样本'
  return `${reading.loss.toFixed(1)}% 丢包`
}

function tone(reading: CarrierReading) {
  if (!props.online || ping.error || !ping.enabled || !reading.samples)
    return 'text-muted-foreground'
  return reading.loss === 100 ? 'text-red-500' : reading.loss && reading.loss > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/90'
}
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <button
        type="button" data-carrier-latency :data-node="uuid"
        :aria-label="`查看${ping.selectedRegion || ''}三网延迟和各地对比`"
        class="w-full min-w-0 rounded-xl border border-primary/10 bg-gradient-to-br from-muted/50 to-card/80 text-left hover:border-primary/25 focus-visible:outline-2 focus-visible:outline-emerald-500"
        :class="compact ? 'px-1 py-1' : 'p-2.5'"
        @click.stop @keydown.stop
      >
        <span v-if="!compact" class="mb-1.5 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span>{{ ping.selectedRegion || '测点' }}三网</span>
          <span class="inline-flex items-center gap-0.5">各地对比 <Icon icon="tabler:chevron-down" width="12" /></span>
        </span>
        <span class="grid grid-cols-3 gap-2">
          <span v-for="carrier in selected" :key="carrier.id" class="flex min-w-0 flex-col gap-0.5" :data-carrier="carrier.id">
            <span class="flex items-center gap-1 text-[11px]" :class="carrierColors[carrier.id]"><span class="size-1 rounded-full bg-current" />{{ carrier.name }}</span>
            <span class="whitespace-nowrap font-medium tabular-nums" :class="[compact ? 'text-[10px]' : 'text-sm', tone(carrier)]">{{ label(carrier) }}</span>
            <span v-if="graphReady" class="relative block" :class="carrierColors[carrier.id]">
              <CarrierSparkline :points="carrier.trend" :ceiling="ceiling" :name="carrier.name" :class="compact ? '!h-4' : ''" />
              <span v-if="carrier.trend.every(p => p.latency === null && p.loss === null)" class="absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">暂无趋势</span>
            </span>
            <span v-if="!compact" class="text-[10px] text-muted-foreground tabular-nums" title="近 5 分钟已收到的探测结果中的丢包率；未收到样本的时段不计入丢包率。">{{ lossLabel(carrier) }}</span>
          </span>
        </span>
        <span v-if="!compact" class="mt-2 flex justify-between gap-1 text-[9px] text-muted-foreground">
          <template v-if="graphReady"><span>30 分钟趋势 · 0–{{ ceiling }} ms</span><span>均值 / 丢包：近 5 分钟</span></template>
          <span v-else-if="online && ping.enabled">{{ ping.historyError ? '趋势更新失败，稍后重试' : ping.loading ? '正在加载趋势…' : '' }}</span>
        </span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="bottom" align="center" :side-offset="6" :collision-padding="12"
        class="z-50 w-[min(23rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-3 text-foreground shadow-xl outline-none"
        aria-label="各地三网延迟" @click.stop
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-sm font-medium">各地三网延迟</span>
          <PopoverClose aria-label="关闭延迟对比" class="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2">
            <Icon icon="tabler:x" width="14" />
          </PopoverClose>
        </div>
        <p v-if="!online" class="mb-2 text-xs text-muted-foreground">
          节点已离线；下方保留近期趋势，点击“查看历史延迟”可查看离线前的记录。
        </p>
        <a v-if="!online" :href="`/instance/${uuid}#ping-history`" class="mb-2 inline-block text-xs text-primary underline" @click.stop>查看历史延迟</a>
        <table class="w-full table-fixed text-center text-xs">
          <thead>
            <tr class="text-muted-foreground">
              <th class="py-1 text-left font-normal">
                测点地区
              </th>
              <th v-for="carrier in CARRIERS" :key="carrier.id" class="font-normal">
                {{ carrier.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.region" :class="row.region === ping.selectedRegion ? 'bg-muted/60' : ''">
              <th class="py-2 text-left font-medium">
                {{ row.region }}
              </th>
              <td v-for="reading in row.carriers" :key="reading.id" class="py-2 tabular-nums">
                <div :class="tone(reading)">
                  {{ label(reading) }}
                </div>
                <CarrierSparkline v-if="graphReady" :points="reading.trend" :ceiling="allCeiling" :name="`${row.region}${reading.name}`" class="!h-8" :class="carrierColors[reading.id]" />
                <div class="mt-0.5 text-[10px] text-muted-foreground">
                  {{ lossLabel(reading) }}
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="py-4 text-muted-foreground">
                {{ ping.loading ? '正在加载测点…' : '暂无三网测点' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          延迟均值和丢包率统计近 5 分钟，曲线展示近 30 分钟，每分钟刷新。延迟仅计成功探测；丢包率仅计已收到的探测结果。三网共用刻度，红条表示丢包，短暂缺测连接前后实测点，不补造测量值；丢包和长时间缺测留空。
        </p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
