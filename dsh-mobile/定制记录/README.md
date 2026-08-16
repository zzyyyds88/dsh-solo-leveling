# 定制记录 —— 说明

本目录记录 `dsh-mobile/` 项目的本次定制：

| 文件 | 说明 |
|---|---|
| `变更记录.md` | 做了什么 / 为什么 / 怎么验证 / 怎么回退（完整记录） |
| `本次diff.patch` | 机器可读差异（相对旧版已部署插件 + 新增文件） |

快速回顾：

- **项目**：`dsh-mobile/` —— DSH Web GUI 手机端适配插件 `dsh-mobile-adapt` v0.2.0。
- **一句话**：窄屏下聊天区占满全宽，aionui 文件树/预览变右侧抽屉，设置面板
  字段纵向堆叠，输入框 16px 防 iOS 缩放，桌宠缩小/让位。
- **改动面**：宿主 tapIndex CSS + 新增 client bundle；全部限定
  `@media (max-width: 768px)`，不动皮肤变量与桌面端布局。
- **验证**：test-env-1（3090）Playwright 390×844 实测 + 识图模型复核 + `verify.sh` 全绿。
- **回退**：`node_modules/dsh-mobile-adapt.bak` 拷回即还原旧版。
