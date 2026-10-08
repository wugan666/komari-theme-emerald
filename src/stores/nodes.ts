import type { Client, NodeStatus } from '@/utils/rpc'
import { useNow } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { parseNodeGroups } from '@/utils/groupHelper'

/** 流量限制类型 */
export type TrafficLimitType = 'up' | 'down' | 'min' | 'max' | 'sum'

/** 节点完整信息（合并 Client 和 Status） */
export interface NodeData {
  uuid: string
  // Client 信息
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  gpu_name?: string
  ipv4?: string
  ipv6?: string
  region: string
  remark?: string
  public_remark: string
  mem_total: number
  swap_total: number
  disk_total: number
  version?: string
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string
  group: string
  tags: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: TrafficLimitType
  created_at: string
  updated_at: string
  // Status 信息
  online: boolean
  time: string
  cpu: number
  gpu: number
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
}

/** WebSocket 连接状态 */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** 状态数据（用于更新） */
interface StatusData {
  online: boolean
  time: string
  cpu: number
  gpu: number
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
}

/** Client 中与 NodeData 同名同型的字段（更新节点基本信息时按字段同步） */
const CLIENT_SYNC_FIELDS = [
  'name',
  'cpu_name',
  'virtualization',
  'arch',
  'cpu_cores',
  'os',
  'kernel_version',
  'gpu_name',
  'ipv4',
  'ipv6',
  'region',
  'remark',
  'public_remark',
  'mem_total',
  'swap_total',
  'disk_total',
  'version',
  'weight',
  'price',
  'billing_cycle',
  'auto_renewal',
  'currency',
  'expired_at',
  'group',
  'tags',
  'hidden',
  'traffic_limit',
  'created_at',
  'updated_at',
] as const

type ClientSyncField = (typeof CLIENT_SYNC_FIELDS)[number]

