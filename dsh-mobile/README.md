# dsh-mobile-adapt —— DSH Web GUI 手机端适配插件

> 目标：让 DSH 网页端在手机/小平板（≤768px）上**美观、能用**。
> 原则：**只做小改**——全部改动限定在窄屏媒体查询内的 CSS + 一个
> `data-dshm-narrow` 属性 + 少量 DOM 观察 JS；不碰皮肤变量、不改结构、
> 不改桌面端布局，皮肤/主题（含 dsh-task-suite 皮肤中心）继续正常工作。

---

## 1. 问题（为什么做）

在手机浏览器直接打开 DSH Web GUI（390px 视口实测）会出现：

| # | 现象 | 根因 |
|---|---|---|
| 1 | 聊天区被挤压到 ~114px，文字截断/换行错乱 | `dsh-aionui-panel` 把 220px 文件树作为 grid 轨道塞进 AppFrame，窄屏不收缩（其 clamp 下限 220px） |
| 2 | 设置面板内容文字逐字竖排（"Agent preset" 变成一列） | 设置弹层右侧内容区仅 ~154-278px，字段行 `[文本+控件]` 横排被挤爆 |
| 3 | 输入框聚焦后页面自动放大 | iOS 上 <16px 输入框聚焦触发缩放 |
| 4 | 桌宠遮挡弹窗/控件 | 桌宠绝对定位右下角、z-index 高于部分弹层 |
| 5 | 底部输入区贴边/安全区不适配 | 无 safe-area / 底部留白处理 |

历史：工作区原先已有一个 `dsh-mobile-adapt`（宿主侧 tapIndex 注入 CSS），
但选择器是猜的（`data-chat-flow`/`data-message` 等并不存在），对上述问题
基本无效；本次在 `dsh-mobile/` 立项重做，保留其「宿主 CSS 注入」架构，
新增浏览器端 bundle 补齐 JS 能力。

## 2. 链路分析（改动点在哪）

```
浏览器(手机) ──GET /──▶ dsh web (webServer)
                            │ tapIndex：注入 <style data-plugin-css="dsh-mobile-adapt">
                            ▼
                        index.html（含 __DSH_BOOT__ 启动图）
                            │ 启动图含 dsh-mobile-adapt（dsh.client 声明）
                            ▼
                        client bundle /plugins/dsh-mobile-adapt/client.js
                        （每请求实时读盘 + rev 缓存失效 → 改完刷新即生效）
```

- **宿主侧（lib/index.js）**：`ctx.webServer.tapIndex()` 注入整段窄屏 CSS。
  优点：首屏即带样式，无闪烁；只改 CSS 时**改完重启一次**即可（或直接用
  client 侧注入，见下）。
- **浏览器侧（lib/client.js）**：`window.__ModuleLoader__.load({id, factory})`
  手写 bundle（格式同 `dsh-client-ui-access-gate`），无打包器依赖。职责：
  窄屏检测（matchMedia）、给 AppFrame 加 `data-dshm-narrow`、grid 强制覆盖、
  抽屉自动收起。**改完浏览器刷新即生效**（客户端 bundle 实时读盘）。

## 3. 方案（小改清单）

### 3.1 聊天区解放（核心修复）
aionui 的文件树/预览列在窄屏下**从 grid 轨道变成右侧抽屉**：

- JS：窄屏时把 AppFrame grid 强制为
  `侧栏 minmax(0,1fr) details 0px 0px`（important 覆盖 aionui 的写入，
  并用 MutationObserver 持续维持）；给 frame 加 `data-dshm-narrow`。
- CSS：`[data-dsh-frame][data-dshm-narrow] [data-aionui-explorer-col]`
  等两列改为 `position:absolute; right:0`，平时 `translateX(104%)` 藏在屏外，
  aionui 自身把 visibility 置 `visible` 时滑入（其收起/展开逻辑与
  localStorage 持久化原样保留）。
