# Contributing —— DSH 用户体验升级工作区贡献指南

> 你好！这里是「DSH 我独自升级」工作区（本仓库根目录），
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
- **第一方插件**：自研/收录能力以 `@deepseek-ai/dsh-*` 第一方包整合进 `packages/*/*`，
  打包进 dsh CLI（整合包），整体分发。

开发基础文档（必须以此为基础开发）：

- 上游官方开发文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
- GitHub `dsh-plugin` 主题（插件生态）：<https://github.com/topics/dsh-plugin>
- 插件精选：<https://github.com/beancookie/awesome-dsh-plugin> ·
  聚合目录：<https://github.com/like-study1/Oh-My-DSH> ·
  插件市场：<https://github.com/AwesomeHou/dsh-plugin-marketplace>

## 2. 贡献方式（两种）

### A. 整合进 harness 源码（第一方包）

自研/收录能力以 `@deepseek-ai/dsh-*` 第一方包形式整合进 `packages/<group>/<pkg>/`，
改源码（src/）→ `pnpm run build` → 本地打包验证。整体打包成 dsh CLI 整合包，
`npm i -g` 后 `dsh web` 一装全有。装配点与分组规范见
[docs/整合迁移路线图.md](docs/整合迁移路线图.md) 与 `packages/README.md`。

### B. 上游贡献