const useNodesStore = defineStore('nodes', () => {
  const now = useNow({ interval: 60_000 })
  // ===== 状态 =====
  const nodes = ref<NodeData[]>([])
  const lastStatusReceivedAt = ref<number | null>(null)
  const wsConnectionState = ref<WsConnectionState>('disconnected')
  const wsReconnectAttempts = ref<number>(0)

  /**
   * 按 UUID 的直接索引，避免每次轮询对每个节点 findIndex（O(n²)）。
   * 注意存放的必须是 push 进 nodes 后回读的响应式代理，存原始对象会丢失响应式。
   */
  const nodeIndex = new Map<string, NodeData>()

  // ===== 计算属性 =====
  /** 在线节点数量 */
  const onlineCount = computed(() => nodes.value.filter(n => n.online).length)

  /** 总节点数量 */
  const totalCount = computed(() => nodes.value.length)

  /** 所有分组 */
  const groups = computed(() => {
    const groupSet = new Set<string>()
    nodes.value.forEach((n) => {
      parseNodeGroups(n.group).forEach(group => groupSet.add(group))
    })
    return Array.from(groupSet)
  })

  /** 按 UUID 索引的节点映射 */
  const nodesByUuid = computed(() => {
    const map = new Map<string, NodeData>()
    nodes.value.forEach((n) => {
      map.set(n.uuid, n)
    })
    return map
  })

  // ===== 方法 =====

  /** 追加节点并登记索引 */
  function addIndexedNode(node: NodeData): void {
    nodes.value.push(node)
    const reactiveNode = nodes.value.at(-1)
    if (reactiveNode)
      nodeIndex.set(reactiveNode.uuid, reactiveNode)
  }

  /** 删除指定下标的节点并清理索引 */
  function removeNodeAt(index: number): void {
    const node = nodes.value[index]
    if (node)
      nodeIndex.delete(node.uuid)
    nodes.value.splice(index, 1)
  }

  /**
   * 从 Client 对象创建节点数据
   */
  function createNodeFromClient(client: Client): NodeData {
    return {
      uuid: client.uuid,
      name: client.name,
      cpu_name: client.cpu_name,
      virtualization: client.virtualization,
      arch: client.arch,
      cpu_cores: client.cpu_cores,
      os: client.os,
      kernel_version: client.kernel_version,
      gpu_name: client.gpu_name,
      ipv4: client.ipv4,
      ipv6: client.ipv6,
      region: client.region,
      remark: client.remark,
      public_remark: client.public_remark,
      mem_total: client.mem_total,
      swap_total: client.swap_total,
      disk_total: client.disk_total,
      version: client.version,
      weight: client.weight,
      price: client.price,
      billing_cycle: client.billing_cycle,
      auto_renewal: client.auto_renewal,
      currency: client.currency,
      expired_at: client.expired_at,
      group: client.group,
      tags: client.tags,
      hidden: client.hidden,
      traffic_limit: client.traffic_limit,
      traffic_limit_type: client.traffic_limit_type as TrafficLimitType,
      created_at: client.created_at,
      updated_at: client.updated_at,
      // Status 默认值
      online: false,
      time: client.last_seen_at ?? '',
      cpu: 0,
      gpu: 0,
      ram: 0,
      swap: 0,
      load: 0,
      load5: 0,
      load15: 0,
      temp: 0,
      disk: 0,
      net_in: 0,
      net_out: 0,
      net_total_up: 0,
      net_total_down: 0,
      process: 0,
      connections: 0,
      connections_udp: 0,
      uptime: 0,
    }
  }

  /**
   * 就地写入状态字段，仅在值实际变化时赋值。
   *
   * 关键：不要用 `{...node}` 生成新对象再整体替换数组元素——引用变化会让依赖该节点
   * 的所有组件（NodeCard / 列表行 / 总览卡片 / 地球）每轮轮询都整体重渲染。就地按
   * 字段更新后，Vue 的细粒度响应式只会重算真正变化的字段对应的视图。
   */
  function applyStatus(node: NodeData, status: StatusData): void {
    if (node.online !== status.online)
      node.online = status.online
    if (node.time !== status.time)
      node.time = status.time
    if (node.cpu !== status.cpu)
      node.cpu = status.cpu
    if (node.gpu !== status.gpu)
      node.gpu = status.gpu
    if (node.ram !== status.ram)
      node.ram = status.ram
    if (node.swap !== status.swap)
      node.swap = status.swap
    if (node.load !== status.load)
      node.load = status.load
    if (node.load5 !== status.load5)
      node.load5 = status.load5
    if (node.load15 !== status.load15)
      node.load15 = status.load15
    if (node.temp !== status.temp)
      node.temp = status.temp
    if (node.disk !== status.disk)
      node.disk = status.disk
    if (node.net_in !== status.net_in)
      node.net_in = status.net_in
    if (node.net_out !== status.net_out)
      node.net_out = status.net_out
    if (node.net_total_up !== status.net_total_up)
      node.net_total_up = status.net_total_up
    if (node.net_total_down !== status.net_total_down)
      node.net_total_down = status.net_total_down
    if (node.process !== status.process)
      node.process = status.process
    if (node.connections !== status.connections)
      node.connections = status.connections
    if (node.connections_udp !== status.connections_udp)
      node.connections_udp = status.connections_udp
    if (node.uptime !== status.uptime)
      node.uptime = status.uptime
  }

  function syncClientField<K extends ClientSyncField>(node: NodeData, client: Client, key: K): void {
    const next = client[key] as NodeData[K]
    if (node[key] !== next)
      node[key] = next
  }

  /** 就地同步节点基本信息，仅在值实际变化时赋值（保留状态字段不动） */
  function applyClient(node: NodeData, client: Client): void {
    for (const key of CLIENT_SYNC_FIELDS)
      syncClientField(node, client, key)

    const trafficLimitType = client.traffic_limit_type as TrafficLimitType
    if (node.traffic_limit_type !== trafficLimitType)
      node.traffic_limit_type = trafficLimitType
  }

  /**
   * 初始化节点数据（首次加载）
   */
  function initNodes(clients: Record<string, Client>, statuses: Record<string, NodeStatus>): void {
    lastStatusReceivedAt.value = Date.now()
    const uuids = Object.keys(clients)

    // 更新现有节点或添加新节点
    uuids.forEach((uuid) => {
      const client = clients[uuid]
      if (!client)
        return

      const status = statuses[uuid]
      const existing = nodeIndex.get(uuid)

      if (existing) {
        applyClient(existing, client)
        if (status)
          applyStatus(existing, status)
      }
      else {
        addIndexedNode(createNodeFromClient(client))
        const reactiveNode = nodeIndex.get(uuid)
        if (status && reactiveNode)
          applyStatus(reactiveNode, status)
      }
    })

    // 移除不存在的节点
    const newUuids = new Set(uuids)
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      if (node && !newUuids.has(node.uuid)) {
        removeNodeAt(i)
      }
    }

    // 按 weight 降序排序（weight 越大越靠前）
    sortNodesByWeight()
  }

  /**
   * 排序节点：离线节点沉底，同状态内按 weight 升序
   */
  function sortNodesByWeight(): void {
    nodes.value.sort((a, b) => {
      // 离线节点排到最后
      if (a.online !== b.online)
        return a.online ? -1 : 1
      // 同状态按 weight 升序
      return a.weight - b.weight
    })
  }

  /**
   * 更新节点状态（实时更新）
   */
  function updateNodeStatuses(statuses: Record<string, NodeStatus>): void {
    lastStatusReceivedAt.value = Date.now()
    let onlineChanged = false
    Object.entries(statuses).forEach(([uuid, status]) => {
      const node = nodeIndex.get(uuid)
      if (!node)
        return

      if (node.online !== status.online)
        onlineChanged = true

      applyStatus(node, status)
    })
    // 节点上/下线时重新排序
    if (onlineChanged)
      sortNodesByWeight()
  }

  /**
   * 更新节点基本信息
   */
  function updateNodeClients(clients: Record<string, Client>): void {
    const newUuids = new Set(Object.keys(clients))
    let orderChanged = false

    // 更新现有节点信息或添加新节点
    Object.entries(clients).forEach(([uuid, client]) => {
      const node = nodeIndex.get(uuid)

      if (node) {
        if (node.weight !== client.weight)
          orderChanged = true
        // 就地同步基本信息，状态字段保持不变
        applyClient(node, client)
      }
      else {
        // 添加新节点（不带状态）
        addIndexedNode(createNodeFromClient(client))
        orderChanged = true
      }
    })

    // 移除不存在的节点
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      if (node && !newUuids.has(node.uuid)) {
        removeNodeAt(i)
      }
    }

    // 仅在排序依据可能变化时重排
    if (orderChanged)
      sortNodesByWeight()
  }

  /**
   * 更新 WebSocket 连接状态
   */
  function updateWsState(state: WsConnectionState, attempts?: number): void {
    wsConnectionState.value = state
    if (attempts !== undefined) {
      wsReconnectAttempts.value = attempts
    }
  }

  /**
   * 清空所有节点数据
   */
  function clearNodes(): void {
    nodes.value = []
    lastStatusReceivedAt.value = null
    nodeIndex.clear()
  }

  return {
    now,
    // 状态
    nodes,
    lastStatusReceivedAt,
    wsConnectionState,
    wsReconnectAttempts,
    // 计算属性
    onlineCount,
    totalCount,
    groups,
    nodesByUuid,
    // 方法
    initNodes,
    updateNodeStatuses,
    updateNodeClients,
    sortNodesByWeight,
    updateWsState,
    clearNodes,
  }
})

export { useNodesStore }
