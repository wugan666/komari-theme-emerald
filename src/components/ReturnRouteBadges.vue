<script setup lang="ts">
import { computed } from 'vue'
import { useNodesStore } from '@/stores/nodes'
import { useReturnRoutesStore } from '@/stores/returnRoutes'
import { formatDateTime } from '@/utils/helper'
import { carrierNames, cityName, routeTone } from '@/utils/returnRoute'

const props = defineProps<{ uuid: string }>()
const routes = useReturnRoutesStore()
const nodes = useNodesStore()
const snapshot = computed(() => routes.summaries[props.uuid])
const stale = computed(() => snapshot.value && nodes.now.getTime() - Date.parse(snapshot.value.measured_at) > 7 * 86400_000)
</script>

<template>
  <div v-if="snapshot" class="space-y-1.5 border-t border-border/60 pt-2">
    <div class="flex items-center justify-between text-[10px] text-muted-foreground">
      <span>三网回程 · {{ cityName(snapshot.city) }}</span>
      <span :title="formatDateTime(snapshot.measured_at)">{{ stale ? '超过 7 天' : '最近采集' }}</span>
    </div>
    <div class="flex flex-wrap gap-1">
      <span
        v-for="route in snapshot.routes" :key="route.carrier"
        class="rounded-md border px-1.5 py-0.5 text-[10px] leading-4"
        :class="routeTone(route)"
        :title="`${route.classification.evidence} · ${formatDateTime(snapshot.measured_at)}`"
      >
        {{ route.classification.confidence === 'inconclusive' ? `${carrierNames[route.carrier]}未识别` : route.classification.label }}
      </span>
    </div>
  </div>
</template>