把通用改进以 issue / PR 形式提交到上游
[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
或给社区插件仓库（dsh-web-ui 等）提 PR（先读对方仓库的 AGENTS.md / CONTRIBUTING.md）。

> 新需求先搜现成方案：`dsh-plugin` 主题、awesome-dsh-plugin、Oh-My-DSH 里
> 可能已有同类插件，先调研再决定自研还是复用。

## 3. 铁律（最高优先级，任何工作不得违反）

1. **禁止替换运行中的 DSH。** 打包测试 / 安装 / 升级，严禁在已运行的正式 DSH
   （`$HOME/.dsh`、全局安装、端口 3080 的进程）上强行替换——那会直接换掉自身正在
   运行的 DSH，导致程序崩溃。**必须先本地打包后在独立实例（非 3080 端口）
   验证通过，之后才允许安装。**
2. **agent 禁止自行重启 `dsh web`。** agent 运行在 dsh web 进程里，一旦
   pkill / 重启，执行中的工具调用即被中断（等于自杀）。凡需「停→改→起」的操作
   **交给用户在 SSH 终端手动执行**。
3. **禁止直接修改 node_modules / 安装包里的产物**（lib/*.js 等）。改插件必须基于
   源码（src/）→ 重新构建 → 本地打包验证。插件源码保存在本地后，由用户按自己
   的想法改造，AI 不直接动插件文件；需要改造时先确认改造方案再动手。
4. **profile 配置改动必须原子化。** 运行中的 `dsh web` 会热重载
   `cordis.patch.yml` 的改动，在服务存活时改写会触发配置热重载、把承载
   Web/agent 会话的进程搞崩。顺序：停服务 → 写配置 → 再启动。
5. **工作区根目录只允许出现**：`README.md`、`CONTRIBUTING.md`、`AGENTS.md`、
   `scripts/`、`docs/` 和项目子文件夹；具体内容一律进各自项目文件夹。
6. **改动带回退方案**；正式安装前必须本地打包后在独立实例全量验证。
7. **开发必须遵从开发规范**：详见 [docs/开发规范.md](docs/开发规范.md)
   （上游官方要点 + 本工作区约定 + 完成定义）；上游原文存档在
   [docs/上游开发规范/](docs/上游开发规范/)。
8. **一切可调参数必须进「设置 → 插件 → 插件配置」卡片，禁止固化**：整合包内今后
   新增的任何插件，凡有可调参数（阈值、尺寸、端点、次数、开关等）都必须通过
   「设置 → 插件 → 插件配置」区独立卡片（`settings.plugin.item`，样式同官方
   「网页搜索」卡片）暴露、即时生效，**绝不允许硬编码进源码/样式/资源**；
   默认值放 schema（如 `dsh-defaults`），由设置卡覆盖，而非写死。

## 4. 目录约定

```
仓库根 = harness monorepo（rc.7 平铺）
├── packages/            ← harness 包 + 迁入的第一方插件（@deepseek-ai/dsh-*）
├── apps/                ← dsh CLI 与 Web 前端产品装配
├── vendor/              ← 上游 vendored 框架包
├── docs/                ← harness 文档 + 本工作区文档（开发规范/升级适配/整合路线图）
├── scripts/             ← harness 脚本 + 打包脚本（package-npm.sh）
├── README.md            ← 工作区用途总览
├── CONTRIBUTING.md      ← 本文件：贡献规矩（人类 + AI）
└── AGENTS.md            ← AI 代理红线（强制，冲突时以它为准）
```

## 5. 标准工作流程

1. **分析链路**：先搜现成方案，再定位改动点在整条链路的位置（前端插件 bundle /
   后端 RPC / profile 配置），记录原理图，列出候选改法。
2. **选改动点**：优先「改完浏览器刷新即可生效」的前端 bundle 方案（服务端对
   `/plugins/<id>/client.js` 每请求实时读盘、`cache-control: no-cache`），
   避免需要重启 `dsh web` 的方案（会中断 GUI 和会话）。后端插件改动需重启，
   风险更高，一般不优先。
3. **实施**：改 `packages/<group>/<pkg>/src`，改动后先做语法/格式校验（如 `node --check`）。
4. **构建**：`pnpm run build` 全绿。
5. **独立实例验证（必经）**：本地打包（`scripts/package-npm.sh`）后起独立实例
   （非 3080 端口）在浏览器实测；实测结果逐条记录。**正式实例（3080）不做任何实验。**
6. **正式安装（仅用户）**：`npm i -g ./dist/npm/*.tgz`（会停/重启 dsh web），
   交给用户在 SSH 终端手动执行。
7. **收尾**：记录验证结论与回退路径，git 提交（Conventional Commits）。

## 6. 插件开发规范（成为插件开发者）

- **插件本质**：一个导出 `name` + `apply(ctx)` 的 TypeScript 模块，基于
  `@deepseek-ai/cordis` 的 `Context` 注册能力；依赖服务用 `inject` 声明；
  资源清理用 `ctx.effect()`。三种形态：函数 / 对象 / 类（提供服务时用类）。
  见上游文档「第一个插件」与「Cordis 框架教程」。
- **第一方包命名**：`@deepseek-ai/dsh-*`；客户端 UI 类 `dsh-client-ui-*`、
  后端 `dsh-host-*`。新插件迁入 `packages/<group>/<pkg>/`。
- **构建工具链**：tsdown + lightningcss + typescript；client bundle 有纯度门
  （只能 require 平台表 + INLINE_SAFE 白名单里的包）。
- **打包产物必须可验证**：每个包含 `lib/`（构建产物）与 `package.json`；
  本地打包后在独立实例实测。
- **上游化意识**：能配置化（profile 挂载 / settings.yaml）就不改包；
  能上游化（PR / issue）就上游化；第三方生态已有同类时优先复用。
- **发布（可选，对生态贡献时）**：npm 包 + GitHub 仓库打 `dsh-plugin` 主题标签，
  即会被 Oh-My-DSH / 插件市场等聚合收录；发布节奏与提交规范参考
  上游 `dsh-web-ui` 仓库的 CONTRIBUTING.md（tag 触发、包版本与 tag 一致）。

## 7. 开发规范（强制）

**开发时必须遵从** [docs/开发规范.md](docs/开发规范.md)：上游官方要点（插件形态 /
Config schema / 打包分发三方式 / Web UI 使用）+ 本工作区约定（Git、构建产物纪律、
测试纪律、文档纪律）+ 完成定义（Definition of Done）。上游原文存档在
[docs/上游开发规范/](docs/上游开发规范/)（用 `scripts/fetch-upstream-doc.sh` 刷新）。

## 8. 打包 / 验证（整合包）

本仓库 = `@deepseek-ai/dsh` CLI + 第一方插件整合包，验证走「构建 → 打包 → 本地全局安装 → 独立实例实测」：

```bash
pnpm install && pnpm run build                 # 1. 构建
bash scripts/package-npm.sh [--scope <个人>]   # 2. 打包 → dist/npm/*.tgz
npm i -g ./dist/npm/*.tgz                      # 3. 本地安装（体验同 npx @deepseek-ai/dsh web）
dsh web --port 3090                            # 4. 起独立实例验证（端口避开正式 3080）
```

隔离保证：验证实例用独立 `DSH_HOME` + 非 3080 端口；正式实例（3080）、正式
DSH_HOME、全局安装目录均不被任何验证步骤触碰。

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
- **禁止入库**（.gitignore 已覆盖）：`node_modules/`、构建产物（`lib/`、`dist/`、
  src 下的编译输出）、第三方参考快照（`dsh-web-ui-main/` 已删除，可按 `开发备忘.md` 重下）、日志与密钥。
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
- **发布到 npm（整合包）**：本仓库 = `@deepseek-ai/dsh` CLI + 第一方插件整合包；
  `@deepseek-ai` scope 归官方所有、无法发布，正式发布需换个人 scope（
  `bash scripts/package-npm.sh --scope @zzyyyds88`，bin 仍叫 `dsh`）。完整流程见
  [docs/整合迁移路线图.md §8](docs/整合迁移路线图.md)。

## 11. 验证与门禁

- 提交/安装前：`pnpm run build` 构建全绿 + 独立实例实测通过。
- 语法校验：`node --check`。
- 正式安装前检查清单：
  1. 独立实例（非 3080 端口）全链路验证通过并记录；
  2. 正式安装（`npm i -g`）已备份/幂等；
  3. 回退路径明确（旧 tarball / 旧全局安装）；
  4. 用户在场，由用户在 SSH 终端执行会重启 dsh web 的操作。

## 12. 升级应对（DSH 升级之后）

1. 更新根 README「快速安装」与 CONTRIBUTING.md §1 里的 DSH 版本号；对比新版本差异。
2. 各补丁项目执行 `升级后重打补丁指南.md`（幂等重打脚本）。
3. 重新 `pnpm install && pnpm run build` 构建整合包，本地打包后独立实例重验。
4. 若定制已插件化（第一方包），升级通常天然免疫，只需重验。

## 13. 参考链接

- 上游官方文档：<https://deepseek-harness.github.io/deepseek-harness/develop/basic/>
  （开发规范原文存档：`docs/上游开发规范/`）
- 上游快速开始：<https://deepseek-harness.github.io/deepseek-harness/guide/quickstart>
- GitHub `dsh-plugin` 主题：<https://github.com/topics/dsh-plugin>
- awesome-dsh-plugin：<https://github.com/beancookie/awesome-dsh-plugin>
- Oh-My-DSH 聚合目录：<https://github.com/like-study1/Oh-My-DSH>
- dsh-plugin-marketplace：<https://github.com/AwesomeHou/dsh-plugin-marketplace>
- dsh-web-ui 全家桶（上游参考）：[zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)
  （本地快照已删除，按 `开发备忘.md` 加速命令可重下）
- 插件开发备忘（GitHub 加速下载等）：[开发备忘.md](开发备忘.md)

## 14. 关键经验（踩坑记录）

> 从已有项目沉淀的实战经验，开发前先扫一遍，避免重复踩坑。

- **DSH 升级/重装会覆盖安装包**，所有直接改包内文件的补丁都会失效 → 必须配幂等重打脚本。
- 服务端对 `/plugins/<id>/client.js` 的响应是**每请求实时读盘、`cache-control: no-cache`**，
  改完文件浏览器刷新即生效，无需重启、不打断会话。
- 后端插件（`dsh-host-*`）改动**需要重启 `dsh web`**，风险更高，一般不优先选。
- **⚠ 运行中的 `dsh web` 会热重载 `cordis.patch.yml` 的改动**：在服务存活时改写该文件，
  会触发配置热重载、把承载 Web/agent 会话的进程搞崩（表现为工具调用莫名中断/任务失败）。
  → 所有 profile 配置改动必须**原子化**：先停服务 → 写配置 → 再启动。
- **⚠ agent 绝不能自己重启 `dsh web`**：agent 就运行在 dsh web 进程里，一旦 pkill/重启，
  执行中的工具调用会被中断（等于自杀）。凡需重启 dsh 的操作（停→改→起）一律封装成脚本，
  交给用户在 SSH 终端执行。
- **端口不要硬编码进 dsh 侧配置**：trustedHosts 固化用**无端口 host**（任意端口放行），
  改端口只动 `dsh web --port`，与 dsh 配置解耦。
- **同一端口无法同时收 HTTP 与 HTTPS**（服务通性）：「http 自动跳 https」只能另开端口，
  用户明确**不要额外 http 跳转入口**——HTTPS 服务直接使用 https:// 前缀，勿自作主张加跳转端口。
- **局域网访问优先整体上 HTTPS，不要逐个打 polyfill**：明文 HTTP 是非安全上下文，
  `crypto.randomUUID` 等浏览器 API 不可用；`dsh web` 默认直接 HTTPS（0.0.0.0:3080，
  纯 JS 自签证书，也可在访问门禁卡上传自有证书）+ `--trusted-host` 一次解决，而非逐个补丁。
- **⚠ 打包测试必须与正式实例隔离**：验证实例用独立 `DSH_HOME` + 独立端口（非 **3080**），
  与正式实例（**3080**）完全隔离；禁止 pkill -f 模糊匹配。
- **用户偏好**：首次启动**绝不自动生成/打印任何随机口令**，只提示用户自己设置；按钮少而精。
- **插件配置入口规范**：一律用「设置 → 插件 → 插件配置」区独立卡片（`settings.plugin.item`，
  样式同官方「网页搜索」卡片），禁止独立标签页（见 [docs/开发规范.md §2.5](docs/开发规范.md)）。
- **⚠ 客户端 bundle 里绝不能用 classList 操作 React 管理的 className**：React 会重写 className，
  与 MutationObserver 形成死循环，实测直接把 renderer 搞崩（页面无声关闭、无报错）。改 DOM
  标记一律用 `data-*` 属性。
