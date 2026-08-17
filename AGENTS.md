# AGENTS.md —— DSH 升级工作区 AI 代理规则（强制）

> 本工作区用于升级 DeepSeek Harness（DSH）用户体验：改安装包补丁、构建正式插件、
> 沉淀升级恢复方案。你是本工作区的执行者，以下规则**每轮会话强制生效**；
> 与 CONTRIBUTING.md 冲突时以本文件为准。完整背景见
> [CONTRIBUTING.md](CONTRIBUTING.md) 与根 [README.md](README.md)。

## 红线（违反即失败，无例外）

1. **绝不触碰运行中的正式 DSH。** 不得对正式环境做任何替换/安装/升级/写入：
   - `$HOME/.dsh`（当前 `/root/.dsh`，含 `profiles/web`、`cordis.patch.yml`、settings.yaml）
   - 全局安装 `/usr/lib/node_modules/@deepseek-ai/dsh`
   - 正式实例（端口 3080 的 `dsh web` 进程）
   所有打包测试只允许在 `test-envs/`（独立 DSH_HOME + 独立端口）进行。
2. **绝不自杀式重启。** 你运行在 dsh web 进程里，**禁止 pkill/kill/重启任何
   `dsh web`**（包括自己进程树内的），执行中的工具调用会因此中断。
   需要「停→改→起」的操作一律封装成脚本（如 `install-to-profile.sh`、
   `switch-to-https.sh`），**交用户在 SSH 终端手动执行**。
