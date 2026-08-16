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
   所有打包测试只允许在 `test-env/`（独立 DSH_HOME + 端口 3090）进行。
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
   `AGENTS.md`、`scripts/`、`test-env/`、`docs/`、项目文件夹。所有内容进对应
   项目文件夹。
6. **不把测试当正式。** 测试环境验证通过 ≠ 可以自行正式安装。正式安装脚本
   （会重启正式 dsh web 的）只能由用户在 SSH 终端执行。

## 测试环境速查（打包测试唯一去处）

```bash
scripts/test-env-status.sh                      # 状态：实例/端口/已装插件
scripts/test-env-reset.sh                       # 恢复官方基线（幂等；--check 检查残留）
scripts/test-env-install.sh --from-project <项目>  # 装已构建插件进测试 profile
scripts/test-env-stop.sh && scripts/test-env-start.sh   # 重启测试实例（端口 3090）
scripts/test-env-init.sh --force                # 重建基线（DSH 升级后适配）
```

- **环境恢复纪律（强制）**：测试环境的默认状态是**官方基线**（`test-env-reset.sh`
  重建：官方 bundles + 空 patch + 空 settings + 空 node_modules）。**每次打包测试
  完成后（无论成败）必须运行 `test-env-stop.sh && test-env-reset.sh` 恢复官方
  基线**，保证下一次测试从干净的官方行为开始；安装前也先 `--check` 确认基线。
- 测试实例：`DSH_HOME=…/test-env`，端口 **3090**；官方基线无鉴权，临时挂载
  web-auth 后口令 `test123456`（test-env/settings.yaml）。正式实例端口 **3080**，永远别碰。
- 用 `test-env-stop.sh` 停实例（按 PID 文件精确停止），不要 pkill -f 模糊匹配
  （模式含自身命令行会误杀自己）。

## 工作流速查

0. **开发必须遵从 [docs/开发规范.md](docs/开发规范.md)**（上游官方要点 + 本工作区
   约定 + 完成定义）；上游原文存档在 `docs/上游开发规范/`。
1. 先调研：`dsh-plugin` 主题 / awesome-dsh-plugin / Oh-My-DSH 找现成方案；
   开发基础以 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/> 为准。
2. 每个项目：先写思路库 README → 定位链路（前端 bundle 实时读盘刷新即生效；
   后端插件需重启，风险高不优先）→ 实施 → 语法校验（`node --check`）→
   **test-env 验证** → 记录变更/回退。
3. 涉及构建/安装包时读 `定制插件化改造/README.md`（同包名覆盖原理、tsdown 工具链、
   五个 fork 参考实现）与 `定制插件化改造/改造方案.md`。
4. 提交信息用 Conventional Commits（`type(scope): subject`），避免 emoji；
   **有意义的改动即 git 提交**，禁止把 node_modules / 测试环境 / 密钥提交入库。
5. 根 README 第 5 节项目清单、[PLUGINS.md](PLUGINS.md)（插件总览：使用/更新/维护）、
   各项目「升级后重打补丁指南.md」保持同步更新。

## 关键事实（升级后需核对）

- 当前安装：`/usr/lib/node_modules/@deepseek-ai/dsh`，版本 `0.1.0-rc.6`；
  正式 DSH_HOME：`/root/.dsh`；正式端口 3080；测试端口 3090。
- DSH 升级会覆盖安装包 → 补丁项目必须靠幂等重打脚本 + profile 插件化实现升级免疫。
