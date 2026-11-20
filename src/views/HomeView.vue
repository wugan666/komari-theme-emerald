<script setup lang="ts">
import type { NodeHealthFilter } from '@/utils/nodeHealth'
import { Icon } from '@iconify/vue'
import { useDebounceFn, useNow } from '@vueuse/core'
import { computed, defineAsyncComponent, nextTick, onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/stores/app'
import { useCarrierPingStore } from '@/stores/carrierPing'
import { useNodesStore } from '@/stores/nodes'
import { useReturnRoutesStore } from '@/stores/returnRoutes'
import { getCountryCodeFromRegion } from '@/utils/geoHelper'
import { isNodeInGroup, parseNodeGroups } from '@/utils/groupHelper'
import { matchesNodeHealth, NODE_HEALTH_FILTERS } from '@/utils/nodeHealth'
import { applyOfflineLast, applyPinnedFirst, NODE_SORT_OPTIONS, sortNodes } from '@/utils/nodeSortHelper'
import { getRegionDisplayName, isRegionMatch } from '@/utils/regionHelper'

defineOptions({ name: 'HomeView' })

const NodeCard = defineAsyncComponent(() => import('@/components/NodeCard.vue'))
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const NodeList = defineAsyncComponent(() => import('@/components/NodeList.vue'))
const VisitorInfoCard = defineAsyncComponent(() => import('@/components/VisitorInfoCard.vue'))
const ReturnRouteFleet = defineAsyncComponent(() => import('@/components/ReturnRouteFleet.vue'))

const nodeItemStaggerMs = 35
const nodeItemStaggerLimit = 12

const appStore = useAppStore()
const nodesStore = useNodesStore()
const router = useRouter()
const carrierPing = useCarrierPingStore()
const returnRoutes = useReturnRoutesStore()
onMounted(returnRoutes.start)
onActivated(returnRoutes.start)
onDeactivated(returnRoutes.stop)
onScopeDispose(returnRoutes.stop)
onMounted(carrierPing.start)
onActivated(carrierPing.start)
onDeactivated(carrierPing.stop)
onScopeDispose(carrierPing.stop)

onActivated(() => {
  if (appStore.homeScrollPosition > 0) {
    nextTick(() => {
      window.scrollTo({ top: appStore.homeScrollPosition, behavior: 'instant' })
    })
  }
})

onDeactivated(() => {
  appStore.homeScrollPosition = window.scrollY
})

// 搜索词在 appStore（标签点击筛选需要跨组件写入）
const debouncedSearchText = ref('')

const updateDebouncedSearch = useDebounceFn((value: string) => {
  debouncedSearchText.value = value
}, 300)

watch(() => appStore.nodeSearchText, (value) => {
  updateDebouncedSearch(value)
}, { immediate: true })

const groups = computed(() => [
  { tab: '全部节点', name: 'all', count: nodesStore.nodes.length },
  ...nodesStore.groups.map(g => ({
    tab: g,
    name: g,
    count: nodesStore.nodes.filter(node => isNodeInGroup(node.group, g)).length,
  })),
])

// 按国家/地区聚合
const regionGroups = computed(() => {
  const regionMap = new Map<string, { emoji: string, name: string, count: number }>()
  for (const node of nodesStore.nodes) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    const emoji = node.region.trim()
    if (!regionMap.has(code)) {
      regionMap.set(code, { emoji, name: getRegionDisplayName(emoji), count: 0 })
    }
    regionMap.get(code)!.count++
  }
  // 按节点数量降序排列
  return Array.from(regionMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, info]) => ({ tab: info.name, name: `region:${code}`, code, count: info.count }))
})

const allTabs = computed(() => [
  ...groups.value,
  ...regionGroups.value,
])