3. **绝不直接改产物。** 禁止修改 node_modules / 安装包里的文件（lib/*.js 等）。
   改插件 = 改源码（src/）→ 构建 → 装进 `test-env` 验证。插件源码由用户掌握
   改造方向，动手前先确认改造方案。
4. **profile 配置原子化。** 运行中的 dsh web 会热重载 `cordis.patch.yml`；
   服务存活时改写会搞崩进程。必须：停服务 → 写配置 → 再启动（启动由用户执行）。
5. **不创建散落文件。** 工作区根目录只允许：`README.md`、`CONTRIBUTING.md`、
   `AGENTS.md`、`scripts/`、`test-envs/`、`docs/`、项目文件夹。所有内容进对应
   项目文件夹。
6. **不把测试当正式。** 测试环境验证通过 ≠ 可以自行正式安装。正式安装脚本
   （会重启正式 dsh web 的）只能由用户在 SSH 终端执行。
7. **插件必须符合官方安装方式。** 任何插件（自研 / fork / 收录）都必须能通过
   **官方机制安装**：`dsh plugin --profile <name> add <包>`（内部转发 pnpm，
   支持 npm 包 / GitHub（`github:owner/repo#sha`）/ tarball / 本地目录四种来源）。
   包结构必须满足：
   - `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
     （客户端插件另加 `"client": { "platform": "web", "inject": [...] }`）；
   - 包内带 `cordis.patch.yml`（patch 行按**包名**引用插件，如
     `- insert: [{ id: hello, name: dsh-hello-plugin }]`）；
   - `files` 字段声明发布清单（含 `lib/` 与 `cordis.patch.yml`）；
   - `lib/` 为**预构建产物**（npm/tarball 安装不跑构建脚本）；
   - 走 GitHub 安装时提供自包含 `prepare` 构建脚本，并接受用户侧
     `allowBuilds` 授权（见 `docs/上游开发规范/02-打包与安装插件.md`）。
   禁止绕过官方机制（如手写脚本直接往 profile node_modules 拷文件）。
   测试环境安装可沿用工作区脚本，但**正式安装必须走官方方式**。

   **唯一显式例外——`@deepseek-ai/*` 同包名覆盖 fork**：这类 fork 保留官方包名
   （如 `@deepseek-ai/dsh-host-webserver`），依赖 profile `node_modules/@deepseek-ai/`
   下同名包优先于全局安装实现「升级免疫」覆盖。它们不带 `dsh.bundle`（不是插件），
   且 `dsh plugin add` 会解析到官方 npm 同名包、装不了本地 fork，故正式安装允许由
   安装脚本（`install-access-gate-plugin.mjs` / `dsh-Moresettings/install-to-profile.sh`）
   直接写入 profile `node_modules/@deepseek-ai/<包名>`（覆盖前 `.bak` 备份）。
   其余一切自研 / 收录插件仍必须走官方 `dsh plugin add`。

## 测试环境速查（打包测试唯一去处）

```bash
scripts/test-env-status.sh                      # 状态：实例/端口/已装插件/使用声明
scripts/test-env-reset.sh --verified            # 验收后恢复基线（正式克隆基线；必须 --verified）
scripts/test-env-reset.sh --check               # 检查环境是否已是基线
scripts/test-env-install.sh --from-project <项目>  # 装已构建插件进测试 profile
scripts/test-env-stop.sh && scripts/test-env-start.sh   # 重启测试实例（端口 3090）
scripts/test-env-init.sh --force                # 重建基线（DSH 升级后适配）
```

**多测试环境**（`TEST_ENV_INDEX` 选择，默认 1；所有 `test-env-*.sh` 均支持），
统一收纳在 `test-envs/` 下：

| 索引 | 目录 | 端口 |
|---|---|---|
| 1 | `test-envs/test-env-1/` | 3090 |
| 2 | `test-envs/test-env-2/` | 3091 |
| 3 | `test-envs/test-env-3/` | 3092 |
| 4 | `test-envs/test-env-4/` | 3093 |

**基线定义**：测试环境基线 = **从正式 profile 克隆**（含正式环境已装插件/fork，
贴近真实环境），**不是**官方空模板。`test-env-reset.sh --verified` 重建基线时
克隆正式 profile + 写最小测试设置（不复制正式口令/密钥），并清空使用声明。

- **独占纪律（强制）**：**同一时刻一个测试环境只允许一个项目使用**（多 Agent
  并行时防止互相污染）。使用前必须在该环境 `USAGE.md` 填写「项目 / 用途 /
  开始时间」；`test-env-start.sh` 会检查声明——已被其他项目占用时拒绝启动。
- **验收纪律（强制）**：**测试完成后必须等用户验收通过，才允许清理测试环境**。
  `test-env-reset.sh` 恢复基线必须带 `--verified`（用户验收标记），不带参数
  直接拒绝，防止 Agent 误清未验收环境。USAGE.md 中「验收状态」字段记录
  待验收 / 已验收。
- **测试实例**：端口见上表（默认 3090）；基线从正式克隆，**不预置任何口令**
  （无门闸；装 access-gate 后首次访问自动进 `/setup` 由用户设置口令）。
  正式实例端口 **3080**，永远别碰。
- 用 `test-env-stop.sh` 停实例（按 PID 文件精确停止），不要 pkill -f 模糊匹配
  （模式含自身命令行会误杀自己）。

## 工作流速查

0. **开发必须遵从 [docs/开发规范.md](docs/开发规范.md)**（上游官方要点 + 本工作区
   约定 + 完成定义）；上游原文存档在 `docs/上游开发规范/`。
   **插件配置入口一律用「设置 → 插件 → 插件配置」区独立卡片
   （`settings.plugin.item`，样式同官方「网页搜索」卡片），禁止独立标签页**，
   详见开发规范 §2.5。
1. 先调研：`dsh-plugin` 主题 / awesome-dsh-plugin / Oh-My-DSH 找现成方案；
   开发基础以 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/> 为准。
2. 每个项目：先写思路库 README → 定位链路（前端 bundle 实时读盘刷新即生效；
   后端插件需重启，风险高不优先）→ 实施 → 语法校验（`node --check`）→
   **test-env 验证** → 记录变更/回退。
3. 涉及构建/安装包时读 `dsh-AccessGate/README.md` 与 `dsh-Moresettings/README.md`
   （同包名覆盖原理、tsdown 工具链、fork 参考实现）；**每个项目自包含**：fork 源码
   只在本项目 `packages/` 内（`dsh-AccessGate/packages/`：webserver / apiproxy /
   connection；`dsh-Moresettings/packages/`：picker / llm / llm-deepseek / pi-ai /
   apiproxy 本地副本 / client-picker），脚本不得跨项目引用；apiproxy 两项目各维护
   一份同源码副本（均含 access-gate + dsh-defaults 两个命名空间暴露，同包名覆盖
   时任一生效两项目设置卡片皆可用）。
4. 提交信息用 Conventional Commits（`type(scope): subject`），避免 emoji；
   **有意义的改动即 git 提交**，禁止把 node_modules / 测试环境 / 密钥提交入库。
5. 根 README 第 5 节项目清单、[PLUGINS.md](PLUGINS.md)（插件总览：使用/更新/维护）、
   各项目「升级后重打补丁指南.md」保持同步更新。

## 关键事实（升级后需核对）

- 当前安装：`/usr/lib/node_modules/@deepseek-ai/dsh`，版本 `0.1.0-rc.6`；
  正式 DSH_HOME：`/root/.dsh`；正式端口 3080；测试端口 3090。
- DSH 升级会覆盖安装包 → 补丁项目必须靠幂等重打脚本 + profile 插件化实现升级免疫。
