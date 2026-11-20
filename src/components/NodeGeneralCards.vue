<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import type { CurrencyCode } from '@/utils/financeHelper'
import { Icon } from '@iconify/vue'
import { PopoverClose, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import * as financeHelper from '@/utils/financeHelper'
import { formatBytesPerSecondSplit, formatBytesSplit, getStatus } from '@/utils/helper'

const props = defineProps<{
  nodes?: NodeData[]
  globeNodes?: NodeData[]
}>()
const NodeEarthGlobe = defineAsyncComponent(() => import('@/components/NodeEarthGlobe.vue'))
const globeReady = ref(false)
let globeTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  globeTimer = setTimeout(() => {
    globeReady.value = true
  }, 350)
})
onBeforeUnmount(() => clearTimeout(globeTimer))

const appStore = useAppStore()
const nodesStore = useNodesStore()
const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
const exchangeRateBaseCurrency = ref<CurrencyCode>('CNY')
const excludeFreeNodes = ref(true)
const financeRateCurrencies: CurrencyCode[] = ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY']
const summaryNodes = computed(() => props.nodes ?? nodesStore.nodes)
function setExchangeRateBaseCurrency(event: Event): void {
  const target = event.target as HTMLSelectElement
  exchangeRateBaseCurrency.value = financeHelper.normalizeCurrency(target.value)
  financeHelper.setStoredFinanceCurrency(exchangeRateBaseCurrency.value)
}

const totalSpeed = computed(() => {
  const onlineNodes = summaryNodes.value.filter(node => node.online)
  const up = onlineNodes.reduce((sum, node) => sum + (node.net_out || 0), 0)
  const down = onlineNodes.reduce((sum, node) => sum + (node.net_in || 0), 0)
  return { up, down }
})

const totalTraffic = computed(() => {
  const up = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_up || 0), 0)
  const down = summaryNodes.value.reduce((sum, node) => sum + (node.net_total_down || 0), 0)
  return { up, down }
})

// ==================== 连接数汇总 ====================
const totalConnections = computed(() => {
  const onlineNodes = summaryNodes.value.filter(node => node.online)
  const tcp = onlineNodes.reduce((sum, node) => sum + (node.connections || 0), 0)
  const udp = onlineNodes.reduce((sum, node) => sum + (node.connections_udp || 0), 0)
  return { tcp, udp, total: tcp + udp }
})

function formatNumber(num: number): string {
  if (num >= 100000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toLocaleString('zh-CN')
}

const formattedTrafficUp = computed(() => formatBytesSplit(totalTraffic.value.up, appStore.byteDecimals))
const formattedTrafficDown = computed(() => formatBytesSplit(totalTraffic.value.down, appStore.byteDecimals))
const totalTrafficTooltip = computed(() => formatBytesSplit(totalTraffic.value.up + totalTraffic.value.down, appStore.byteDecimals))

const formattedSpeedUp = computed(() => formatBytesPerSecondSplit(totalSpeed.value.up, appStore.byteDecimals))
const formattedSpeedDown = computed(() => formatBytesPerSecondSplit(totalSpeed.value.down, appStore.byteDecimals))

// ==================== 内存 / 硬盘 汇总 ====================
// 离线节点的 ram / disk 为 0，不影响 used 求和；mem_total / disk_total 是静态库存信息，按全量统计
const totalMemory = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.ram || 0
    total += node.mem_total || 0
  }
  return { used, total }
})

const totalDisk = computed(() => {
  let used = 0
  let total = 0
  for (const node of summaryNodes.value) {
    used += node.disk || 0
    total += node.disk_total || 0
  }
  return { used, total }
})

const formattedMemoryUsed = computed(() => formatBytesSplit(totalMemory.value.used, appStore.byteDecimals))
const formattedMemoryTotal = computed(() => formatBytesSplit(totalMemory.value.total, appStore.byteDecimals))
const formattedDiskUsed = computed(() => formatBytesSplit(totalDisk.value.used, appStore.byteDecimals))
const formattedDiskTotal = computed(() => formatBytesSplit(totalDisk.value.total, appStore.byteDecimals))