watch(
  () => [nodesStore.groups, regionGroups.value] as const,
  ([gs]) => {
    const cur = appStore.nodeSelectedGroup
    if (cur === 'all')
      return
    if (cur.startsWith('region:')) {
      // region tab 失效时回退
      if (!regionGroups.value.some(r => r.name === cur)) {
        appStore.nodeSelectedGroup = 'all'
      }
      return
    }
    if (!gs.includes(cur)) {
      appStore.nodeSelectedGroup = 'all'
    }
  },
  { immediate: true },
)

function isNodeMatchSearch(node: typeof nodesStore.nodes[number], search: string): boolean {
  if (!search.trim())
    return true
  const lowerSearch = search.toLowerCase().trim()
  if (node.name.toLowerCase().includes(lowerSearch))
    return true
  if (node.region && isRegionMatch(node.region, search))
    return true
  if (node.os && node.os.toLowerCase().includes(lowerSearch))
    return true
  if (parseNodeGroups(node.group).some(group => group.toLowerCase().includes(lowerSearch)))
    return true
  if (node.tags && node.tags.toLowerCase().includes(lowerSearch))
    return true
  if (node.remark && node.remark.toLowerCase().includes(lowerSearch))
    return true
  return false
}

const groupNodeList = computed(() => {
  const selected = appStore.nodeSelectedGroup
  if (selected.startsWith('region:')) {
    const code = selected.slice(7) // "region:US" → "US"
    return nodesStore.nodes.filter(node => getCountryCodeFromRegion(node.region) === code)
  }
  return nodesStore.nodes.filter(node => isNodeInGroup(node.group, selected))
})

// 卡片视图的排序（列表视图由 NodeList 自己的表头/chips 排序）
const cardSortKey = ref('')
const cardSortDir = ref<1 | -1>(1)

// 紧凑密度下收窄卡片最小宽度，同屏多排一列
const cardGridMinWidth = computed(() =>
  appStore.cardDensity === 'compact' ? Math.min(appStore.nodeCardMinWidth, 250) : appStore.nodeCardMinWidth,
)

const onlineCount = computed(() => nodesStore.nodes.filter(node => node.online).length)
const healthFilter = ref<NodeHealthFilter>('all')
const now = useNow({ interval: 60000 })
const searchedNodes = computed(() => groupNodeList.value.filter(n => isNodeMatchSearch(n, debouncedSearchText.value)))
const healthFilters = computed(() => NODE_HEALTH_FILTERS.map(filter => ({
  ...filter,
  count: searchedNodes.value.filter(node => matchesNodeHealth(node, filter.key, now.value.getTime())).length,
})))

const nodeList = computed(() => {
  const filtered = searchedNodes.value.filter(node => matchesNodeHealth(node, healthFilter.value, now.value.getTime()))
  if (appStore.nodeViewMode === 'card')
    return applyOfflineLast(applyPinnedFirst(sortNodes(filtered, cardSortKey.value, cardSortDir.value), appStore.pinnedNodes))
  return filtered
})

function handleNodeClick(node: typeof nodesStore.nodes[number]) {
  router.push({ name: 'instance-detail', params: { id: node.uuid } })
}

function getNodeItemTransitionKey(node: typeof nodesStore.nodes[number]): string {
  return `${appStore.nodeSelectedGroup}-${node.uuid}`
}

function getNodeItemTransitionStyle(index: number): Record<string, string> {
  return {
    '--node-item-delay': `${Math.min(index, nodeItemStaggerLimit) * nodeItemStaggerMs}ms`,
  }
}
</script>

