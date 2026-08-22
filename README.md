# 大宝贝定制版（Dabao Custom Edition）

English | [中文](README.zh.md)

> **DeepSeek Harness 定制整合包 —— 不跟随官方更新，fork 自玩。** 基线：`deepseek-ai/deepseek-harness` @ [`dsh-v0.1.1-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2)（上一基线 `dsh-v0.1.0-rc.8`，commit `f1f7dc36fa`）。

## 为什么 fork（背景）

官方宣称「一切皆插件，支持一切接插件」。但实测发现，有一批能力**必须改官方包本体**才能做出来，例如：

- 访问门闸的 `registerGate` 登录门闸钩子（`dsh-host-webserver`）；
- 设置命名空间暴露（`dsh-host-apiproxy`）；
- LLM 重试兜底与思考强度档位（`dsh-llm` / `dsh-llm-deepseek` / `dsh-llm-pi-ai`）。

这些改动保留的是 `@deepseek-ai/*` 官方包名，`dsh plugin add` 只会解析到官方原版 —— **改完就装不回去了**，只能靠安装脚本直接往 profile 铺同名 fork（升级又会被覆盖）。

与其「npm 装一半纯插件 + 脚本铺一半同名 fork」两套流程，不如**直接 fork 整个 DeepSeek Harness**，把这些改动改进 harness 源码本体，整体构建、整体分发 —— 这就是本仓库。

## 这是什么

本仓库 = **大宝贝定制版**：deepseek-harness 源码平铺在仓库根，自研/收录插件与「改官方包」的定制改动整合进 harness 源码。**不跟随官方更新**，自维护基线。

## 整合进度

| 阶段 | 状态 |
|---|---|
| 拉取官方基线（rc.8 `f1f7dc36fa` 平铺到仓库根） | ✅ 完成 |
| 基线升级 `dsh-v0.1.1-rc.2`（全部 fork 重 base，逐项核对见升级适配指南 §2） | ✅ 完成 |
| 8 个 `@deepseek-ai/*` 同名 fork 重 base 进对应 `packages/*/*` | ✅ 完成 |
| 自研插件（门闸 / 默认值 / 桌宠 / 手机端 / 任务套件等 15 包）迁入 `packages/*/*` | ✅ 完成 |
| 三平台适配（Linux / Windows / Termux）+ 跨平台打包脚本 | ✅ 完成 |
| 同步更新工作区文档（AGENTS / PLUGINS / 路线图 / 组 README） | ✅ 完成 |

fork 逐项映射与升级适配见 [docs/工作区/升级适配指南.md](docs/工作区/升级适配指南.md)。

## 目录结构

仓库根即 harness monorepo；自研/收录内容按官方分组规范并入：

```
仓库根                 ← deepseek-harness monorepo（rc.2 平铺）
├── packages/          ← harness 包（host/ client/ llm/ settings/ …）+ 迁入的自研插件
├── apps/              ← dsh CLI 与 Web 前端产品装配
├── vendor/            ← 上游 vendored 框架包
├── docs/              ← harness 文档 + 本工作区文档
├── scripts/           ← harness 脚本 + 本工作区打包脚本
```

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

## 远期计划（迁回官方基线）

等 DeepSeek 官方基线稳定到正式版后，把「需要改官方包」的功能逐个完善、**迁回官方基线**—— 能上游化（issue / PR）的上游化、能插件化的插件化；届时 fork 归零、本仓库退化为纯插件集。

## 许可

MIT © DeepSeek + © zzyyyds88（fork 新增部分）。各收录插件保留原许可（deepseek-pet MIT、 task-suite Apache-2.0、maid-atelier CC BY-NC-SA 4.0），详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与各插件目录。
