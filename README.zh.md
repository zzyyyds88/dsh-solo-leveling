# 大宝贝定制版（Dabao Custom Edition）

[English](README.md) | 中文

> **DeepSeek Harness 定制整合包 —— 不跟随官方更新，fork 自玩。** 基线：`deepseek-ai/deepseek-harness` @ [`dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2)（上一基线 `dsh-v0.1.0-rc.8`，commit `f1f7dc36fa`）。

**把自己的 Agent 控制台搬到任何屏幕上** —— 桌面三栏工作台 + 手机端全功能适配，同一份 `dsh web` 实例服务两端。

## 这是什么

本仓库 = **大宝贝定制版**：deepseek-harness 源码平铺在仓库根，自研/收录插件与「改官方包」的定制改动整合进 harness 源码。**不跟随官方更新**，自维护基线，整体构建、整体分发。

## 特色能力

| 能力 | 说明 |
|---|---|
| **手机端全功能适配** | 侧栏/详情/aionui 面板窄屏变抽屉、键盘避让、安全区、会话标题居中、桌宠展开抬位、设置弹窗专项（触控目标/紧凑布局）；总开关/断点/抽屉宽度/桌宠缩放全部进设置卡 |
| **访问门禁** | HTTPS + 口令登录门闸（限速、会话 Cookie、首次 `/setup` 引导），口令与证书方式可在 GUI 里改 |
| **网页桌宠** | 随任务/工具/上下文切换表情的 Live2D 女仆：状态气泡、音效与语音、账房 token 统计、纸屑庆祝，可最小化贴角 |
| **皮肤中心** | maid-atelier（深渊女仆工坊）主题：侧栏角色立绘、蕾丝装饰、标题栏品牌字 |
| **图像理解** | 文本模型外挂视觉端点（OpenAI 兼容）：`describe_image` 工具 + 会话内图片预览，端点/模型/密钥/限额全部在设置卡配置 |
| **插件配置卡体系** | 所有自研插件的可调参数统一进「设置 → 插件 → 插件配置」卡片，批量原子保存、拒绝原因可见，无硬编码 |
| **任务看板 / 实时统计 / Git 图谱** | 会话任务五列看板（台账与 cron 调度在 host 进程：关掉网页照跑，数据落 `$DSH_HOME/task-board/ledger.json`）；流式 token 速率与缓存命中实时统计；提交图谱可视化 |

完整插件清单见 [PLUGINS.md](PLUGINS.md)；fork 定制点与升级口径见 [docs/工作区/升级适配指南.md](docs/工作区/升级适配指南.md)。

## 为什么 fork（背景）

官方宣称「一切皆插件，支持一切接插件」。但实测发现，有一批能力**必须改官方包本体**才能做出来，例如：

- 访问门闸的 `registerGate` 登录门闸钩子（`dsh-host-webserver`）；
- 设置命名空间暴露（`dsh-host-apiproxy`）；
- LLM 重试兜底与思考强度档位（`dsh-llm` / `dsh-llm-deepseek` / `dsh-llm-pi-ai`）。

这些改动保留的是 `@deepseek-ai/*` 官方包名，`dsh plugin add` 只会解析到官方原版 —— **改完就装不回去了**。与其「npm 装一半纯插件 + 脚本铺一半同名 fork」两套流程，不如**直接 fork 整个 DeepSeek Harness**，把改动整合进源码本体 —— 这就是本仓库。

## 构建与运行

```bash
pnpm install
pnpm run build
pnpm dsh web          # 默认 HTTPS：https://0.0.0.0:3080（局域网 https://<主机IP>:3080，首次访问需在 /setup 设口令）
```

> 前置：Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`（见根 `package.json`）。

## 平台支持（Linux / Windows / Termux）

基线 = 官方 deepseek-harness `0.1.1-rc.2` + 本仓库定制（默认 HTTPS、访问门禁、皮肤、桌宠等），三平台均支持：

### Linux（x64 / arm64）

```bash
pnpm install && pnpm run build
bash scripts/package-npm.sh            # 或 node scripts/package-npm.mjs
npm i -g ./dist/npm/*.tgz
dsh web                                # https://0.0.0.0:3080
```

**Linux 服务器部署实测备注（2026-08）**：

- npm 11 的 allow-scripts 安全机制会拦截 native 依赖的安装脚本（koffi / node-pty / esbuild / protobufjs / @google/genai / dsh-subprocess-local），全局安装后需补跑一次白名单安装，否则文件系统/终端等原生能力缺失：
  ```bash
  npm i -g --allow-scripts=koffi,node-pty,esbuild,protobufjs,@google/genai,@deepseek-ai/dsh-subprocess-local ./dist/npm/*.tgz
  ```
- 守护进程用 systemd：`/etc/systemd/system/dsh-web.service`（`Restart=always` + 开机自启），kill -9 实测自动拉起正常。
- 构建环境实测：Node v26 + 仓库锁定 TypeScript 6.0.3 + pnpm 11.7.0 全绿；依赖可走国内镜像（npmmirror）。

### Windows（PowerShell）

```powershell
pnpm install; pnpm run build
node scripts/package-npm.mjs           # 跨平台打包（等同 .sh 版）
npm i -g ./dist/npm/*.tgz
dsh web
```

- 官方 rc.8 已内置 Windows 支持（PowerShell 后端 `pwsh-local`、Windows ACL 沙箱 `sandbox-windows-acl`、win32 环境变量处理）。
- 首次监听 0.0.0.0 时 Windows 防火墙会弹放行提示，允许 Node 即可供局域网访问。

### Termux（Android）

```bash
pkg install nodejs-lts git python binutils make clang
npm i -g pnpm@11.7.0
git clone <本仓库> && cd <仓库>
pnpm install && pnpm run build
node scripts/package-npm.mjs
npm i -g ./dist/npm/*.tgz
dsh web                                # Termux 内 HTTPS 端口，手机浏览器访问
```

- Termux 是 Linux 环境：本仓库与官方代码均为纯 Node/POSIX，直接可用。
- native 依赖（`koffi`、`node-pty`，用于文件系统/终端能力）在 Termux 需从源码编译：上面的 `binutils make clang` 即为此准备；若安装失败可 `npm i -g --omit=optional ./dist/npm/*.tgz` 降级（失去部分原生能力，核心 Web GUI 仍可用）。
- 无 root 的 Termux 监听低端口受限，使用默认 3080 即可。

## 目录结构

```
仓库根                 ← deepseek-harness monorepo（rc.2 平铺）
├── packages/          ← harness 包（host/ client/ llm/ settings/ …）+ 迁入的自研插件
├── apps/              ← dsh CLI 与 Web 前端产品装配
├── vendor/            ← 上游 vendored 框架包
├── docs/              ← harness 文档 + 本工作区文档
├── scripts/           ← harness 脚本 + 本工作区打包脚本
└── assets/            ← 社区入口图等静态资源
```

## 远期计划（迁回官方基线）

等 DeepSeek 官方基线稳定到正式版后，把「需要改官方包」的功能逐个完善、**迁回官方基线**—— 能上游化（issue / PR）的上游化、能插件化的插件化；届时 fork 归零、本仓库退化为纯插件集。

## 许可

MIT © DeepSeek + © zzyyyds88（fork 新增部分）。各收录插件保留原许可（deepseek-pet MIT、 task-suite Apache-2.0、maid-atelier CC BY-NC-SA 4.0），详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与各插件目录。
