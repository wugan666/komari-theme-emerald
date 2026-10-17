<h3 align="center"> Komari Emerald </h3>
<p align="center">
基于 Vue 3 + Vite + reka-ui + Tailwind CSS v4 构建的 Komari Monitor 主题
</p>

![preview](/docs/preview.png)

## 2.5.0：三网回程线路

- 配合自有主控 2.3.0，节点详情新增北京、上海、广州三网回程面板，展示线路判定、逐跳 IP、骨干 ASN、延迟、采集时间和历史变化。
- 首页节点卡显示最近回程结果；管理员可对当前筛选的在线境外 Linux 节点手动批量检测，每批两台，默认跳过近 7 天已采集的同城结果。
- 每城保留最近 20 次有效结果；节点离线和本次采集失败时仍可查看已有记录。查看页面只读取缓存，不自动发起探测。
- 检测复用现有 Agent，需要 Linux、Python 3、原始 ICMP 权限及已启用的远程控制。不会安装软件或更改节点安全设置。
- 判定参考 [Komari Transit](https://github.com/yyy622hhh/komari-theme-transit)，历史呈现借鉴 [IPQA Alert Report](https://github.com/Chen017/komari-plugin-ipqa-alert-report)。证据不足会明确显示未识别，星号不等于业务丢包。

## 2.3.2：原版地球动效与毛玻璃

- 保留 Emerald 气泡、流体 Shader，右上角可切换气泡 / 流体 / 纯色，支持背景强度调节并记住选择。
- 恢复节点、概览、列表与图表卡片的半透明毛玻璃。桌面 20px、手机 12px 背景模糊，支持浅色/深色及主题管理中的毛玻璃开关。搜索、筛选、排序、密度及置顶功能保持完整。
- 电信、联通、移动三条趋势图同时显示，共用纵轴刻度，可统一切换测点地区。数值是近 5 分钟成功探测均值，曲线展示近 30 分钟历史，红条代表丢包，缺测留空。
- 趋势使用一组共享的批量时序查询，每分钟更新；不为每个节点分别请求，也不在首页加载 ECharts。配对延迟与丢包样本后去除失败探测的 -1 贡献，避免把丢包当低延迟。
- 地球完整恢复原版 448px 展示、白/蓝材质、光晕、弧线、随球体移动的国旗和实时速率标签、约 0.18 rad/s 自动旋转及拖拽惯性。保留键盘、播放/暂停和视角重置；弧线作地区分布展示，不代表实测网络连接。
- 修复旧 `low` 性能缓存锁死地球并隐藏播放入口的问题：低档只限制地球帧率，不再关闭旋转或降低地球采样率。系统减少动态效果或站点停止旋转时默认暂停，用户仍可显式播放。后台/不可见时暂停绘制，返回首页恢复。Shader 的画质降级和自定义图片/视频继续保留。
- 预览图使用示例节点名称。需要 Komari 2.0 的 `points_v1` 时序接口。

## 使用

1. 从 [Release 页面](https://github.com/wugan666/komari-theme-emerald/releases) 下载最新的 `komari-theme-emerald-build-*.zip` 文件
2. 登录 Komari Monitor 后，点击 `设置`，选择 `主题管理` 选项卡
3. 点击 `上传主题` 按钮，选择下载的 `komari-theme-emerald-build-*.zip` 文件
4. 刷新页面，即可看到新的主题

## 环境要求

- Node.js: `^20.19.0` 或 `>=22.12.0`
- Bun: `>=1.2.0`

## 开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 代码检查
bun run lint
```

## 构建

```bash
# 类型检查 + 生产构建
bun run build

# 预览生产构建
bun run preview
```

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Vue 3                            |
| 构建工具 | Vite 7                           |
| UI 组件  | reka-ui（shadcn-vue 风格组件）   |
| 样式方案 | Tailwind CSS v4 + tw-animate-css |
| 状态管理 | Pinia 3                          |
| 路由     | Vue Router 5                     |
| 提示系统 | vue-sonner（Toaster）            |
| 图标     | @iconify/vue                     |
| 图表     | vue-echarts                      |
| 3D 地球  | cobe                             |
| 实用工具 | @vueuse/core, dayjs              |
| 代码规范 | ESLint (@antfu/eslint-config)    |

## 鸣谢

- [Komari](https://github.com/komari-monitor/komari)
- [Komari Naive](https://github.com/tonyliuzj/komari-naive)
- [Vue 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [reka-ui](https://reka-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

本主题基座基于 [Komari Naive](https://github.com/lyimoexiao/komari-theme-naive)，特此感谢

## License

[MIT](./LICENSE)