- 抽屉默认收起：启动时收一次；**切换工作区（root 变化导致 aionui 重新
  展开）时也自动收起**；用户点浮出按钮（`aionui-floating-expand`，已加大
  到 34×84）打开则放行（用 capture 委托监听区分用户操作与程序化展开）。

### 3.2 设置面板（弹层）
- 弹层加宽到 `calc(100vw - 16px)`，`max-height: calc(100dvh - 16px)`；
- 左侧导航保持 64px 图标栏（沿用旧版规则）；
- 字段行纵向堆叠：`[class*="rowText"]` 占满整行、行内最后一个控件换行到
  下一行全宽——消除逐字竖排。

### 3.3 输入区 & 触控
- textarea `font-size:16px`（防 iOS 聚焦缩放）、safe-area 底部留白；
- 禁用 `overscroll-behavior-y` 防下拉刷新干扰。

### 3.4 桌宠
- 缩小贴角（`--pet-scale:.58`，贴右下角）；
- 弹层打开时让位（`body:has([role="dialog"][aria-modal="true"])` 时
  隐藏+禁点）。

## 4. 关键踩坑记录

1. **绝不能用 classList 操作 AppFrame 的 className**：React 会重写
   className，与 MutationObserver 形成死循环，实测直接杀 renderer
   （页面关闭、无报错）。一律改用 `data-*` 属性（React 不管理）。
2. **aionui 的 clamp 下限是 220px**：窄容器下文件树不会自己收缩，必须
   外部把 grid 轨道压成 0。
3. **grid 覆盖要防自触发**：`setProperty(..., "important")` 后比较当前值，
   相同则跳过，否则自己的 styleObserver 会打乒乓。
4. **浮出按钮是异步渲染的**：给它绑监听要用 document 捕获委托，直接
   `addEventListener` 会因元素尚未存在而漏绑。
5. 旧版插件的 `data-chat-flow`/`data-message`/`data-tooltip` 选择器在
   rc.6 DOM 中不存在，本次已删除。

## 5. 目录结构

```text
dsh-mobile/
├── README.md                  ← 本思路库
├── package.json               ← 包定义（dsh.client 声明 → client bundle 自动入启动图）
├── src/
│   ├── index.js               ← 宿主插件：tapIndex 注入窄屏 CSS
│   └── client.js              ← 浏览器端 bundle：窄屏布局/抽屉管理（手写，无需打包器）
├── build.sh                   ← src/ → lib/（纯拷贝 + node --check）
├── lib/                       ← 构建产物（已入库）
├── verify.sh                  ← 测试环境验证（静态 + --live）
├── install-to-test-env.sh     ← 装进 test-env（自动备份 .bak）
├── install-to-profile.sh      ← 正式安装（仅用户在 SSH 终端执行；含重启）
├── 升级后重打补丁指南.md
└── 定制记录/
    ├── README.md
    ├── 变更记录.md
    └── 本次diff.patch
```

## 6. 安装与验证

```bash
# 测试环境（本工作区纪律）：
bash build.sh
TEST_ENV_INDEX=1 bash install-to-test-env.sh
scripts/test-env-stop.sh && scripts/test-env-start.sh
bash verify.sh && bash verify.sh --live

# 正式（仅用户，SSH 终端）：
bash install-to-profile.sh        # 会重启正式 dsh web
# 或只换文件不重启：
bash install-to-profile.sh --no-restart
```

## 7. 备选思路（未采用）

- **改 aionui-panel 源码**：把抽屉逻辑做进 dsh-task-suite 上游——更彻底，
  但会动到已部署插件的源码（同包名覆盖），且升级要重打，违背「小改」。
- **纯 CSS 无 JS**：抽屉开合可用 `[style*="visibility: visible"]` 选择器
  实现，但「root 变化自动收起」「grid 侧栏宽度保持动态」必须 JS；且无法
  区分用户主动打开。故保留最小 JS。
- **整体改用 client 侧注入 CSS**：宿主 CSS 与 client CSS 二选一即可；
  当前宿主注入保证首屏无闪烁，改动小，维持现状。
