<script setup lang="ts">
import type { CarrierTrendPoint } from '@/utils/carrierPing'
import { computed, useId } from 'vue'

const props = defineProps<{ points: CarrierTrendPoint[], ceiling: number, name: string }>()
const gradient = useId()
const coordinates = computed(() => props.points.map((p, i) => ({
  x: 2 + i / Math.max(1, props.points.length - 1) * 96,
  y: p.latency === null ? null : 30 - Math.min(1, p.latency / props.ceiling) * 26,
  ...p,
})))
const segments = computed(() => {
  const paths: { line: string, area: string }[] = []
  let segment: { x: number, y: number }[] = []
  let lastTime = 0
  function flush() {
    if (!segment.length)
      return
    const first = segment[0]!
    const last = segment.at(-1)!
    const line = segment.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    paths.push({ line, area: `${line} L${last.x},33 L${first.x},33 Z` })
    segment = []
  }
  for (const p of coordinates.value) {
    if (p.y === null) {
      if (p.loss !== null && p.loss > 0)
        flush()
      continue
    }
    if (lastTime && p.time - lastTime > 3.5 * 60_000)
      flush()
    segment.push({ x: p.x, y: p.y })
    lastTime = p.time
  }
  flush()
  return paths
})
const samples = computed(() => coordinates.value.filter(p => p.y !== null))
const losses = computed(() => coordinates.value.filter(p => p.loss !== null && p.loss > 0))
</script>

<template>
  <svg viewBox="0 0 100 42" preserveAspectRatio="none" class="block h-10 w-full overflow-visible" role="img" :aria-label="`${name}近 30 分钟延迟趋势，纵轴 0 到 ${ceiling} 毫秒，底部红条表示丢包，短暂缺测连接前后实测点，丢包和长时间缺测留空`" data-carrier-chart>
    <title>{{ name }}近 30 分钟延迟趋势；底部红条表示丢包，短暂缺测连接前后实测点，丢包和长时间缺测留空。</title>
    <defs><linearGradient :id="gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity="0.23" /><stop offset="100%" stop-color="currentColor" stop-opacity="0.015" /></linearGradient></defs>
    <path d="M0,4 H100 M0,17 H100 M0,30 H100" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="0.5" stroke-dasharray="2 3" />
    <template v-for="(segment, i) in segments" :key="i">
      <path :d="segment.area" :fill="`url(#${gradient})`" />
      <path :d="segment.line" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </template>
    <circle v-for="point in samples" :key="point.time" :cx="point.x" :cy="point.y!" r="1.1" fill="currentColor" />
    <rect v-for="point in losses" :key="point.time" :x="point.x - 1" :y="42 - Math.max(2, point.loss! / 100 * 7)" width="2" :height="Math.max(2, point.loss! / 100 * 7)" rx="0.5" class="fill-destructive" />
  </svg>
</template>
