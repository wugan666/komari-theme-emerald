import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/instance/:id',
      name: 'instance-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
  ],
})

// 页面开着的时候主题被更新，旧页面要按需加载的文件（比如详情页）已经不在服务器上了，
// 这时点击会加载失败而毫无反应。遇到这种失败就直接整页跳到目标地址，拿到新版本。
// 同一个地址只自动重载一次，避免真的出错时反复刷新。
router.onError((error, to) => {
  if (!/dynamically imported module|importing a module script failed|failed to fetch|unable to preload/i.test(String(error?.message ?? error)))
    return
  const key = 'theme:reloaded-for'
  if (sessionStorage.getItem(key) === to.fullPath)
    return
  sessionStorage.setItem(key, to.fullPath)
  location.assign(to.fullPath)
})
router.afterEach((to, _from, failure) => {
  if (!failure)
    sessionStorage.removeItem('theme:reloaded-for')
  void to
})

export default router
