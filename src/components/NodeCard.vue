<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import CarrierLatency from '@/components/CarrierLatency.vue'
import { CardX } from '@/components/ui/card-x'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatRelativeTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { nodeTrafficUsed } from '@/utils/nodeHealth'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { buildPriceTags, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{ click: [] }>()

const appStore = useAppStore()
const nodesStore = useNodesStore()

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

const trafficUsed = computed(() => nodeTrafficUsed(props.node))
const trafficUsedPercentage = computed(() => props.node.traffic_limit > 0
  ? Math.min(trafficUsed.value / props.node.traffic_limit * 100, 100)
  : 0)

function openWithKeyboard(event: KeyboardEvent) {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    emit('click')
  }
}

const priceTags = computed(() => buildPriceTags(props.node, appStore.lang))

const isPinned = computed(() => appStore.isNodePinned(props.node.uuid))
const offlineRelative = computed(() => formatRelativeTime(props.node.time, nodesStore.now))

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

const isCompact = computed(() => appStore.cardDensity === 'compact')

// 点标签直接筛选同标签节点（再点一次取消）
function filterByTag(tag: string) {
  appStore.nodeSearchText = appStore.nodeSearchText === tag ? '' : tag
}

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
const metrics = computed(() => [
  { label: 'CPU', value: `${(props.node.cpu ?? 0).toFixed(1)}%`, percentage: props.node.cpu ?? 0, status: cpuStatus.value, detail: `负载 ${(props.node.load ?? 0).toFixed(2)} / ${(props.node.load5 ?? 0).toFixed(2)} / ${(props.node.load15 ?? 0).toFixed(2)}` },
  { label: '内存', value: `${memPercentage.value.toFixed(1)}%`, percentage: memPercentage.value, status: memStatus.value, detail: `${formatBytes(props.node.ram ?? 0)} / ${formatBytes(props.node.mem_total ?? 0)}` },
  { label: '硬盘', value: `${diskPercentage.value.toFixed(1)}%`, percentage: diskPercentage.value, status: diskStatus.value, detail: `${formatBytes(props.node.disk ?? 0)} / ${formatBytes(props.node.disk_total ?? 0)}` },
  { label: '流量', value: props.node.traffic_limit > 0 ? `${trafficUsedPercentage.value.toFixed(1)}%` : '不限量', percentage: trafficUsedPercentage.value, status: getStatus(trafficUsedPercentage.value), detail: `${formatBytes(trafficUsed.value)} / ${props.node.traffic_limit > 0 ? formatBytes(props.node.traffic_limit) : '∞'}` },
])
const network = computed(() => [
  { label: '上行', icon: 'tabler:arrow-up-right', speed: props.node.net_out ?? 0, total: props.node.net_total_up ?? 0 },
  { label: '下行', icon: 'tabler:arrow-down-left', speed: props.node.net_in ?? 0, total: props.node.net_total_down ?? 0 },
])
</script>

<template>
  <CardX
    role="link" tabindex="0" :aria-label="`查看 ${props.node.name} 详情`"
    class="node-card h-full w-full cursor-pointer rounded-2xl border border-white/70 dark:border-white/10 glass-surface transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:-translate-y-0.5 motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-primary"
    :header-class="isCompact ? '!px-3 !pt-3 !pb-2' : '!px-4 !pt-4 !pb-3'"
    :content-class="isCompact ? '!p-3 !pt-0' : '!p-4 !pt-0'"
    @keydown="openWithKeyboard" @click="emit('click')"
  >
    <template #header>
      <div class="flex min-w-0 items-center gap-2.5">
        <img v-if="hasRegion(props.node.region)" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`" :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0">
        <span class="min-w-0 truncate text-sm font-semibold" :title="props.node.name">{{ props.node.name }}</span>
      </div>
    </template>
    <template #header-extra>
      <button
        type="button" :aria-label="isPinned ? '取消置顶' : '置顶'"
        class="rounded p-1 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
        :class="isPinned ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-primary'"
        @click.stop="appStore.togglePinnedNode(props.node.uuid)"
      >
        <Icon :icon="isPinned ? 'tabler:star-filled' : 'tabler:star'" width="15" height="15" />
      </button>
    </template>
    <div class="flex flex-col" :class="isCompact ? 'gap-3' : 'gap-4'">
      <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span class="flex min-w-0 items-center gap-1.5 truncate">
          <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-3.5">
          {{ getOSName(props.node.os) }} · {{ props.node.cpu_cores }} 核
        </span>
        <span class="inline-flex shrink-0 items-center gap-1.5" :class="props.node.online ? 'text-primary' : 'text-destructive'" :title="`最后上报：${offlineTime}`">
          <span class="size-1.5 rounded-full bg-current" />{{ props.node.online ? '在线' : '离线' }}
        </span>
      </div>
      <div v-if="props.node.online" class="grid grid-cols-2 gap-x-5" :class="isCompact ? 'gap-y-3' : 'gap-y-4'">
        <div v-for="metric in metrics" :key="metric.label" class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-baseline justify-between gap-1">
            <span class="text-xs text-muted-foreground">{{ metric.label }}</span>
            <span class="text-sm font-semibold">{{ metric.value }}</span>
          </div>
          <ProgressThin :percentage="metric.percentage" :status="metric.status" :height="4" />
          <div class="truncate text-[11px] text-muted-foreground" :title="metric.detail">
            {{ metric.detail }}
          </div>
        </div>
      </div>
      <div v-else class="flex min-h-32 flex-col justify-center gap-2 rounded-lg bg-muted/50 px-3 text-center">
        <span class="text-sm font-medium">最后在线{{ offlineRelative !== '-' ? ` · ${offlineRelative}` : '' }}</span>
        <span class="text-xs text-muted-foreground">最后在线 {{ offlineTime }}</span>
        <span class="text-xs text-muted-foreground">点击查看配置与历史数据</span>
      </div>
      <CarrierLatency :uuid="props.node.uuid" :online="props.node.online" />
      <div v-if="props.node.online" class="grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div v-for="direction in network" :key="direction.label" class="min-w-0">
          <div class="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon :icon="direction.icon" width="12" />{{ direction.label }}
          </div>
          <div class="truncate text-sm font-medium">
            {{ formatBytesPerSecond(direction.speed) }}
          </div>
          <div class="mt-0.5 text-[11px] text-muted-foreground">
            累计 {{ formatBytes(direction.total) }}
          </div>
        </div>
      </div>
      <div v-if="props.node.online && (appStore.showNodeConnections || appStore.showNodeUptime)" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span v-if="appStore.showNodeUptime" class="flex items-center gap-1" title="系统运行时间">
          <Icon icon="tabler:clock-hour-4" width="12" />{{ formatUptime(props.node.uptime ?? 0) }}
        </span>
        <span v-if="appStore.showNodeConnections" title="当前连接数">TCP {{ (props.node.connections ?? 0).toLocaleString() }} · UDP {{ (props.node.connections_udp ?? 0).toLocaleString() }}</span>
      </div>
      <div v-if="priceTags.length || customTags.length" class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span v-for="(tag, index) in priceTags" :key="index" :class="tag.tone === 'danger' ? 'text-destructive font-medium' : tag.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : ''">{{ tag.text }}</span>
        <button v-for="tag in customTags" :key="tag" type="button" class="rounded bg-muted px-1.5 py-0.5 hover:text-primary focus-visible:outline-2" :title="`筛选标签：${tag}`" @click.stop="filterByTag(tag)">
          {{ tag }}
        </button>
      </div>
    </div>
  </CardX>
</template>
