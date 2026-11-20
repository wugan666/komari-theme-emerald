import type { PublicSettings } from '@/utils/api'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { usePreferredDark, useStorage, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ShaderType = 'bubbles' | 'liquid' | 'none'
export type ThemeMode = 'auto' | 'light' | 'dark'
type Lang = 'zh-CN' | 'en-US'
type NodeViewMode = 'card' | 'list'
type RpcTransportMode = 'websocket' | 'http'

/** 固定的字节精度配置 */
const BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

const useAppStore = defineStore('app', () => {
  const loading = ref<boolean>(true)

  // 使用 VueUse 的 useStorageAsync 实现自动持久化
  const themeMode = useStorageAsync<ThemeMode>('themeMode', 'auto', localStorage)
  const shaderType = useStorage<ShaderType>('shaderType', 'bubbles')
  const shaderIntensity = useStorage<number>('emerald:shader-intensity', 0.65)
  watch(shaderType, (value) => {
    if (!['bubbles', 'liquid', 'none'].includes(value))
      shaderType.value = 'bubbles'
  }, { immediate: true })
  watch(shaderIntensity, (value) => {
    if (!Number.isFinite(value) || value < 0.2 || value > 1)
      shaderIntensity.value = 0.65
  }, { immediate: true })
  const lang = ref<Lang>('zh-CN')
  const publicSettings = ref<PublicSettings>()
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)
  const isLoggedIn = ref<boolean>(false)
  const connectionError = ref<boolean>(false)

  // 收藏置顶的节点 uuid 列表
  const pinnedNodes = useStorageAsync<string[]>('pinnedNodes', [], localStorage)

  function togglePinnedNode(uuid: string) {
    const list = pinnedNodes.value
    const index = list.indexOf(uuid)
    if (index === -1)
      pinnedNodes.value = [...list, uuid]
    else
      pinnedNodes.value = list.filter(id => id !== uuid)
  }

  function isNodePinned(uuid: string): boolean {
    return pinnedNodes.value.includes(uuid)
  }

  // 首页节点搜索词（放 store 供标签点击筛选等跨组件写入）
  const nodeSearchText = ref('')

  // 卡片视图密度
  const cardDensity = useStorageAsync<'comfortable' | 'compact'>('cardDensity', 'comfortable', localStorage)

  function toggleCardDensity() {
    cardDensity.value = cardDensity.value === 'compact' ? 'comfortable' : 'compact'
  }

  // 节点掉线浏览器通知开关
  const offlineNotifyEnabled = useStorageAsync<boolean>('offlineNotifyEnabled', false, localStorage)

  // 首页滚动位置记忆
  const homeScrollPosition = ref<number>(0)

  // 使用 null 表示未设置，等待主题配置加载后决定
  const storedViewMode = useStorageAsync<NodeViewMode | null>('nodeViewMode', null, localStorage)

  // 计算属性：从主题配置获取默认视图模式
  const defaultViewMode = computed<NodeViewMode>(() => {
    const settings = publicSettings.value?.theme_settings
    // 手机上卡片视图一屏只能看一台，可以单独指定更紧凑的默认视图
    const mobileMode = settings?.mobileDefaultViewMode
    if ((mobileMode === 'card' || mobileMode === 'list') && typeof window !== 'undefined' && window.innerWidth < 768) {
      return mobileMode
    }
    if (settings && typeof settings.defaultViewMode === 'string') {
      const mode = settings.defaultViewMode
      if (mode === 'card' || mode === 'list') {
        return mode
      }
    }
    return 'card'
  })

  // 校验视图模式是否为合法值
  function isValidViewMode(value: string | null): value is NodeViewMode {
    return value === 'card' || value === 'list'
  }

  // 当前实际使用的视图模式
  const nodeViewMode = computed<NodeViewMode>({
    get: () => {
      // 校验 storedViewMode 是否为合法值，非法值时使用默认值
      if (storedViewMode.value !== null && isValidViewMode(storedViewMode.value)) {
        return storedViewMode.value
      }
      return defaultViewMode.value
    },
    set: (val) => {
      storedViewMode.value = val
    },
  })

  // 计算属性：从主题配置获取 RPC 连接模式
  const rpcTransportMode = computed<RpcTransportMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.rpcTransportMode === 'string') {
      const mode = settings.rpcTransportMode
      if (mode === 'websocket' || mode === 'http') {
        return mode
      }
    }
    return 'websocket'
  })

  // 字节格式化精度（固定配置）
  const byteDecimals: ByteDecimalsConfig = { ...BYTE_DECIMALS }

  // 计算属性：公告配置
  const alertEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertEnabled === 'boolean') {
      return settings.alertEnabled
    }
    return false
  })

  const alertTitle = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertTitle === 'string') {
      return settings.alertTitle
    }
    return ''
  })

  const alertContent = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.alertContent === 'string') {
      return settings.alertContent
    }
    return ''
  })

  const stopEarth = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.stopEarth === 'boolean') {
      return settings.stopEarth
    }
    return false
  })

  const hideEarth = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.hideEarth === 'boolean') {
      return settings.hideEarth
    }
    return false
  })

  const hideGeneralCard = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.hideGeneralCard === 'boolean') {
      return settings.hideGeneralCard
    }
    return false
  })

  type SummaryCardType = 'memory' | 'disk' | 'finance' | 'traffic' | 'speedUp' | 'speedDown' | 'connections'
  const VALID_SUMMARY_CARDS: SummaryCardType[] = ['memory', 'disk', 'finance', 'traffic', 'speedUp', 'speedDown', 'connections']
  const DEFAULT_SUMMARY_CARDS: SummaryCardType[] = ['memory', 'disk', 'finance', 'traffic', 'speedUp', 'speedDown']

  const summaryCards = computed<SummaryCardType[]>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.summaryCards === 'string' && settings.summaryCards.trim()) {
      const parsed = settings.summaryCards.split(',').map((s: string) => s.trim()).filter((s: string) => VALID_SUMMARY_CARDS.includes(s as SummaryCardType)) as SummaryCardType[]
      if (parsed.length > 0) {
        return parsed.slice(0, 6)
      }
    }
    return DEFAULT_SUMMARY_CARDS
  })

  const nodeCardMinWidth = computed<number>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.nodeCardMinWidth === 'number' && settings.nodeCardMinWidth >= 200) {
      return settings.nodeCardMinWidth
    }
    return 300
  })

  const showNodeConnections = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.showNodeConnections === 'boolean') {
      return settings.showNodeConnections
    }
    return true
  })

  const showNodeUptime = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.showNodeUptime === 'boolean') {
      return settings.showNodeUptime
    }
    return true
  })

  // 默认开启的布尔型主题开关：只有显式存成 false 才关闭
  function themeSwitch(key: string, fallback: boolean) {
    return computed<boolean>(() => {
      const value = publicSettings.value?.theme_settings?.[key]
      return typeof value === 'boolean' ? value : fallback
    })
  }
  const compactOfflineNodes = themeSwitch('compactOfflineNodes', true)
  const showCarrierLatency = themeSwitch('showCarrierLatency', true)
  const showReturnRoute = themeSwitch('showReturnRoute', true)

  const visitorInfoCardEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.visitorInfoCardEnabled === 'boolean') {
      return settings.visitorInfoCardEnabled
    }
    return true
  })

  const hideAdminEntryWhenLoggedOut = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.hideAdminEntryWhenLoggedOut === 'boolean') {
      return settings.hideAdminEntryWhenLoggedOut
    }
    return false
  })

  const disablePageAnimation = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.disablePageAnimation === 'boolean') {
      return settings.disablePageAnimation
    }
    return false
  })

  const enableGlassEffect = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (!settings || settings.enableGlassEffect === undefined || settings.enableGlassEffect === null) {
      return true
    }
    const val = settings.enableGlassEffect
    if (typeof val === 'boolean')
      return val
    if (val === 'true' || val === '1')
      return true
    if (val === 'false' || val === '0')
      return false
    return true
  })

  // 计算属性：ICP 备案配置
  const icpEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpEnabled === 'boolean') {
      return settings.icpEnabled
    }
    return false
  })

  const icpNumber = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpNumber === 'string') {
      return settings.icpNumber
    }
    return ''
  })

  const icpUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.icpUrl === 'string' && settings.icpUrl.trim()) {
      return settings.icpUrl.trim()
    }
    return 'https://beian.miit.gov.cn/'
  })

  // 计算属性：公安备案配置
  const policeEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeEnabled === 'boolean') {
      return settings.policeEnabled
    }
    return false
  })

  const policeNumber = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeNumber === 'string') {
      return settings.policeNumber
    }
    return ''
  })

  const policeUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.policeUrl === 'string' && settings.policeUrl.trim()) {
      return settings.policeUrl.trim()
    }
    return ''
  })

  // 计算属性：自定义背景配置
  const backgroundEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundEnabled === 'boolean') {
      return settings.backgroundEnabled
    }
    return false
  })

  const backgroundType = computed<'image' | 'video'>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundType === 'string') {
      const type = settings.backgroundType
      if (type === 'image' || type === 'video') {
        return type
      }
    }
    return 'image'
  })

  const lightBackgroundUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.lightBackgroundUrl === 'string') {
      return settings.lightBackgroundUrl.trim()
    }
    return ''
  })

  const darkBackgroundUrl = computed<string>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.darkBackgroundUrl === 'string') {
      return settings.darkBackgroundUrl.trim()
    }
    return ''
  })

  const backgroundBlur = computed<number>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundBlur === 'number' && settings.backgroundBlur >= 0) {
      return settings.backgroundBlur
    }
    return 0
  })

  const backgroundOverlay = computed<number>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.backgroundOverlay === 'number' && settings.backgroundOverlay >= -100 && settings.backgroundOverlay <= 100) {
      return settings.backgroundOverlay
    }
    return 0
  })

  // 当 publicSettings 加载后，如果 localStorage 没有保存过视图模式或值为非法值，使用默认值
  watch(publicSettings, (settings) => {
    if (settings && !isValidViewMode(storedViewMode.value)) {
      // 触发 computed setter，会自动保存到 localStorage
      storedViewMode.value = defaultViewMode.value
    }
  }, { immediate: true })

  // 使用 VueUse 的 usePreferredDark 检测系统主题偏好
  const prefersDark = usePreferredDark()

  watch(themeMode, (mode) => {
    if (!isValidThemeMode(mode)) {
      themeMode.value = 'auto'
    }
  }, { immediate: true })

  // 计算当前是否为暗色模式
  const isDark = computed(() => {
    if (themeMode.value === 'auto') {
      return prefersDark.value
    }
    return themeMode.value === 'dark'
  })

  const resolvedThemeMode = computed<'light' | 'dark'>(() => isDark.value ? 'dark' : 'light')

  // 计算属性：当前主题模式下的背景 URL
  const currentBackgroundUrl = computed<string>(() => {
    if (resolvedThemeMode.value === 'dark') {
      return darkBackgroundUrl.value
    }
    return lightBackgroundUrl.value
  })

  function updateThemeMode(mode?: ThemeMode) {
    if (mode) {
      themeMode.value = isValidThemeMode(mode) ? mode : 'auto'
      return
    }

    const nextMode: Record<ThemeMode, ThemeMode> = {
      auto: 'light',
      light: 'dark',
      dark: 'auto',
    }

    const currentMode = isValidThemeMode(themeMode.value) ? themeMode.value : 'auto'
    themeMode.value = nextMode[currentMode]
  }

  function updateLoginState(loggedIn: boolean) {
    isLoggedIn.value = loggedIn
  }

  return {
    loading,
    themeMode,
    shaderType,
    shaderIntensity,
    isDark,
    resolvedThemeMode,
    lang,
    nodeSelectedGroup,
    nodeViewMode,
    pinnedNodes,
    togglePinnedNode,
    isNodePinned,
    nodeSearchText,
    cardDensity,
    toggleCardDensity,
    offlineNotifyEnabled,
    defaultViewMode,
    rpcTransportMode,
    byteDecimals,
    alertEnabled,
    alertTitle,
    alertContent,
    stopEarth,
    hideEarth,
    hideGeneralCard,
    summaryCards,
    nodeCardMinWidth,
    showNodeConnections,
    showNodeUptime,
    compactOfflineNodes,
    showCarrierLatency,
    showReturnRoute,
    visitorInfoCardEnabled,
    hideAdminEntryWhenLoggedOut,
    disablePageAnimation,
    enableGlassEffect,
    icpEnabled,
    icpNumber,
    icpUrl,
    policeEnabled,
    policeNumber,
    policeUrl,
    backgroundEnabled,
    backgroundType,
    lightBackgroundUrl,
    darkBackgroundUrl,
    currentBackgroundUrl,
    backgroundBlur,
    backgroundOverlay,
    isLoggedIn,
    publicSettings,
    connectionError,
    homeScrollPosition,
    updateThemeMode,
    updateLoginState,
  }
})

export { useAppStore }