const remainingValueCNY = computed(() => {
  return financeHelper.calculateTotalRemainingValueCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const targetExchangeRate = computed(() => exchangeRates.value[exchangeRateBaseCurrency.value] || 1)
const remainingValue = computed(() => {
  return remainingValueCNY.value * targetExchangeRate.value
})
const formattedRemainingValue = computed(() => {
  return financeHelper.formatFinanceAmount(remainingValue.value, exchangeRateBaseCurrency.value)
})
const totalValueCNY = computed(() => {
  return financeHelper.calculateTotalValueCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const totalValue = computed(() => {
  return totalValueCNY.value * targetExchangeRate.value
})
const formattedTotalValue = computed(() => {
  return financeHelper.formatFinanceAmount(totalValue.value, exchangeRateBaseCurrency.value)
})
const monthlyAverageCostCNY = computed(() => {
  return financeHelper.calculateTotalMonthlyAverageCostCNY(summaryNodes.value, exchangeRates.value, excludeFreeNodes.value)
})
const monthlyAverageCost = computed(() => {
  return monthlyAverageCostCNY.value * targetExchangeRate.value
})
const formattedMonthlyAverageCost = computed(() => {
  return financeHelper.formatFinanceAmount(monthlyAverageCost.value, exchangeRateBaseCurrency.value)
})
const financeSummaryItems = computed(() => [
  {
    label: '总价值',
    icon: 'tabler:wallet',
    value: formattedTotalValue.value.value,
    symbol: formattedTotalValue.value.symbol,
    currency: formattedTotalValue.value.currency,
  },
  {
    label: '月均支出',
    icon: 'tabler:receipt-2',
    value: formattedMonthlyAverageCost.value.value,
    symbol: formattedMonthlyAverageCost.value.symbol,
    currency: `${formattedMonthlyAverageCost.value.currency}/月`,
  },
  {
    label: '剩余价值',
    icon: 'tabler:coins',
    value: formattedRemainingValue.value.value,
    symbol: formattedRemainingValue.value.symbol,
    currency: formattedRemainingValue.value.currency,
  },
])
const exchangeRateRows = computed(() => financeRateCurrencies.map((currency) => {
  const baseRate = exchangeRates.value[exchangeRateBaseCurrency.value] || 1
  const targetRate = exchangeRates.value[currency] || 1
  const rate = targetRate / baseRate

  return {
    currency,
    baseCurrency: exchangeRateBaseCurrency.value,
    baseSymbol: financeHelper.CURRENCY_SYMBOLS[exchangeRateBaseCurrency.value],
    targetSymbol: financeHelper.CURRENCY_SYMBOLS[currency],
    rate: new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 6,
      minimumFractionDigits: 6,
    }).format(rate),
  }
}))
onMounted(async () => {
  exchangeRateBaseCurrency.value = financeHelper.getStoredFinanceCurrency()
  excludeFreeNodes.value = financeHelper.shouldExcludeFreeNodes()

  const { rates } = await financeHelper.getDailyExchangeRates()
  exchangeRates.value = rates
})
// 最近一段时间的合计速率，用于总览卡片下方的走势线（只在内存里保留）
const SPEED_HISTORY_LENGTH = 40
const speedHistory = ref<{ up: number, down: number }[]>([])
watch(totalSpeed, (speed) => {
  speedHistory.value = [...speedHistory.value, speed].slice(-SPEED_HISTORY_LENGTH)
}, { immediate: true })
function sparkPath(values: number[]): { line: string, area: string } | null {
  if (values.length < 2)
    return null
  const peak = Math.max(1, ...values)
  const line = values.map((value, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1) * 100).toFixed(2)},${(27 - value / peak * 24).toFixed(2)}`).join(' ')
  return { line, area: `${line} L100,30 L0,30 Z` }
}
function percent(used: number, total: number): number {
  return total > 0 ? Math.min(100, used / total * 100) : 0
}
type TileFooter
  = | { type: 'bar', percent: number }
    | { type: 'rows', rows: [string, string][] }
    | { type: 'spark', path: ReturnType<typeof sparkPath> }

const summaryMetrics = computed(() => {
  const memoryPercent = percent(totalMemory.value.used, totalMemory.value.total)
  const diskPercent = percent(totalDisk.value.used, totalDisk.value.total)
  const footers: Record<string, TileFooter> = {
    memory: { type: 'bar', percent: memoryPercent },
    disk: { type: 'bar', percent: diskPercent },
    finance: { type: 'rows', rows: [['月均支出', `${formattedMonthlyAverageCost.value.symbol}${formattedMonthlyAverageCost.value.value}`], ['总价值', `${formattedTotalValue.value.symbol}${formattedTotalValue.value.value}`]] },
    traffic: { type: 'rows', rows: [['↑ 上行', `${formattedTrafficUp.value.value} ${formattedTrafficUp.value.unit}`], ['↓ 下行', `${formattedTrafficDown.value.value} ${formattedTrafficDown.value.unit}`]] },
    speedUp: { type: 'spark', path: sparkPath(speedHistory.value.map(item => item.up)) },
    speedDown: { type: 'spark', path: sparkPath(speedHistory.value.map(item => item.down)) },
    connections: { type: 'rows', rows: [['TCP', formatNumber(totalConnections.value.tcp)], ['UDP', formatNumber(totalConnections.value.udp)]] },
  }
  const values = {
    memory: { label: '内存用量', icon: 'tabler:cpu', value: `${formattedMemoryUsed.value.value} ${formattedMemoryUsed.value.unit}`, detail: `总计 ${formattedMemoryTotal.value.value} ${formattedMemoryTotal.value.unit}`, hint: '当前用量 / 全部节点配置容量' },
    disk: { label: '硬盘用量', icon: 'tabler:database', value: `${formattedDiskUsed.value.value} ${formattedDiskUsed.value.unit}`, detail: `总计 ${formattedDiskTotal.value.value} ${formattedDiskTotal.value.unit}`, hint: '当前用量 / 全部节点配置容量' },
    finance: { label: '剩余价值', icon: 'tabler:wallet', value: `${formattedRemainingValue.value.symbol}${formattedRemainingValue.value.value}`, detail: formattedRemainingValue.value.currency, hint: '' },
    traffic: { label: '累计流量', icon: 'tabler:arrows-transfer-up', value: `${totalTrafficTooltip.value.value} ${totalTrafficTooltip.value.unit}`, detail: '上行 + 下行', hint: `↑ ${formattedTrafficUp.value.value} ${formattedTrafficUp.value.unit} / ↓ ${formattedTrafficDown.value.value} ${formattedTrafficDown.value.unit}` },
    speedUp: { label: '实时上行', icon: 'tabler:arrow-up-right', value: `${formattedSpeedUp.value.value} ${formattedSpeedUp.value.unit}`, detail: '在线节点合计', hint: '' },
    speedDown: { label: '实时下行', icon: 'tabler:arrow-down-left', value: `${formattedSpeedDown.value.value} ${formattedSpeedDown.value.unit}`, detail: '在线节点合计', hint: '' },
    connections: { label: '连接数', icon: 'tabler:network', value: formatNumber(totalConnections.value.total), detail: 'TCP + UDP', hint: `TCP ${totalConnections.value.tcp} / UDP ${totalConnections.value.udp}` },
  }
  return appStore.summaryCards.map(key => ({ key, ...values[key], footer: footers[key]! }))
})
</script>

<template>
  <section class="px-4 pb-6" aria-label="资源概览">
    <div class="grid gap-4" :class="!appStore.hideEarth ? 'lg:grid-cols-[1.65fr_1fr]' : ''">
      <div class="grid grid-cols-2 min-[360px]:grid-cols-3 gap-3" :class="appStore.hideEarth ? 'xl:grid-cols-6' : ''">
        <template v-for="metric in summaryMetrics" :key="metric.key">
          <PopoverRoot v-if="metric.key === 'finance'">
            <PopoverTrigger as-child>
              <button type="button" aria-label="查看费用和汇率" class="summary-tile flex flex-col justify-start rounded-2xl border border-white/70 dark:border-white/10 glass-surface p-3 sm:p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary">
                <span class="mb-2 sm:mb-4 flex items-center justify-between text-xs text-muted-foreground">{{ metric.label }}<span class="rounded-lg bg-primary/10 p-1.5 text-primary"><Icon :icon="metric.icon" width="16" /></span></span>
                <span class="block truncate text-base sm:text-2xl font-semibold tracking-tight">{{ metric.value }}</span>
                <span class="mt-1 hidden sm:block text-[11px] text-muted-foreground">{{ metric.detail }} · 查看明细</span>
                <span v-if="metric.footer.type === 'rows'" class="mt-auto hidden w-full flex-col gap-1 pt-3 text-[11px] text-muted-foreground lg:flex">
                  <span v-for="row in metric.footer.rows" :key="row[0]" class="flex justify-between gap-2"><span>{{ row[0] }}</span><span class="truncate font-medium text-foreground/80">{{ row[1] }}</span></span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent side="bottom" :side-offset="8" :collision-padding="12" class="z-50 w-[min(23rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-popover p-4 shadow-lg" aria-label="费用和汇率">
                <div class="mb-4 flex items-center justify-between text-sm font-semibold">
                  费用概览<PopoverClose aria-label="关闭费用概览" class="rounded p-1 hover:bg-muted">
                    <Icon icon="tabler:x" width="16" />
                  </PopoverClose>
                </div>
                <div class="grid grid-cols-3 gap-3">
                  <div v-for="item in financeSummaryItems" :key="item.label">
                    <div class="text-xs text-muted-foreground">
                      {{ item.label }}
                    </div>
                    <div class="mt-1 text-sm font-semibold">
                      {{ item.symbol }}{{ item.value }}
                    </div>
                    <div class="text-[10px] text-muted-foreground">
                      {{ item.currency }}
                    </div>
                  </div>
                </div>
                <div class="mb-2 mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span class="text-muted-foreground">今日汇率</span>
                  <select :value="exchangeRateBaseCurrency" class="rounded border bg-card px-2 py-1" aria-label="切换汇率基准币种" @change="setExchangeRateBaseCurrency">
                    <option v-for="currency in financeRateCurrencies" :key="currency" :value="currency">
                      {{ currency }}
                    </option>
                  </select>
                </div>
                <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div v-for="row in exchangeRateRows" :key="row.currency" class="flex justify-between">
                    <span class="text-muted-foreground">{{ row.currency }}</span><span>{{ row.targetSymbol }}{{ row.rate }}</span>
                  </div>
                </div>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
          <div v-else class="flex min-w-0 flex-col summary-tile rounded-2xl border border-white/70 dark:border-white/10 glass-surface p-3 sm:p-4" :title="metric.hint" :data-metric="metric.key">
            <div class="mb-2 sm:mb-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              {{ metric.label }}<span class="rounded-lg bg-primary/10 p-1.5 text-primary"><Icon :icon="metric.icon" width="16" /></span>
            </div>
            <div class="truncate text-base sm:text-2xl font-semibold tracking-tight">
              {{ metric.value }}
            </div>
            <div class="mt-1 hidden sm:block truncate text-[11px] text-muted-foreground">
              {{ metric.detail }}
            </div>
            <!-- 大屏下卡片与地球等高，下半部分用来放用量条 / 分项 / 走势 -->
            <div class="mt-auto hidden pt-3 lg:block">
              <template v-if="metric.footer.type === 'bar'">
                <div class="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
                  <span>已用</span><span class="font-medium text-foreground/80">{{ metric.footer.percent.toFixed(1) }}%</span>
                </div>
                <ProgressThin :percentage="metric.footer.percent" :status="getStatus(metric.footer.percent)" :height="5" />
              </template>
              <div v-else-if="metric.footer.type === 'rows'" class="flex flex-col gap-1 text-[11px] text-muted-foreground">
                <div v-for="row in metric.footer.rows" :key="row[0]" class="flex justify-between gap-2">
                  <span>{{ row[0] }}</span><span class="truncate font-medium text-foreground/80">{{ row[1] }}</span>
                </div>
              </div>
              <svg v-else-if="metric.footer.path" viewBox="0 0 100 30" preserveAspectRatio="none" class="block h-9 w-full text-primary" aria-hidden="true">
                <path :d="metric.footer.path.area" fill="currentColor" fill-opacity="0.12" />
                <path :d="metric.footer.path.line" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              </svg>
              <div v-else class="h-9" />
            </div>
          </div>
        </template>
      </div>
      <div v-if="!appStore.hideEarth" class="min-h-64 lg:min-h-0" data-globe-panel>
        <NodeEarthGlobe v-if="globeReady" :nodes="globeNodes ?? summaryNodes" />
        <div v-else class="h-full min-h-64 rounded-2xl border border-primary/10 bg-card/70" />
      </div>
    </div>
  </section>
</template>
