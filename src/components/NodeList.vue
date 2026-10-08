<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, ref } from 'vue'
import CarrierLatency from '@/components/CarrierLatency.vue'
import TrafficProgress from '@/components/TrafficProgress.vue'
import { Badge } from '@/components/ui/badge'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatRelativeTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { applyOfflineLast, applyPinnedFirst, getTrafficUsed, sortNodes } from '@/utils/nodeSortHelper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { buildPriceTags, parseTags } from '@/utils/tagHelper'

interface ColumnConfig {
  key: string
  label: string
  width: string | number
  sortable: boolean
}

const props = defineProps<{
  nodes: NodeData[]
  transitionKey?: string
}>()

const emit = defineEmits<{ click: [node: NodeData] }>()

const rowStaggerMs = 35
const rowStaggerLimit = 12

const appStore = useAppStore()
const nodesStore = useNodesStore()

const columns: ColumnConfig[] = [
  { key: 'status', label: '状态', width: '36px', sortable: false },
  { key: 'os', label: '系统', width: '36px', sortable: false },
  { key: 'name', label: '节点', width: 'minmax(170px, 1.2fr)', sortable: true },
  { key: 'uptime', label: '运行时间', width: 'minmax(145px, 0.8fr)', sortable: true },
  { key: 'cpu', label: 'CPU', width: 'minmax(110px, 1fr)', sortable: true },
  { key: 'mem', label: '内存', width: 'minmax(120px, 1fr)', sortable: true },
  { key: 'disk', label: '硬盘', width: 'minmax(120px, 1fr)', sortable: true },
  { key: 'traffic', label: '流量', width: 'minmax(120px, 1fr)', sortable: true },
  { key: 'rate', label: '速率', width: 'minmax(100px, 0.7fr)', sortable: true },
]

// <768px 时表格改为移动端紧凑行布局，避免 9 列网格横向滚动
const isDesktop = useMediaQuery('(min-width: 768px)')

const sortableColumns = columns.filter(c => c.sortable)

// 移动端排序 chips：数据列之外补一个"到期"（桌面表头没有对应列）
const mobileSortOptions: Pick<ColumnConfig, 'key' | 'label'>[] = [
  ...sortableColumns.map(c => ({ key: c.key, label: c.label })),
  { key: 'expired', label: '到期' },
]

const sortKey = ref<string>('')
const sortDir = ref<1 | -1>(1)

function handleSort(col: Pick<ColumnConfig, 'key' | 'label'> & { sortable?: boolean }) {
  if (col.sortable === false)
    return
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === 1 ? -1 : 1
  }
  else {
    sortKey.value = col.key
    sortDir.value = 1
  }
}

const sortedNodes = computed(() => applyOfflineLast(applyPinnedFirst(sortNodes(props.nodes, sortKey.value, sortDir.value), appStore.pinnedNodes)))

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')

const columnKeys = computed(() => columns.map(c => c.key))

const gridStyle = computed(() => ({
  gridTemplateColumns: columns.map(c => c.width).join(' '),
}))

const offlineOverlayContentStyle = computed(() => {
  const keys = columnKeys.value
  const statusIndex = keys.indexOf('status')
  const regionIndex = keys.indexOf('region')
  const nameIndex = keys.indexOf('name')
  const startColumn = nameIndex !== -1
    ? nameIndex + 1
    : regionIndex !== -1
      ? regionIndex + 2
      : statusIndex === -1 ? 1 : statusIndex + 2
  return { gridColumn: `${startColumn} / -1` }
})

function getFlagSrc(region: string): string {
  return `/images/flags/${getRegionCode(region)}.svg`
}

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}

function handleClick(node: NodeData) {
  emit('click', node)
}

function getRowTransitionKey(node: NodeData): string {
  return props.transitionKey ? `${props.transitionKey}-${node.uuid}` : node.uuid
}

function getRowTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-row-delay': `${Math.min(index, rowStaggerLimit) * rowStaggerMs}ms`,
  }
}

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

