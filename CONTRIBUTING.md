# Contributing —— DSH 用户体验升级工作区贡献指南

> 你好！这里是「DSH 我独自升级」工作区（`<仓库根目录>`），
> 专门用于升级 DeepSeek Harness（DSH）的用户体验：Web GUI、CLI、工作区、会话、
> 以及把本地定制沉淀为正式插件。
>
> 本文件是**人类与 AI 代理共同遵守的规矩**；AI 代理的强制红线另见
> [AGENTS.md](AGENTS.md)（冲突时以 AGENTS.md 为准，两者都不得违反本工作区铁律）。
> 结构参考 [github/explore 的 CONTRIBUTING.md](https://github.com/github/explore/blob/main/CONTRIBUTING.md)：
> 先讲贡献方式，再讲准则，最后讲测试。

---

## 1. 这是什么地方

负责的典型工作：

- **Web GUI**（`dsh web`，正式实例默认 http://127.0.0.1:3080）交互优化；
- **CLI / 工作区 / 会话**等使用体验改进；
- 对 DSH 安装包做本地定制补丁，并配套「升级后恢复」方案；
- **源码化插件**：把补丁沉淀为正式插件（`@deepseek-ai/*` 同名覆盖 + profile 挂载），升级免疫。

开发基础文档（必须以此为基础开发）：

- 上游官方开发文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
- GitHub `dsh-plugin` 主题（插件生态）：<https://github.com/topics/dsh-plugin>
- 插件精选：<https://github.com/beancookie/awesome-dsh-plugin> ·
  聚合目录：<https://github.com/like-study1/Oh-My-DSH> ·
  插件市场：<https://github.com/AwesomeHou/dsh-plugin-marketplace>

## 2. 贡献方式（三种）

### A. 补丁项目（改安装包，需配重打脚本）

针对当前安装包（`/usr/lib/node_modules/@deepseek-ai/dsh`，当前版本 `0.1.0-rc.6`）
做直接补丁。**代价：DSH 升级会覆盖包内文件，所有补丁失效** → 必须配套幂等重打脚本
和 `升级后重打补丁指南.md`。已有项目：`修改默认工作目录/`、`思考强度与重试默认值/`、
`全网监听与登录鉴权/`。

### B. 插件项目（源码 → 构建 → profile 挂载，推荐）

从官方源码 fork 同名包（`@deepseek-ai/*`）定制，构建后装进
`<DSH_HOME>/profiles/web/node_modules/@deepseek-ai/`，Loader 以 profile 目录为解析
起点、同名包优先于全局安装 → **升级免疫**。参考实现：`dsh-AccessGate/packages/` 与
`dsh-Moresettings/packages/`（八个 fork 全部构建 + 测试环境验证通过）。

### C. 上游贡献（最稳）

把通用改进以 issue / PR 形式提交到上游
[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
或给社区插件仓库（dsh-web-ui 等）提 PR（先读对方仓库的 AGENTS.md / CONTRIBUTING.md）。

> 新需求先搜现成方案：`dsh-plugin` 主题、awesome-dsh-plugin、Oh-My-DSH 里
> 可能已有同类插件，先调研再决定自研还是复用。

## 3. 铁律（最高优先级，任何工作不得违反）

1. **禁止替换运行中的 DSH。** 打包测试 / 安装 / 升级，严禁在已运行的正式 DSH
   （`$HOME/.dsh`、全局安装、端口 3080 的进程）上强行替换——那会直接换掉自身正在
   运行的 DSH，导致程序崩溃。**必须先在工作区级专用测试环境（`test-env/`，
   独立 DSH_HOME + 端口 3090）测试通过，之后才允许安装。**
2. **agent 禁止自行重启 `dsh web`。** agent 运行在 dsh web 进程里，一旦
   pkill / 重启，执行中的工具调用即被中断（等于自杀）。凡需「停→改→起」的操作
   一律封装成脚本（如 `install-to-profile.sh`、`switch-to-https.sh`），
   **交给用户在 SSH 终端手动执行**。
3. **禁止直接修改 node_modules / 安装包里的产物**（lib/*.js 等）。改插件必须基于
   源码（src/）→ 重新构建 → 装进测试环境验证。插件源码保存在本地后，由用户按自己
   的想法改造，AI 不直接动插件文件；需要改造时先确认改造方案再动手。
4. **profile 配置改动必须原子化。** 运行中的 `dsh web` 会热重载
   `cordis.patch.yml` 的改动，在服务存活时改写会触发配置热重载、把承载
   Web/agent 会话的进程搞崩。顺序：停服务 → 写配置 → 再启动。
5. **工作区根目录只允许出现**：`README.md`、`CONTRIBUTING.md`、`AGENTS.md`、
   `scripts/`、`test-env/`、`docs/` 和项目子文件夹；具体内容一律进各自项目文件夹。
6. **每个项目自带 `verify.sh` 与回退方案**；正式安装前必须在测试环境全量验证，
   并逐条记录到 `变更记录.md`。
7. **开发必须遵从开发规范**：详见 [docs/开发规范.md](docs/开发规范.md)
   （上游官方要点 + 本工作区约定 + 完成定义）；上游原文存档在
   [docs/上游开发规范/](docs/上游开发规范/)。

## 4. 目录约定

```
DSH我独自升级/
├── README.md            ← 工作区用途 + 项目清单（升级后需更新版本号处）
├── CONTRIBUTING.md      ← 本文件：贡献规矩（人类 + AI）
├── AGENTS.md            ← AI 代理红线（强制，冲突时以它为准）
├── scripts/             ← 共享工具：测试环境管理（test-env-*.sh）、上游文档抓取
├── test-env/            ← 工作区级专用 DSH 测试环境（独立 DSH_HOME + 端口 3090）
├── docs/                ← 开发规范（docs/开发规范.md）+ 上游原文存档（docs/上游开发规范/）
└── <项目名>/            ← 一个项目一个文件夹
    ├── README.md        ← 思路库：问题、原理链路、方案、备选思路
    ├── <工具脚本>       ← 幂等补丁/构建/安装脚本
    ├── verify.sh        ← 验证脚本
    ├── 升级后重打补丁指南.md ← DSH 升级后的恢复指引
    └── <项目名>定制记录/ ← 本次实际改动记录（README + 变更记录.md + 本次diff.patch）
```

## 5. 标准工作流程

1. **建文件夹**：`mkdir <项目名>`，先写项目 `README.md` 思路库骨架。
2. **分析链路**：先搜现成方案，再定位改动点在整条链路的位置（前端插件 bundle /
   后端 RPC / profile 配置），记录原理图，列出候选改法。
3. **选改动点**：优先「改完浏览器刷新即可生效」的前端 bundle 方案（服务端对
   `/plugins/<id>/client.js` 每请求实时读盘、`cache-control: no-cache`），
   避免需要重启 `dsh web` 的方案（会中断 GUI 和会话）。后端插件改动需重启，
   风险更高，一般不优先。
4. **实施**：动手前确认目标文件位置与版本；改动后先做语法/格式校验
   （如 `node --check`）。
5. **测试环境验证（必经）**：构建产物装进 `test-env/`（`scripts/test-env-install.sh`），
   启动测试实例（`scripts/test-env-start.sh`，端口 3090），在浏览器实测；
   验证脚本 + 实测结果逐条写进 `变更记录.md`。**正式实例（3080）不做任何实验。**
6. **留备份**：被覆盖的文件旁留 `.bak`，回退方法写进记录。
7. **写恢复方案**：补丁/安装脚本做成**幂等**（重复执行安全），写
   `升级后重打补丁指南.md`。
8. **正式安装（仅用户）**：生成 `本次diff.patch`，更新项目 README 与根 README
   项目清单；把正式安装脚本（会停/重启 dsh web 的）交给用户，在 SSH 终端手动执行。
9. **收尾**：记录验证结论与回退路径。

## 6. 插件开发规范（成为插件开发者）

- **插件本质**：一个导出 `name` + `apply(ctx)` 的 TypeScript 模块，基于
  `@deepseek-ai/cordis` 的 `Context` 注册能力；依赖服务用 `inject` 声明；
  资源清理用 `ctx.effect()`。三种形态：函数 / 对象 / 类（提供服务时用类）。
  见上游文档「第一个插件」与「Cordis 框架教程」。
- **只基于官方 NPM SDK（`@deepseek-ai/*`）开发**，禁止修改 DSH 源码、禁止
  tsconfig 指向任何 DSH 源码 checkout（类型只从 node_modules 解析）。
- **同包名覆盖（Same-name Override）**：fork 保留官方包名（如
  `@deepseek-ai/dsh-host-webserver`），构建后装进测试/正式 profile 的
  `node_modules/@deepseek-ai/`，profile 同名包优先于全局 → 定制生效且升级免疫。
  原理与八个 fork 的实现见 `dsh-AccessGate/README.md`、`dsh-Moresettings/README.md`
  及各自 `定制记录/`（原母工程已解散，fork 源码归位到两项目 `packages/`）。
- **命名**：新插件一律 `dsh-` 前缀；客户端 UI 类插件按惯例
  `dsh-client-ui-*`、后端 `dsh-host-*`。
- **构建工具链**：tsdown（`build/tsdown.client.ts` 预设 vendored 自
  dsh-web-ui-main）+ lightningcss + typescript；client bundle 有纯度门
  （只能 require 平台表 + INLINE_SAFE 白名单里的包）。
- **打包产物必须可验证**：每个插件包目录含 `lib/`（构建产物）与 `package.json`；
  验证点写入项目 `verify.sh` 并在测试环境实测。
- **上游化意识**：能配置化（profile 挂载 / settings.yaml）就不改包；
  能上游化（PR / issue）就上游化；第三方生态已有同类时优先复用。
- **发布（可选，对生态贡献时）**：npm 包 + GitHub 仓库打 `dsh-plugin` 主题标签，
  即会被 Oh-My-DSH / 插件市场等聚合收录；发布节奏与提交规范参考
  `dsh-web-ui-main/CONTRIBUTING.md`（tag 触发、包版本与 tag 一致）。

## 7. 开发规范（强制）

**开发时必须遵从** [docs/开发规范.md](docs/开发规范.md)：上游官方要点（插件形态 /
Config schema / 打包分发三方式 / Web UI 使用）+ 本工作区约定（Git、构建产物纪律、
测试纪律、文档纪律）+ 完成定义（Definition of Done）。上游原文存档在
[docs/上游开发规范/](docs/上游开发规范/)（用 `scripts/fetch-upstream-doc.sh` 刷新）。

## 8. 测试环境（打包测试唯一去处）

工作区级专用测试环境：`test-env/`（独立 DSH_HOME、独立端口 3090、独立会话数据）。
管理命令（`scripts/`）：

| 命令 | 作用 |
|---|---|
| `scripts/test-env-init.sh` | 初始化/重建（默认从正式 profile 克隆基线；`--from <种子>` 从已验证目录克隆） |
| `scripts/test-env-start.sh [--port 3090]` | 启动测试实例（测试口令 test123456） |
| `scripts/test-env-stop.sh` | 按 PID 文件精确停止 |
| `scripts/test-env-status.sh` | 状态：实例 / 端口 / 已装插件 |
| `scripts/test-env-install.sh <包目录>…` | 把已构建插件装进测试 profile（自动 .bak 备份） |

标准打包测试流程：

```bash
cd dsh-AccessGate && ./build.sh && cd ..          # 1. 构建（或 dsh-Moresettings）
scripts/test-env-install.sh --from-project dsh-AccessGate   # 2. 装进测试环境
scripts/test-env-stop.sh && scripts/test-env-start.sh      # 3. 重启测试实例
# 浏览器 http://127.0.0.1:3090 验证（口令 test123456）
# 4. 全部通过后，正式安装脚本才允许由用户在 SSH 终端手动执行
```

隔离保证：测试实例的 `DSH_HOME=…/test-env`，端口 3090；正式实例端口 3080、
正式 DSH_HOME、全局安装目录均不被任何测试步骤触碰。测试环境可随时
`rm -rf test-env` 后重新 init，不影响任何正式数据。

## 9. 提交与记录规范

- **提交信息**：Conventional Commits 格式 `type(scope): subject`，type 用
  `feat` / `fix` / `chore` / `docs` / `test` / `refactor` / `perf`，scope 为
  项目名或主题；提交信息避免 emoji（对标 dsh-web-ui 全仓规则；既有脚本中的
  ✓/✗ 属装饰性符号，不强制改）。
- **变更记录**：每个项目 `变更记录.md` 记「做了什么、为什么、怎么验证、怎么回退」；
  机器可读改动沉淀为 `本次diff.patch`。
- **AI 协作**：AI 动手改插件源码前先确认改造方案；AI 只做构建/装测试环境/
  验证/记录，正式安装与重启由用户执行。使用 AI 生成内容时如实记录模型与工具。

## 10. 版本控制与发布到 GitHub 开源

工作区根目录已是 git 仓库（默认分支 `main`，初始化提交已完成）；GitHub SSH 密钥
已配置并验证通过（`ssh -T git@github.com` → `Hi zzyyyds88!`），远端用 SSH 地址。
日常流程：

```bash
git add <改动文件> && git commit -m "feat(项目名): 一句话说明"   # 有意义的改动即提交
git pull --rebase && git push                                   # 有远端后
```

- **提交规范**：Conventional Commits（`type(scope): subject`），type ∈
  `feat|fix|chore|docs|test|refactor|perf`；提交信息避免 emoji。
- **插件总览**：仓库的插件清单（正在使用 / 使用方法 / 更新情况 / 维护）维护在
  [PLUGINS.md](PLUGINS.md)，改动插件后同步更新。
- **禁止入库**（.gitignore 已覆盖）：`node_modules/`、测试环境运行态
  （`test-env/` 仅保留 README.md）、第三方参考快照 `dsh-web-ui-main/`
  （88M，可随时按 `开发备忘.md` 的加速下载命令重新获取）、日志与密钥。
- **发布到 GitHub 开源检查清单**（仓库名已定：`dsh-solo-leveling`，远端已配）：
  1. 全库自查无敏感信息（口令/密钥/token；`git grep -i password` 复查）；
  2. 补 LICENSE（如 MIT，作者信息按需修改）；
  3. 在 GitHub 建空仓库 `dsh-solo-leveling`（Public）→ 本仓库远端已配置
     `origin = git@github.com:zzyyyds88/dsh-solo-leveling.git`，建好后
     `git push -u origin main` 即可；
  4. 仓库打 topic 标签：`dsh`、`dsh-plugin`、`deepseek-harness`、`plugin`、
     `self-hosted`、`linux-server`，即会被 [dsh-plugin 主题](https://github.com/topics/dsh-plugin)
     及 Oh-My-DSH / 插件市场等聚合收录；
  5. 根 README 面向公众改写（去掉本机路径等私有细节），可考虑拆成
     `README.en.md` 双语。
- **发布插件到 npm（个人）**：完全可以。同名覆盖 fork（`@deepseek-ai/*`）不能
  发 npm（scope 受保护、包为 private），走 git/tarball/profile 分发；全新独立
  插件用个人 scope `@zzyyyds88/dsh-*` 发布。完整步骤见
  [docs/发布npm插件.md](docs/发布npm插件.md)。

## 11. 验证与门禁

- 每个项目提交/安装前：`verify.sh` 全绿 + 测试环境实测通过。
- 改 profile 配置、装后端插件后：重启测试实例重验。
- 语法校验：`node --check`；构建产物用项目 `build.sh` / `verify.sh` 把关。
- 正式安装前检查清单：
  1. 测试环境（3090）全链路验证通过并记录；
  2. 正式安装脚本已备份/幂等；
  3. 回退路径明确（.bak 位置、unpatch 方法）；
  4. 用户在场，由用户在 SSH 终端执行会重启 dsh web 的脚本。

## 12. 升级应对（DSH 升级之后）

1. 更新根 README「当前安装版本」；对比新版本差异。
2. 各补丁项目执行 `升级后重打补丁指南.md`（幂等重打脚本）。
3. 重建测试环境基线：`scripts/test-env-init.sh --force`（从新正式 profile 克隆），
   再重装定制插件验证。
4. 若定制已插件化（profile 挂载），升级通常天然免疫，只需重验。

## 13. 参考链接

- 上游官方文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
  （开发规范原文存档：`docs/上游开发规范/`）
- 上游快速开始：<https://deepseek-harness.github.io/deepseek-harness/guide/quickstart>
- GitHub `dsh-plugin` 主题：<https://github.com/topics/dsh-plugin>
- awesome-dsh-plugin：<https://github.com/beancookie/awesome-dsh-plugin>
- Oh-My-DSH 聚合目录：<https://github.com/like-study1/Oh-My-DSH>
- dsh-plugin-marketplace：<https://github.com/AwesomeHou/dsh-plugin-marketplace>
- dsh-web-ui 全家桶（本工作区内的参考实现）：`dsh-web-ui-main/` 的
  [CONTRIBUTING.md](dsh-web-ui-main/CONTRIBUTING.md) 与 [AGENTS.md](dsh-web-ui-main/AGENTS.md)
- 插件开发备忘（GitHub 加速下载等）：[开发备忘.md](开发备忘.md)
