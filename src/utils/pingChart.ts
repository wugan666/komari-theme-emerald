import { cutPeakValues } from './recordHelper'

export interface PingChartRecord {
  task_id: number
  time: string
  value: number | null
  loss?: number
}

interface PingMetricPoint {
  time: string
  value: number | null
  count: number
}

export interface PingMetricSeries {
  entity_id: string
  metric_key: 'ping.latency_ms' | 'ping.loss'
  tags?: Record<string, string>
  downsampled?: boolean
  interval_seconds?: number
  points: PingMetricPoint[]
}

/** Latency averages include -1 for failures; pair loss before recovering successful latency. */
export function normalizePingMetricSeries(series: PingMetricSeries[], entityId: string): PingChartRecord[] {
  interface Bucket { latency?: PingMetricPoint, loss?: PingMetricPoint }
  const tasks = new Map<number, Map<number, Bucket>>()
  for (const item of series) {
    const taskId = Number(item.tags?.task_id)
    if (item.entity_id !== entityId || !Number.isInteger(taskId))
      continue
    const buckets = tasks.get(taskId) ?? new Map<number, Bucket>()
    tasks.set(taskId, buckets)
    for (const point of item.points) {
      const time = Date.parse(point.time)
      if (!Number.isFinite(time))
        continue
      const bucket = buckets.get(time) ?? {}
      const key = item.metric_key === 'ping.latency_ms' ? 'latency' : 'loss'
      // Boundary nulls have no samples and must not erase a duplicate real bucket.
      if (!bucket[key] || (point.value !== null && point.count > 0))
        bucket[key] = point
      buckets.set(time, bucket)
    }
  }

  const records: PingChartRecord[] = []
  for (const [taskId, buckets] of tasks) {
    for (const [time, bucket] of buckets) {
      const latency = bucket.latency
      const lossPoint = bucket.loss
      const loss = lossPoint && Number.isSafeInteger(lossPoint.count) && lossPoint.count > 0
        && lossPoint.value !== null && Number.isFinite(lossPoint.value) && lossPoint.value >= 0 && lossPoint.value <= 1
        ? lossPoint.value
        : undefined
      if (!latency && loss === undefined)
        continue
      let value: number | null = null
      if (latency && latency.value !== null && Number.isFinite(latency.value) && latency.value >= -1
        && Number.isSafeInteger(latency.count) && latency.count > 0 && loss !== 1) {
        if (loss !== undefined && latency.count === lossPoint?.count) {
          const successfulAverage = (latency.value + loss) / (1 - loss)
          if (Number.isFinite(successfulAverage) && successfulAverage >= 0)
            value = successfulAverage
        }
        else if (latency.count === 1 && latency.value >= 0) {
          // A single successful probe is already an exact latency without a pair.
          value = latency.value
        }
      }
      records.push({
        task_id: taskId,
        time: new Date(time).toISOString(),
        value,
        loss: loss ?? (latency?.value === -1 && latency.count > 0 ? 1 : undefined),
      })
    }
  }
  return records.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

export interface PingChartTask {
  id: number
  interval: number
  metricInterval?: number
}

export type PingChartPoint = [time: number, value: number | null]

export interface PingChartData {
  points: PingChartPoint[]
  lossTimes: number[]
}

/** Statistics are scoped independently from the chart query. */
export function selectPingTaskStats<T extends { entity_id: string, task_id: string }>(stats: T[], entityId: string): T[] {
  const selected = new Map<number, T>()
  for (const task of stats) {
    const taskId = Number(task.task_id)
    if (task.entity_id === entityId && Number.isInteger(taskId))
      selected.set(taskId, task)
  }
  return [...selected.values()]
}

function smoothSegments(points: PingChartPoint[]): PingChartPoint[] {
  const output: PingChartPoint[] = []
  let segment: PingChartPoint[] = []
  const flush = () => {
    const smoothed = cutPeakValues(segment.map(([, value]) => ({ value })), ['value'])
    output.push(...segment.map(([time, value], index): PingChartPoint => [time, smoothed[index]?.value ?? value]))
    segment = []
  }
  for (const point of points) {
    if (point[1] === null) {
      flush()
      output.push(point)
    }
    else {
      segment.push(point)
    }
  }
  flush()
  return output
}

/** Each task owns its timestamps: another task's sample is never a missing point. */
export function buildPingChartData(records: PingChartRecord[], tasks: PingChartTask[], smooth = false): Map<number, PingChartData> {
  const byTask = new Map<number, Map<number, { value: number | null, loss: boolean, failed: boolean }>>()
  for (const record of records) {
    const time = Date.parse(record.time)
    if (!Number.isFinite(time))
      continue
    let samples = byTask.get(record.task_id)
    if (!samples) {
      samples = new Map()
      byTask.set(record.task_id, samples)
    }
    const failed = record.loss === 1 || (record.value !== null && record.value < 0)
    const loss = failed || (record.loss !== undefined && record.loss > 0)
    const value = record.value !== null && Number.isFinite(record.value) && !failed ? record.value : null
    const previous = samples.get(time)
    // An explicit failed probe wins; a synthesized null must not erase a sample.
    if (!previous || failed || (!previous.failed && value !== null))
      samples.set(time, { value, loss: loss || previous?.loss || false, failed })
    else if (loss)
      previous.loss = true
  }

  const result = new Map<number, PingChartData>()
  for (const task of tasks) {
    const samples = [...(byTask.get(task.id)?.entries() ?? [])].sort(([a], [b]) => a - b)
    const cadence = Math.max(
      Number.isFinite(task.interval) ? task.interval : 0,
      Number.isFinite(task.metricInterval) ? task.metricInterval ?? 0 : 0,
      1,
    ) * 1000
    const points: PingChartPoint[] = []
    const lossTimes: number[] = []
    for (const [time, sample] of samples) {
      // Empty buckets caused by timestamp jitter are not failed probes.
      if (sample.value === null && !sample.failed && !sample.loss)
        continue
      const previous = points.at(-1)
      if (previous && previous[1] !== null && sample.value !== null && time - previous[0] > cadence * 3.5)
        points.push([previous[0] + cadence, null])
      points.push([time, sample.value])
      if (sample.loss)
        lossTimes.push(time)
    }
    result.set(task.id, { points: smooth ? smoothSegments(points) : points, lossTimes })
  }
  return result
}