function getTrafficUsedPercentage(node: NodeData): number {
  if (node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
  let used = 0
  switch (traffic_limit_type) {
    case 'up': used = net_total_up
      break
    case 'down': used = net_total_down
      break
    case 'min': used = Math.min(net_total_up, net_total_down)
      break
    case 'max': used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }
  return Math.min((used / node.traffic_limit) * 100, 100)
}

function formatOfflineTime(node: NodeData): string {
  return formatDateTime(node.time)
}

function getOfflineRelative(node: NodeData): string {
  const relative = formatRelativeTime(node.time, nodesStore.now)
  return relative === '-' ? '' : ` ${relative}`
}

function getPriceTags(node: NodeData) {
  return buildPriceTags(node, appStore.lang)
}

function getPriceTagClass(tone: 'danger' | 'warn' | 'normal'): string {
  if (tone === 'danger')
    return 'text-red-500 font-medium'
  if (tone === 'warn')
    return 'text-amber-500'
  return 'text-muted-foreground/70'
}

function togglePin(node: NodeData) {
  appStore.togglePinnedNode(node.uuid)
}

function getCustomTags(node: NodeData): Array<string> {
  return parseTags(node.tags).map(t => t.text)
}

// 点标签直接筛选同标签节点（再点一次取消）
function filterByTag(tag: string) {
  appStore.nodeSearchText = appStore.nodeSearchText === tag ? '' : tag
}
</script>

<template>
  <div v-if="isDesktop" class="overflow-x-auto overflow-y-hidden min-w-0 p-1 -m-1">
    <div class="min-w-fit w-full flex flex-col gap-1">
      <!-- 表头 -->
      <div class="grid p-2 glass-surface rounded-lg border border-border shadow-sm gap-2" :style="gridStyle">
        <div
          v-for="col in columns" :key="col.key"
          :class="[col.sortable ? 'cursor-pointer' : '', ['status', 'os'].includes(col.key) ? 'text-center' : 'text-left']"
          @click="handleSort(col)"
        >
          <span class="text-xs text-muted-foreground">
            {{ col.label }}{{ col.sortable && sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : '' }}
          </span>
        </div>
      </div>

      <TransitionGroup
        :appear="!appStore.disablePageAnimation"
        :css="!appStore.disablePageAnimation"
        name="node-row-switch"
        tag="div"
        class="flex flex-col gap-1"
      >
        <div
          v-for="(node, index) in sortedNodes"
          :key="getRowTransitionKey(node)"
          class="group flex flex-col relative h-14 justify-center px-2 cursor-pointer glass-surface rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-all"
          :class="[!node.online && '!shadow-red-600/10']"
          :style="getRowTransitionStyle(index)"
          @click="handleClick(node)"
        >
          <div class="grid gap-2 items-center" :style="gridStyle">
            <template v-for="col in columns" :key="col.key">
              <!-- 在线状态指示器 -->
              <div v-if="col.key === 'status'" class="flex justify-center">
                <div class="size-2 rounded-full relative" :class="[node.online ? 'bg-green-600' : 'bg-red-600']">
                  <div
                    class="animate-ping absolute inset-0 rounded-full opacity-50"
                    :class="[node.online ? 'bg-green-600' : 'bg-red-600']"
                  />
                </div>
              </div>

              <!-- 节点名称（标签并入第二行，不再占独立列） -->
              <div v-else-if="col.key === 'name'" class="space-y-0.5 min-w-0" :class="[!node.online && 'blur-sm opacity-30']">
                <div class="flex gap-1 items-center text-xs font-semibold">
                  <img
                    v-if="hasRegion(node.region)" :src="getFlagSrc(node.region)"
                    :alt="getRegionDisplayName(node.region)" class="size-5 rounded-sm"
                  >
                  <span class="truncate">{{ node.name }}</span>
                  <button
                    type="button" :aria-label="appStore.isNodePinned(node.uuid) ? '取消置顶' : '置顶'"
                    class="shrink-0 flex items-center transition-[color,opacity]"
                    :class="appStore.isNodePinned(node.uuid)
                      ? 'text-amber-400'
                      : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-amber-400'"
                    @click.stop="togglePin(node)"
                  >
                    <Icon :icon="appStore.isNodePinned(node.uuid) ? 'tabler:star-filled' : 'tabler:star'" width="12" height="12" />
                  </button>
                </div>
                <div
                  v-if="getPriceTags(node).length > 0 || getCustomTags(node).length > 0"
                  class="flex gap-1 items-center overflow-hidden whitespace-nowrap"
                >
                  <span
                    v-for="(tag, tagIndex) in getPriceTags(node)" :key="`price-${tagIndex}`"
                    class="text-[11px] shrink-0"
                    :class="getPriceTagClass(tag.tone)"
                  >
                    {{ tag.text }}
                  </span>
                  <Badge
                    v-for="(tag, tagIndex) in getCustomTags(node)" :key="`tag-${tagIndex}`" variant="outline"
                    class="!text-[10px] rounded text-muted-foreground border-muted-foreground/10 px-1 py-0 shrink-0 cursor-pointer transition-colors hover:text-foreground hover:border-muted-foreground/30"
                    :title="`筛选标签：${tag}`"
                    @click.stop="filterByTag(tag)"
                  >
                    {{ tag }}
                  </Badge>
                </div>
              </div>

              <!-- 运行时间 -->
              <div v-else-if="col.key === 'uptime'" class="flex flex-col gap-0.5">
                <span class="text-[10px] text-muted-foreground truncate">
                  {{ formatUptime(node.uptime ?? 0) }}
                </span>
                <CarrierLatency compact :uuid="node.uuid" :online="node.online" />
              </div>

              <!-- 操作系统 -->
              <div v-else-if="col.key === 'os'" class="flex justify-center">
                <img :src="getOSImage(node.os)" :alt="getOSName(node.os)" class="size-4">
              </div>

              <!-- CPU -->
              <div v-else-if="col.key === 'cpu'" class="min-w-0">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                    <span class="shrink-0">{{ (node.cpu ?? 0).toFixed(1) }}%</span>
                    <span class="truncate opacity-70">
                      {{ (node.load ?? 0).toFixed(2) }} {{ (node.load5 ?? 0).toFixed(2) }} {{ (node.load15 ?? 0).toFixed(2) }}
                    </span>
                  </div>
                  <ProgressThin :percentage="node.cpu ?? 0" :status="getStatus(node.cpu ?? 0)" :height="4" />
                </div>
              </div>

              <!-- 内存 -->
              <div v-else-if="col.key === 'mem'" class="min-w-0">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                    <span class="shrink-0">{{ ((node.ram ?? 0) / (node.mem_total || 1) * 100).toFixed(1) }}%</span>
                    <span class="truncate opacity-70">
                      {{ formatBytes(node.ram ?? 0) }} / {{ formatBytes(node.mem_total ?? 0) }}
                    </span>
                  </div>
                  <ProgressThin
                    :percentage="(node.ram ?? 0) / (node.mem_total || 1) * 100"
                    :status="getStatus((node.ram ?? 0) / (node.mem_total || 1) * 100)" :height="4"
                  />
                </div>
              </div>

              <!-- 硬盘 -->
              <div v-else-if="col.key === 'disk'" class="min-w-0">
                <div class="space-y-1">
                  <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                    <span class="shrink-0">{{ ((node.disk ?? 0) / (node.disk_total || 1) * 100).toFixed(1) }}%</span>
                    <span class="truncate opacity-70">
                      {{ formatBytes(node.disk ?? 0) }} / {{ formatBytes(node.disk_total ?? 0) }}
                    </span>
                  </div>
                  <ProgressThin
                    :percentage="(node.disk ?? 0) / (node.disk_total || 1) * 100"
                    :status="getStatus((node.disk ?? 0) / (node.disk_total || 1) * 100)" :height="4"
                  />
                </div>
              </div>

              <!-- 流量 -->
              <div v-else-if="col.key === 'traffic'" class="min-w-0">
                <DataTooltip placement="top" class="flex items-center gap-2" content-class="mb-1.5">
                  <div class="space-y-1 w-full">
                    <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                      <template v-if="showTrafficProgress(node)">
                        <span class="shrink-0">{{ getTrafficUsedPercentage(node).toFixed(1) }}%</span>
                        <span class="truncate opacity-70">
                          {{ formatBytes(getTrafficUsed(node)) }} / {{ formatBytes(node.traffic_limit) }}
                        </span>
                      </template>
                      <template v-else>
                        <span class="shrink-0">{{ formatBytes(getTrafficUsed(node)) }}</span>
                        <span class="opacity-70">∞</span>
                      </template>
                    </div>
                    <TrafficProgress
                      :upload="node.net_total_up ?? 0" :download="node.net_total_down ?? 0"
                      :traffic-limit="node.traffic_limit" :traffic-limit-type="(node.traffic_limit_type || 'sum')"
                      height="4px"
                    />
                  </div>
                  <template #content>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-up" width="12" height="12" />
                      {{ formatBytes(node.net_total_up ?? 0) }}
                    </span>
                    <span class="flex flex-row gap-0.5 items-center whitespace-nowrap">
                      <Icon icon="tabler:chevron-down" width="12" height="12" />
                      {{ formatBytes(node.net_total_down ?? 0) }}
                    </span>
                  </template>
                </DataTooltip>
              </div>

              <!-- 速率 -->
              <div v-else-if="col.key === 'rate'">
                <div class="text-[10px] flex flex-col ">
                  <span class="text-green-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-up" width="12" height="12" />
                    {{ formatBytesPerSecond(node.net_out ?? 0) }}
                  </span>
                  <span class="text-blue-600 flex flex-row gap-1 items-center">
                    <Icon icon="tabler:chevron-down" width="12" height="12" />
                    {{ formatBytesPerSecond(node.net_in ?? 0) }}
                  </span>
                </div>
              </div>
            </template>
          </div>

          <div
            v-if="!node.online" class="absolute inset-0 z-2 p-2 bg-background/10 rounded-lg flex items-center"
            aria-hidden="true"
          >
            <div class="grid gap-2 items-center justify-center" :style="gridStyle">
              <div class="h-full space-y-1" :style="offlineOverlayContentStyle">
                <div class="text-sm font-semibold truncate">
                  <span class="text-red-500">离线{{ getOfflineRelative(node) }}</span> {{ node.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatOfflineTime(node) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>

  <!-- 移动端：紧凑行布局，全部信息纵向排布，无横向滚动 -->
  <div v-else class="flex flex-col gap-2 min-w-0">
    <!-- 排序 chips -->
    <div class="sort-chips flex gap-1 overflow-x-auto">
      <button
        v-for="col in mobileSortOptions" :key="col.key" type="button"
        class="shrink-0 h-6 px-2 rounded-md text-[11px] glass-surface border border-border transition-colors"
        :class="[sortKey === col.key ? 'text-green-600 bg-background/70' : 'text-muted-foreground']"
        @click="handleSort(col)"
      >
        {{ col.label }}{{ sortKey === col.key ? (sortDir === 1 ? ' ↑' : ' ↓') : '' }}
      </button>
    </div>

    <TransitionGroup
      :appear="!appStore.disablePageAnimation"
      :css="!appStore.disablePageAnimation"
      name="node-row-switch"
      tag="div"
      class="flex flex-col gap-1.5"
    >
      <div
        v-for="(node, index) in sortedNodes"
        :key="getRowTransitionKey(node)"
        class="relative p-2.5 cursor-pointer glass-surface rounded-lg border border-border active:bg-accent transition-all"
        :class="[!node.online && '!shadow-red-600/10']"
        :style="getRowTransitionStyle(index)"
        @click="handleClick(node)"
      >
        <div class="flex flex-col gap-1.5" :class="[!node.online && 'blur-sm opacity-30']">
          <!-- 第一行：状态 + 旗帜 + 系统 + 名称 | 实时速率 -->
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-2 rounded-full relative shrink-0" :class="[node.online ? 'bg-green-600' : 'bg-red-600']">
              <div
                class="animate-ping absolute inset-0 rounded-full opacity-50"
                :class="[node.online ? 'bg-green-600' : 'bg-red-600']"
              />
            </div>
            <img
              v-if="hasRegion(node.region)" :src="getFlagSrc(node.region)"
              :alt="getRegionDisplayName(node.region)" class="size-5 rounded-sm shrink-0"
            >
            <img :src="getOSImage(node.os)" :alt="getOSName(node.os)" class="size-4 shrink-0">
            <span class="truncate text-xs font-semibold flex-1 min-w-0">{{ node.name }}</span>
            <button
              type="button" :aria-label="appStore.isNodePinned(node.uuid) ? '取消置顶' : '置顶'"
              class="shrink-0 flex items-center p-0.5"
              :class="appStore.isNodePinned(node.uuid) ? 'text-amber-400' : 'text-muted-foreground/30'"
              @click.stop="togglePin(node)"
            >
              <Icon :icon="appStore.isNodePinned(node.uuid) ? 'tabler:star-filled' : 'tabler:star'" width="13" height="13" />
            </button>
            <span class="text-[10px] shrink-0 flex items-center gap-1.5">
              <span class="text-green-600 flex items-center gap-0.5">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytesPerSecond(node.net_out ?? 0) }}
              </span>
              <span class="text-blue-600 flex items-center gap-0.5">
                <Icon icon="tabler:chevron-down" width="12" height="12" />
                {{ formatBytesPerSecond(node.net_in ?? 0) }}
              </span>
            </span>
          </div>

          <!-- 第二行：价格/自定义标签（有则显示） -->
          <div
            v-if="getPriceTags(node).length > 0 || getCustomTags(node).length > 0"
            class="flex gap-1 items-center overflow-hidden whitespace-nowrap"
          >
            <span
              v-for="(tag, tagIndex) in getPriceTags(node)" :key="`price-${tagIndex}`"
              class="text-[11px] shrink-0"
              :class="getPriceTagClass(tag.tone)"
            >
              {{ tag.text }}
            </span>
            <Badge
              v-for="(tag, tagIndex) in getCustomTags(node)" :key="`tag-${tagIndex}`" variant="outline"
              class="!text-[10px] rounded text-muted-foreground border-muted-foreground/10 px-1 py-0 shrink-0 cursor-pointer transition-colors hover:text-foreground hover:border-muted-foreground/30"
              :title="`筛选标签：${tag}`"
              @click.stop="filterByTag(tag)"
            >
              {{ tag }}
            </Badge>
          </div>

          <!-- 第三行：四个迷你仪表 -->
          <div class="grid grid-cols-4 gap-2">
            <div class="space-y-1 min-w-0">
              <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                <span class="shrink-0">CPU</span>
                <span class="truncate">{{ (node.cpu ?? 0).toFixed(0) }}%</span>
              </div>
              <ProgressThin :percentage="node.cpu ?? 0" :status="getStatus(node.cpu ?? 0)" :height="4" />
            </div>
            <div class="space-y-1 min-w-0">
              <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                <span class="shrink-0">内存</span>
                <span class="truncate">{{ ((node.ram ?? 0) / (node.mem_total || 1) * 100).toFixed(0) }}%</span>
              </div>
              <ProgressThin
                :percentage="(node.ram ?? 0) / (node.mem_total || 1) * 100"
                :status="getStatus((node.ram ?? 0) / (node.mem_total || 1) * 100)" :height="4"
              />
            </div>
            <div class="space-y-1 min-w-0">
              <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                <span class="shrink-0">硬盘</span>
                <span class="truncate">{{ ((node.disk ?? 0) / (node.disk_total || 1) * 100).toFixed(0) }}%</span>
              </div>
              <ProgressThin
                :percentage="(node.disk ?? 0) / (node.disk_total || 1) * 100"
                :status="getStatus((node.disk ?? 0) / (node.disk_total || 1) * 100)" :height="4"
              />
            </div>
            <div class="space-y-1 min-w-0">
              <div class="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                <span class="shrink-0">流量</span>
                <span v-if="showTrafficProgress(node)" class="truncate">{{ getTrafficUsedPercentage(node).toFixed(0) }}%</span>
                <span v-else class="truncate">{{ formatBytes(getTrafficUsed(node)) }}</span>
              </div>
              <TrafficProgress
                :upload="node.net_total_up ?? 0" :download="node.net_total_down ?? 0"
                :traffic-limit="node.traffic_limit" :traffic-limit-type="(node.traffic_limit_type || 'sum')"
                height="4px"
              />
            </div>
          </div>

          <!-- 第四行：运行时间 + 三网延迟 -->
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] text-muted-foreground shrink-0">
              {{ formatUptime(node.uptime ?? 0) }}
            </span>
            <div class="flex-1 min-w-0">
              <CarrierLatency compact :uuid="node.uuid" :online="node.online" />
            </div>
          </div>
        </div>

        <div
          v-if="!node.online" class="absolute inset-0 z-2 p-2 bg-background/10 rounded-lg flex flex-col items-center justify-center gap-0.5"
          aria-hidden="true"
        >
          <div class="text-sm font-semibold truncate max-w-full">
            <span class="text-red-500">离线{{ getOfflineRelative(node) }}</span> {{ node.name }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ formatOfflineTime(node) }}
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.sort-chips {
  scrollbar-width: none;
}

.sort-chips::-webkit-scrollbar {
  display: none;
}

.node-row-switch-enter-active,
.node-row-switch-leave-active {
  transition:
    opacity 170ms ease,
    transform 210ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 170ms ease;
}

.node-row-switch-enter-active {
  transition-delay: var(--node-row-delay, 0ms);
}

.node-row-switch-move {
  transition: transform 210ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-row-switch-enter-from {
  opacity: 0;
  transform: translateY(8px);
  filter: blur(3px);
}

.node-row-switch-leave-to {
  opacity: 0;
  transform: translateY(-5px);
  filter: blur(2px);
}

/* 移动端进场不做 filter blur（同 HomeView 卡片过渡） */
@media (max-width: 767px) {
  .node-row-switch-enter-from,
  .node-row-switch-leave-to {
    filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-row-switch-enter-active,
  .node-row-switch-leave-active,
  .node-row-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-row-switch-enter-from,
  .node-row-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
