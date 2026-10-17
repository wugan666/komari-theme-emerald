import { getSharedRpc } from '@/utils/rpc'

export type RouteCity = 'beijing' | 'shanghai' | 'guangzhou'
export type RouteCarrier = 'CT' | 'CU' | 'CM'

export const routeCities: { id: RouteCity, name: string }[] = [
  { id: 'beijing', name: '北京' },
  { id: 'shanghai', name: '上海' },
  { id: 'guangzhou', name: '广州' },
]
export const carrierNames: Record<RouteCarrier, string> = { CT: '电信', CU: '联通', CM: '移动' }

export interface ReturnHop {
  ttl: number
  ip?: string
  rtt_ms?: number
  asn?: string
}
export interface ReturnRoute {
  carrier: RouteCarrier
  target: string
  reached: boolean
  hops?: ReturnHop[]
  error?: string
  classification: {
    code: string
    label: string
    grade?: string
    confidence: 'confirmed' | 'mixed' | 'inconclusive'
    evidence: string
  }
  changed_from?: string
}
export interface RouteSnapshot {
  id: string
  city: RouteCity
  measured_at: string
  routes: ReturnRoute[]
}
export interface RouteAttempt {
  id: string
  state: 'pending' | 'complete' | 'failed'
  started_at: string
  finished_at?: string
  error?: string
  routes?: ReturnRoute[]
}
export interface RouteDetail {
  city: RouteCity
  latest_attempt: RouteAttempt | null
  snapshot: RouteSnapshot | null
  history: RouteAttempt[]
  history_limit: number
  cooldown_seconds: number
}

export function readRouteSummaries(uuids: string[], signal: AbortSignal) {
  return getSharedRpc().getClient().call<{ nodes: Record<string, RouteSnapshot> }>('public:getReturnRouteSummary', { uuids }, { signal })
}
export function readReturnRoute(uuid: string, city: RouteCity, id: string, signal: AbortSignal) {
  return getSharedRpc().getClient().call<RouteDetail>('public:getReturnRouteHistory', { uuid, city, id }, { signal })
}
export function collectReturnRoute(uuid: string, city: RouteCity, signal: AbortSignal) {
  return getSharedRpc().getClient().call<RouteAttempt>('admin:probeReturnRoute', { uuid, city }, { signal })
}

export function cityName(city: string) {
  return routeCities.find(value => value.id === city)?.name ?? city
}

export function routeTone(route: ReturnRoute) {
  if (route.classification.confidence === 'inconclusive')
    return 'bg-muted/70 text-muted-foreground border-border'
  if (route.classification.confidence === 'mixed')
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
  if (route.classification.grade === '精品')
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
  return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
}

const failureMessages: Record<string, string> = {
  remote_control_disabled: '此节点已关闭远程控制，无法通过 Agent 发起检测。',
  python_missing: '节点缺少 Python 3，安装后可重新检测。',
  permission_denied: '节点进程没有原始 ICMP 权限，需要 root 或 CAP_NET_RAW。',
  network_unavailable: '节点无法发出探测包，请检查网络和 ICMP 策略。',
  destination_unreachable: '网络设备返回目标不可达，已保留此前收到的跳点。',
  unsupported_platform: '目前支持 Linux 节点的 IPv4 回程检测。',
  no_reply: '未收到有效跳点响应，暂时无法判定线路。',
  timed_out: '节点未在两分钟内回报结果，请确认 Agent 的连接状态。',
  offline: '节点当前离线，已保存的结果仍可查看。',
  collection_failed: '节点采集没有完成，请检查 Agent 的运行状态。',
  invalid_report: '节点返回的结果无法解析，未覆盖已有记录。',
}

export function routeFailure(code?: string) {
  return failureMessages[code ?? ''] ?? '本次采集没有完成，已保存的结果仍然保留。'
}

const cooldownError = /two minutes/
const busyError = /already running|limit of four/
const offlineError = /node is offline/
const platformError = /Linux/
const permissionError = /Permission denied|please login|Credentials expired/
const unsupportedError = /not found|not registered|Unknown method/i

export function routeRequestError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  if (cooldownError.test(text))
    return '同一节点、同一城市每两分钟可检测一次。'
  if (busyError.test(text))
    return '检测正在执行，或四个采集名额已占满，请稍后再试。'
  if (offlineError.test(text))
    return routeFailure('offline')
  if (platformError.test(text))
    return routeFailure('unsupported_platform')
  if (permissionError.test(text))
    return '登录已失效或没有权限，请重新登录。'
  if (unsupportedError.test(text))
    return '主控尚未提供回程检测功能。'
  return '暂时无法读取回程数据，请稍后重试。'
}