<template>
  <div class="home-view py-6">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3 px-4">
      <div>
        <h1 class="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <span class="inline-block h-6 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-teal-600" />
          节点概览
        </h1>
        <p class="mt-1.5 text-xs text-muted-foreground">
          资源用量、网络状态与三网延迟
        </p>
      </div>
      <div class="flex items-center gap-4 text-xs">
        <span class="flex items-center gap-1.5 text-primary"><span class="size-1.5 rounded-full bg-current" />{{ onlineCount }} 在线</span>
        <span class="text-muted-foreground">{{ nodesStore.nodes.length - onlineCount }} 离线</span>
        <span class="border-l border-border pl-4 text-muted-foreground">共 {{ nodesStore.nodes.length }} 个节点</span>
      </div>
    </div>
    <div v-if="appStore.alertEnabled && appStore.alertContent" class="alert px-4">
      <Alert class="border-none bg-card rounded-lg border border-border shadow-sm">
        <AlertTitle v-if="appStore.alertTitle">
          {{ appStore.alertTitle }}
        </AlertTitle>
        <AlertDescription>
          <MarkdownRenderer :content="appStore.alertContent" />
        </AlertDescription>
      </Alert>
    </div>

    <NodeGeneralCards
      v-if="!appStore.hideGeneralCard"
      :nodes="groupNodeList"
      :globe-nodes="groupNodeList"
    />

    <div class="node-info px-4 flex flex-col gap-4">
      <div class="nodes">
        <Tabs v-model="appStore.nodeSelectedGroup" class="w-full flex-col gap-4">
          <ReturnRouteFleet v-if="appStore.isLoggedIn" :nodes="nodeList" />
          <div class="filter-panel rounded-2xl border border-white/70 dark:border-white/10 glass-surface p-3 sm:p-4">
            <div class="flex flex-wrap items-center gap-3">
              <div class="relative min-w-0 flex-1 basis-48">
                <Input v-model="appStore.nodeSearchText" aria-label="搜索节点" placeholder="搜索名称、地区、系统或标签" class="h-9 bg-background pl-9 pr-8 text-sm shadow-none" />
                <Icon icon="tabler:search" width="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <button v-if="appStore.nodeSearchText" type="button" aria-label="清除搜索" class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" @click="appStore.nodeSearchText = ''">
                  <Icon icon="tabler:x" width="14" />
                </button>
              </div>
              <div class="flex items-center gap-1 rounded-lg bg-muted p-1">
                <Button variant="ghost" size="icon-sm" aria-label="卡片视图" :aria-pressed="appStore.nodeViewMode === 'card'" :class="appStore.nodeViewMode === 'card' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'" @click="appStore.nodeViewMode = 'card'">
                  <Icon icon="tabler:layout-grid" width="16" />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="列表视图" :aria-pressed="appStore.nodeViewMode === 'list'" :class="appStore.nodeViewMode === 'list' ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'" @click="appStore.nodeViewMode = 'list'">
                  <Icon icon="tabler:table" width="16" />
                </Button>
                <Button v-if="appStore.nodeViewMode === 'card'" variant="ghost" size="icon-sm" :aria-label="appStore.cardDensity === 'compact' ? '切换为舒适密度' : '切换为紧凑密度'" class="text-muted-foreground" @click="appStore.toggleCardDensity()">
                  <Icon :icon="appStore.cardDensity === 'compact' ? 'tabler:baseline-density-small' : 'tabler:baseline-density-medium'" width="16" />
                </Button>
              </div>
            </div>
            <div class="mt-3 overflow-x-auto">
              <TabsList class="h-auto w-max justify-start gap-1 rounded-none bg-transparent p-0">
                <TabsTrigger v-for="g in allTabs" :key="g.name" :value="g.name" class="h-8 shrink-0 rounded-md border-0 px-2.5 text-xs text-muted-foreground shadow-none data-[state=active]:!bg-primary/10 data-[state=active]:!text-primary data-[state=active]:shadow-none">
                  <img v-if="g.name.startsWith('region:')" :src="`/images/flags/${g.name.slice(7)}.svg`" alt="" class="mr-1 size-3.5">
                  {{ g.tab }}<span class="ml-1 text-[11px] opacity-70">{{ g.count }}</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3" role="group" aria-label="节点状态筛选">
              <button v-for="filter in healthFilters" :key="filter.key" type="button" :aria-pressed="healthFilter === filter.key" :title="filter.hint" class="rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" :class="healthFilter === filter.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'" @click="healthFilter = filter.key">
                {{ filter.label }}<span class="ml-1.5 opacity-70">{{ filter.count }}</span>
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-3 text-xs text-muted-foreground">
            <span class="mr-auto">显示 <strong class="font-medium text-foreground">{{ nodeList.length }}</strong> 个节点</span>
            <div class="flex items-center gap-2">
              <label for="ping-region">三网测点</label>
              <select id="ping-region" v-model="carrierPing.selectedRegion" aria-label="延迟测点地区" :disabled="!carrierPing.regions.length" class="h-8 rounded-md border border-border bg-card px-2 text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                <option v-if="!carrierPing.regions.length" value="">
                  {{ carrierPing.loading ? '加载中' : '暂无测点' }}
                </option>
                <option v-for="region in carrierPing.regions" :key="region" :value="region">
                  {{ region }}
                </option>
              </select>
              <span class="hidden sm:inline">近 5 分钟均值</span>
            </div>
            <div v-if="appStore.nodeViewMode === 'card'" class="flex items-center gap-1.5">
              <select v-model="cardSortKey" aria-label="节点排序" class="h-8 rounded-md border border-border bg-card px-2 text-foreground focus-visible:outline-2 focus-visible:outline-primary">
                <option value="">
                  默认排序
                </option>
                <option v-for="opt in NODE_SORT_OPTIONS" :key="opt.key" :value="opt.key">
                  {{ opt.label }}
                </option>
              </select>
              <Button v-if="cardSortKey" variant="outline" size="icon-sm" :aria-label="cardSortDir === 1 ? '切换为降序' : '切换为升序'" @click="cardSortDir = cardSortDir === 1 ? -1 : 1">
                <Icon :icon="cardSortDir === 1 ? 'tabler:sort-ascending' : 'tabler:sort-descending'" width="14" />
              </Button>
            </div>
          </div>
          <TabsContent v-for="g in allTabs" :key="g.name" :value="g.name" class="pointer-events-auto">
            <TransitionGroup
              v-if="nodeList.length !== 0 && appStore.nodeViewMode === 'card'"
              :appear="!appStore.disablePageAnimation"
              :css="!appStore.disablePageAnimation"
              name="node-card-switch"
              tag="div"
              class="grid grid-cols-1"
              :class="appStore.cardDensity === 'compact' ? 'gap-3' : 'gap-4'"
              :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardGridMinWidth}px, 100%), 1fr))` }"
            >
              <div
                v-for="(node, index) in nodeList"
                :key="getNodeItemTransitionKey(node)"
                class="node-card-cell min-w-0"
                :style="getNodeItemTransitionStyle(index)"
              >
                <NodeCard :node="node" @click="handleNodeClick(node)" />
              </div>
            </TransitionGroup>
            <NodeList
              v-else-if="nodeList.length !== 0 && appStore.nodeViewMode === 'list'"
              :nodes="nodeList"
              :transition-key="appStore.nodeSelectedGroup"
              @click="handleNodeClick"
            />
            <div v-else class="text-muted-foreground text-center py-8">
              <Empty description="暂无节点" />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    <div class="mt-6">
      <VisitorInfoCard v-if="appStore.visitorInfoCardEnabled" />
    </div>
  </div>
</template>

<style scoped>
.node-card-switch-enter-active,
.node-card-switch-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 180ms ease;
}

.node-card-switch-enter-active {
  transition-delay: var(--node-item-delay, 0ms);
}

.node-card-switch-move {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.node-card-switch-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  filter: blur(3px);
}

.node-card-switch-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
  filter: blur(2px);
}

/* 移动端进场不做 filter blur：打开瞬间 GPU 最挤，模糊过渡纯增负担 */
@media (max-width: 767px) {
  .node-card-switch-enter-from,
  .node-card-switch-leave-to {
    filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .node-card-switch-enter-active,
  .node-card-switch-leave-active,
  .node-card-switch-move {
    transition: none;
    transition-delay: 0ms;
  }

  .node-card-switch-enter-from,
  .node-card-switch-leave-to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
</style>
