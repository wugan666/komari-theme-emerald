<script setup lang="ts">
import type { ShaderType } from '@/stores/app'
import { Icon } from '@iconify/vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

const siteFavicon = ref('/favicon.ico')
const shaderOptions: { value: ShaderType, label: string, icon: string }[] = [
  { value: 'bubbles', label: '气泡', icon: 'tabler:bubble' },
  { value: 'liquid', label: '流体', icon: 'tabler:ripple' },
  { value: 'aurora', label: '极光', icon: 'tabler:sparkles' },
  { value: 'none', label: '纯色', icon: 'tabler:square' },
]

const actionButtons = computed(() => {
  const buttons = [
    {
      title: appStore.offlineNotifyEnabled ? '掉线通知：已开启' : '掉线通知：已关闭',
      icon: appStore.offlineNotifyEnabled ? 'icon-park-outline:remind' : 'icon-park-outline:close-remind',
      action: 'toggleOfflineNotify',
    },
    {
      title: appStore.themeMode === 'auto' ? '自动主题' : appStore.themeMode === 'light' ? '浅色主题' : '深色主题',
      icon: appStore.themeMode === 'auto' ? 'icon-park-outline:dark-mode' : appStore.themeMode === 'light' ? 'icon-park-outline:sun-one' : 'icon-park-outline:moon',
      action: 'toggleTheme',
    },
  ]

  if (appStore.isLoggedIn || !appStore.hideAdminEntryWhenLoggedOut) {
    buttons.push({
      title: '后台管理',
      icon: 'icon-park-outline:setting',
      action: 'jumpToSetting',
    })
  }
  return buttons
})

async function toggleOfflineNotify() {
  if (appStore.offlineNotifyEnabled) {
    appStore.offlineNotifyEnabled = false
    window.$message?.info('已关闭掉线通知')
    return
  }
  if (typeof Notification === 'undefined') {
    window.$message?.error('当前浏览器不支持桌面通知')
    return
  }
  let permission = Notification.permission
  if (permission === 'default')
    permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    window.$message?.warning('通知权限被拒绝，请在浏览器站点设置中允许通知')
    return
  }
  appStore.offlineNotifyEnabled = true
  window.$message?.success('已开启掉线通知：节点离线/恢复时会收到桌面提醒')
}

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      break
    case 'toggleOfflineNotify':
      toggleOfflineNotify()
      break
    case 'jumpToSetting':
      location.href = appStore.isLoggedIn ? '/admin/dashboard' : '/admin/login'
      break
  }
}

const sitename = computed(() => appStore.publicSettings?.sitename || 'Komari Monitor')
</script>

<template>
  <div
    class="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-sm"
  >
    <div class="px-4 flex-between h-16 max-w-[1440px] mx-auto">
      <div role="link" tabindex="0" aria-label="返回首页" class="flex items-center gap-3 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-emerald-500" @click="router.push('/')" @keydown.enter="router.push('/')">
        <Avatar class="size-8">
          <AvatarImage :src="siteFavicon" :alt="sitename" />
          <AvatarFallback>{{ sitename.slice(0, 1) }}</AvatarFallback>
        </Avatar>
        <h3 class="m-0 text-lg font-semibold tracking-tight">
          {{ sitename }}
        </h3>
      </div>
      <TooltipProvider :delay-duration="200">
        <div class="flex items-center gap-2">
          <PopoverRoot>
            <PopoverTrigger as-child>
              <Button variant="ghost" size="icon-sm" aria-label="背景效果">
                <Icon icon="tabler:palette" width="18" />
              </Button>
            </PopoverTrigger>
            <PopoverPortal>
              <PopoverContent align="end" :side-offset="10" :collision-padding="12" class="z-50 w-60 rounded-xl border border-border bg-popover p-4 shadow-xl" aria-label="背景效果设置">
                <div class="mb-3 text-sm font-semibold">
                  特色背景
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button v-for="option in shaderOptions" :key="option.value" type="button" :aria-pressed="appStore.shaderType === option.value" class="flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-xs transition-colors focus-visible:outline-2" :class="appStore.shaderType === option.value ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border hover:bg-muted'" @click="appStore.shaderType = option.value">
                    <Icon :icon="option.icon" width="20" />{{ option.label }}
                  </button>
                </div>
                <label v-if="appStore.shaderType !== 'none'" class="mt-4 block text-xs text-muted-foreground">背景强度 <span class="float-right">{{ Math.round(appStore.shaderIntensity * 100) }}%</span><input v-model.number="appStore.shaderIntensity" type="range" min="0.2" max="1" step="0.05" aria-label="背景强度" class="mt-2 w-full accent-primary"></label>
              </PopoverContent>
            </PopoverPortal>
          </PopoverRoot>
          <Tooltip v-for="button in actionButtons" :key="button.action">
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon-sm" :aria-label="button.title" @click="handleButtonClick(button.action)">
                <Icon :icon="button.icon" :width="18" :height="18" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ button.title }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  </div>
</template>
