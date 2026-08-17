# opencode 提示词：DSH 0.1.0-rc.6 → 0.1.0-rc.7 升级适配

> 把下面整段发给 opencode（或任意 AI Agent，在 SSH 终端执行，可停/起 dsh web）。

---

你是 DSH 升级工作区的执行者，任务：把本机 DSH 从 0.1.0-rc.6 升级到 0.1.0-rc.7，并按「优先官方」原则适配本工作区的全部插件与同包名 fork。工作区根目录用 `pwd` 确认（不要臆测）。

## 0. 开工前必读（强制）

按顺序读这三个文件，它们是你的最高准则：
1. `AGENTS.md` —— 红线（尤其：不碰正式环境数据、profile 原子化、走官方安装方式）
2. `docs/升级适配指南.md` —— 本次升级的核心流程 + 8 个 fork 逐项核对清单
3. `docs/opencode-实测反馈.md` —— 上次正式安装踩过的坑

## 铁律（最重要，违反即失败）

**官方 rc.7 已实现与本工作区相同的功能 → 优先用官方，弃用本工作区对应的 fork/适配层。**
- 判断依据必须是 **rc.7 官方源码**，不是 release notes 字面描述。
- 只有官方没做、或官方实现不满足需求时才保留 fork，且保留的 fork 必须**重 base 到 rc.7 官方源码**（不能继续用 rc.6 旧源码）。
- 弃用/重 base 后，都要在测试环境验证，等用户验收，再做正式重装。

## 当前状态

- 全局 DSH：`0.1.0-rc.6`（`/usr/lib/node_modules/@deepseek-ai/dsh`）
- 官方已发布 `0.1.0-rc.7`（tag `dsh-v0.1.0-rc.7`，2026-08-17；仓库结构重组为 `packages/host/*`、`packages/settings/*` 等域目录）
- release notes：https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.7
- 本工作区 8 个同包名 fork 均 built-against rc.6（版本后缀 `-local.1`）
- 正式 DSH_HOME：`/root/.dsh`，端口 3080；测试端口 3090

## 执行步骤

### A. 升级全局 DSH 到 rc.7
用官方升级方式（官方更新器 / npm 全局安装，以官方文档为准）。**升级前先备份**：
- 全局安装目录（`/usr/lib/node_modules/@deepseek-ai/dsh`）
- 正式 profile（`/root/.dsh/profiles/web`）、`/root/.dsh/settings.yaml`、`/root/.dsh/cordis.patch.yml`

### B. 识别过期 fork
```bash
DSH_HOME=/root/.dsh bash scripts/check-fork-versions.sh
```
预期：8 个 fork 全部 `[STALE]`（rc.6 vs rc.7）。这就是「静默跑旧版」的显式暴露。

### C. 拉 rc.7 源码逐项核对（优先官方）
拉取 rc.7 源码（GitHub raw / API，**注意 429 限流要退避重试**），对照下表逐项判断：

| 本工作区改动 | rc.7 相关变化 | 处置 |
|---|---|---|
| `dsh-host-apiproxy` 的 `exposedNamespaces()` 加第三方命名空间 | 「各插件可自行注册设置卡片」 | 很可能已官方化 → 核实后**弃用补丁** |
| `dsh-web-ui-settings` 的 rc.6 兼容 bridge + `allowlist.ts` | 同上 | 核实后**弃用 bridge/allowlist**（组卡片视需要保留） |
| `dsh-client-ui-settings` 的 scope 一律 `host` 模式 | 同上 | 核实后**弃用 fork** |
| `dsh-llm-pi-ai` 手写思考档位 off/low/medium/high | 「DeepSeek 模型新增 low 推理强度」 | 部分重叠 → 核实第三方供应商是否仍需 |
| `dsh-host-webserver` 的 `registerGate` 门闸钩子 | 无对应 | **保留，重 base** |
| `dsh-client-connection` 的 `webAuthAuthed` 登录放行特权方法 | 无对应 | **保留，重 base** |
| `dsh-llm` / `dsh-llm-deepseek` 重试兜底读 `dsh-defaults` | 无对应 | **保留，重 base** |
| `dsh-host-directory-picker-browse` 默认目录读 `dsh-defaults` | 无对应 | **保留，重 base** |

> rc.7 其它条目（Job Panel、MCP 图片、Bash 卡顿、分页栈溢出、max-tokens、Safari 光标、node-pty、Cordis 面板、Code mode→PTC、提问卡片折叠）与本工作区改动基本无关，但升级后要顺手回归验证这些地方没被 fork 盖坏。

### D. 重 base / 弃用
- **保留的 fork**：把 `packages/<pkg>/src` 更新到 rc.7 官方源码 + 重打补丁（补丁对照各项目 `定制记录/本次diff.patch`），版本号改成 `0.1.0-rc.7-local.1`。
- **弃用的 fork/适配层**：从安装流程移除，收敛 `cordis.patch.yml` / 安装脚本。

### E. 重建 + 测试环境验证
```bash
bash dsh-AccessGate/build.sh
bash dsh-Moresettings/build.sh
bash dsh-mobile/build.sh
(cd dsh-deepseekpet && node scripts/build.mjs)
bash dsh-task-suite/build.sh
```
测试环境（test-env，端口 3090）：先 `scripts/test-env-reset.sh --verified` 恢复基线 → 装各项目 → 启动 → 各项目 verify 全绿。

### F. 用户验收后正式重装
```bash
bash scripts/formal-reinstall.sh --rebuild
```

## 必须保留（升级过程中不要丢/不要改）

1. **默认重试次数 = 10**：`dsh-defaults` 的 `defaultRetryCount` schema 默认值（提交 `a6d768c` 刚改的），重 base 后仍要默认 10。
2. **署名**：deepseek-pet（MIT）、task-suite（Apache-2.0）、maid-atelier（CC BY-NC-SA）的署名/LICENSE/NOTICE 全程保留。
3. **正式环境数据**：`settings.yaml`（口令、密钥、模型配置、`defaultRetryCount:10` 等）升级时**不丢、不覆盖**。

## 验收标准（全部满足才算完成）

- `scripts/check-fork-versions.sh` 全部 `[OK]`（fork 版本 = rc.7，或已正确弃用）。
- 各项目 verify 全过（`dsh-AccessGate/verify.sh`、`dsh-Moresettings/verify-defaults.mjs`、`dsh-task-suite/verify.sh` 等）。
- 设置卡片（默认值 / Image understanding / 皮肤 / 桌宠）可读可写；默认重试次数显示 10。
- 门闸登录、目录选择器默认目录、重试兜底、思考强度菜单行为正常。
- 用户确认验收。
