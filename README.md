# 大宝贝定制版（Dabao Custom Edition）

> **DeepSeek Harness 定制整合包 —— 不跟随官方更新，fork 自玩。**
> 基线：`deepseek-ai/deepseek-harness` @ [`dsh-v0.1.0-rc.7`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7)
> （commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`）。
> 官方原文见 [GitHub tag `dsh-v0.1.0-rc.7`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.0-rc.7)。

## 为什么 fork（背景）

官方宣称「一切皆插件，支持一切接插件」。但实测发现，有一批能力**必须改官方包本体**才能做出来，
例如：

- 访问门闸的 `registerGate` 登录门闸钩子（`dsh-host-webserver`）；
- 设置命名空间暴露（`dsh-host-apiproxy`）；
- LLM 重试兜底与思考强度档位（`dsh-llm` / `dsh-llm-deepseek` / `dsh-llm-pi-ai`）。

这些改动保留的是 `@deepseek-ai/*` 官方包名，`dsh plugin add` 只会解析到官方原版 ——
**改完就装不回去了**，只能靠安装脚本直接往 profile 铺同名 fork（升级又会被覆盖）。

与其「npm 装一半纯插件 + 脚本铺一半同名 fork」两套流程，不如**直接 fork 整个 DeepSeek Harness**，
把这些改动改进 harness 源码本体，整体构建、整体分发 —— 这就是本仓库。

## 这是什么

本仓库 = **大宝贝定制版**：deepseek-harness 源码平铺在仓库根，自研/收录插件与「改官方包」的定制
改动整合进 harness 源码。**不跟随官方更新**，自维护基线。

## 整合进度

| 阶段 | 状态 |
|---|---|
| 拉取官方基线（rc.7 平铺到仓库根） | ✅ 完成 |
| 8 个 `@deepseek-ai/*` 同名 fork 重 base 进对应 `packages/*/*` | ✅ 完成 |
| 纯插件（门闸 / 默认值 / 桌宠 / 手机端 / 任务套件）迁入 `packages/*/*` | ✅ 完成 |
| 同步更新工作区文档（AGENTS / PLUGINS / 路线图 / 组 README） | ✅ 完成 |

逐项映射与迁移方案见 [docs/整合迁移路线图.md](docs/整合迁移路线图.md)。

## 目录结构

仓库根即 harness monorepo；自研/收录内容按官方分组规范并入：

```
仓库根                 ← deepseek-harness monorepo（rc.7 平铺）
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
pnpm dsh web          # http://127.0.0.1:3080
```

> 前置：Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`（见根 `package.json`）。

## 远期计划（迁回官方基线）

等 DeepSeek 官方基线稳定到正式版后，把「需要改官方包」的功能逐个完善、**迁回官方基线**——
能上游化（issue / PR）的上游化、能插件化的插件化；届时 fork 归零、本仓库退化为纯插件集。

## 许可

MIT © DeepSeek + © zzyyyds88（fork 新增部分）。各收录插件保留原许可（deepseek-pet MIT、
task-suite Apache-2.0、maid-atelier CC BY-NC-SA 4.0），详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
与各插件目录。
