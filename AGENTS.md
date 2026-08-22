# AGENTS.md —— 大宝贝定制版 AI 代理规则（强制）

> 本仓库 = **大宝贝定制版**：deepseek-harness 的 fork 整合包（基线 `dsh-v0.1.1-rc.2`，源码平铺仓库根）。自研/收录插件与「改官方包」的定制改动**直接整合进 harness 源码**，不跟随官方更新。你是本仓库的执行者，以下规则**每轮会话强制生效**；与 CONTRIBUTING.md 冲突时以本文件为准。完整背景见 [README.md](README.md)。

## 环境定位

- 你是运行在本机（Windows）上的 **IDE 编码代理**，不是跑在 dsh web 进程里的代理；本仓库是 fork 整合包的**开发工作区**。
- 本机即唯一运行环境：没有独立的「正式实例」，验证与日常使用是同一个 `dsh web`（端口用其默认值即可，不指定特殊端口）。
- 停/起/重装全局 `dsh`（`npm i -g`）前先与用户确认。

## 红线（违反即失败，无例外）

1. **绝不直接改产物。** 禁止修改 node_modules / 安装包里的文件（lib/*.js 等）。改插件 = 改源码（src/）→ `pnpm run build` → 本地打包验证。插件源码由用户掌握改造方向，动手前先确认改造方案。
2. **改 harness 源码，不碰产物。** 本仓库已 fork 官方源码：自研/收录能力一律以 **第一方包**形式整合进 `packages/<group>/<pkg>/`（包名 `@deepseek-ai/dsh-*`），**不再**走「`@deepseek-ai/*` 同包名覆盖 fork + 脚本铺 profile」的旧路（该路已被本 fork 取代）。fork 逐项映射见 [docs/升级适配指南.md §2](docs/升级适配指南.md)；新插件装配点见 `packages/client/AGENTS.md` 与 `apps/cli/composition.md`。
3. **升级重 base 不得静默丢定制。** 同步上游新版文件后，必须用 `git diff` 逐文件核对「- 方向」没有删掉 fork 定制行——装配/启动类文件（`cordis.patch.yml`、composition、preset、`apps/cli` 与 `packages/bundle/web-app` 的启动接线）尤其要单独过一遍；最后起实例做插件存在性冒烟验证，不能只靠构建与单测全绿。
4. **不创建散落文件。** 仓库根即 harness monorepo：`packages/`、`apps/`、`vendor/`、`website/`、`python/`、`native/`、`examples/` 等是 harness 结构，不得另建散落目录。自研/收录插件按官方分组迁入 `packages/<group>/<pkg>/`。工作区运维文件（`docs/`、`scripts/`）保持在根；临时文件用完即删，不留仓库。
5. **一切可调参数必须进「设置 → 插件 → 插件配置」卡片，禁止固化。** 整合包内今后新增的任何插件，凡有可调参数（阈值、尺寸、端点、次数、开关等）都必须通过「设置 → 插件 → 插件配置」区的独立卡片（`settings.plugin.item`，样式同官方「网页搜索」卡片）暴露出来、即时生效，**绝不允许把参数硬编码进源码/样式/资源**。配置口径见 [docs/开发规范.md §2.5](docs/开发规范.md)；需要默认值时在 schema 里给默认值（如 `dsh-defaults`），由设置卡覆盖，而非写死在代码里。

## 打包 / 验证速查（整合包）

```bash
pnpm install && pnpm run build                 # 构建：tsc -b（host/client）+ tsdown + web bundle
node scripts/package-npm.mjs [--scope <个人>]  # 打包：dsh CLI + 全部 workspace 依赖包 → dist/npm/*.tgz（Linux 可用 bash scripts/package-npm.sh）
npm i -g ./dist/npm/*.tgz                      # 全局安装（体验同 npx @deepseek-ai/dsh web）
dsh web                                        # 起实例验收
```

## 协作规则

## 设计文档是唯一事实来源

- [docs/开发规范.md](docs/开发规范.md)、[docs/升级适配指南.md](docs/升级适配指南.md)、[docs/整合迁移路线图.md](docs/整合迁移路线图.md) 是当前有效的产品与技术设计基线；本文件（红线）对代理行为约束的权威性高于三者。
- 代码、测试、配置与设计文档冲突时，以当前设计文档为准；发现冲突后应立即修正。
- 历史实施记录（如 plans/、research/）只用于追溯，不得覆盖当前设计。
- `apps/cli/reference/` 中的内容仅供调研参考，不属于本项目规范，也不作为实现依据。

## 功能变更流程

按任务规模分级执行，避免小任务套用大流程。

### 任务规模分级

| 级别 | 标准 | 例子 |
|------|------|------|
| 大任务 | 跨模块、架构变更、新增子系统、改状态机、改公共契约 | 新增核心子系统、改造核心架构、新增对外契约 |
| 中任务 | 单模块改动、2-4 文件、不改变跨模块契约 | 修某屏幕 UI、调整配置项、单模块功能增强 |
| 小任务 | 单文件、bug 修复、文案/常量/配色调整、不改行为契约 | 改文案、修崩溃、调常量、修 lint、格式整理 |

### 各级别流程

**大任务**：①先改设计文档（单独提交 docs:）→ ②生成任务拆分文档（breakdown:）→ ③并行实现代码（feat:/fix:）→ ④删除拆分文档（chore:）

**中任务**：①先改设计文档 → ②实现代码，docs+code 可同提交（feat:/fix:），免拆分文档

**小任务**：①直接改代码（fix:/chore:），无需改设计文档（除非改了行为契约）

### 通用规则

- 修 bug 是"让实现符合设计"，不是"改设计"，小任务 bug 修复无需先改设计文档
- 纯文案错别字、格式、不影响行为的注释，可不升级设计版本；若改变需求解释或程序行为仍按功能变更处理
- 确认变更影响到的设计文档、配置 schema、代码、CLI 和测试
- 同一功能的设计文档、代码和测试原则上放在同一个 Git 提交中（避免只改代码不改设计），大任务因拆分文档流程除外
- 运行受影响测试；不能运行的测试必须在交付说明中明确原因和风险
- 任务拆解后尽可能并行分派子代理执行，审查其产出，不合格则打回重做，直至全部通过
- 编写代码前先检查工作区是否干净；不干净先提交再写
- 报错优先网络搜索，禁止瞎猜；修改一次仍失败则转搜索

## Git 与安全要求

- 默认分支使用 main。
- 提交必须原子化、工作区绝对干净，一次提交只做一件事，类型用 feat/fix/docs/refactor/test/chore/breakdown 等。
- 提交信息使用清晰的中文或约定式前缀。
- 提交后工作区须回到干净状态，不留任何过程垃圾；仓库当前版本只保留设计文档和最终成品，中间过程仅存于 Git 历史。
- 禁止把 API Key、访问令牌、私钥、签名口令、真实用户数据和带凭据的远程 URL 提交到任何 Git 历史。
- 公钥可以提交；私钥只能保存在被 .gitignore 排除的本地路径中。

## 仓库边界与整合包形态

- 根仓库：大宝贝定制版主仓库，跟踪整个 harness monorepo（`packages/`、`apps/`、`vendor/`、`website/`、`python/`、`native/`、`examples/`、`docs/`、`scripts/` 等）。
- `apps/cli/reference/`：上游参考资料，已纳入版本管理，仅供调研。
- 除可生成或运行时产物（模型文件、临时输出、日志、上传资源、.env、依赖缓存等，由 `.gitignore` 排除）外，源码、配置、迁移脚本、插件源码等唯一知识来源一律追踪。
- **整合包形态**：本仓库 = `@deepseek-ai/dsh` CLI（`apps/cli`，`bin.dsh = lib/bin.js`）
  + 第一方插件（`packages/*/*`，包名 `@deepseek-ai/dsh-*`），全部打包进 npm tarball，官方用法 `npx @deepseek-ai/dsh web` / `dsh web`。
- **验证口径**：构建全绿 → 测试 → 打包 → 全局安装 → 起实例逐项实测（含插件存在性冒烟）。
- **scope 约束**：`@deepseek-ai` scope 归官方所有、无法发布；正式发布需换个人 scope（`--scope <个人>`，bin 仍叫 `dsh`）。

## 工作流速查

0. **开发必须遵从 [docs/开发规范.md](docs/开发规范.md)**（上游官方要点 + 本工作区约定 + 完成定义），官方开发基础见 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/>。**插件配置入口一律用「设置 → 插件 → 插件配置」区独立卡片（`settings.plugin.item`，样式同官方「网页搜索」卡片），禁止独立标签页**，详见开发规范 §2.5。**DSH 官方升级适配必须遵从 [docs/升级适配指南.md](docs/升级适配指南.md)**：铁律「**官方新版已实现与本仓库相同功能 → 优先用官方、弃用对应 fork/适配层**」，保留的 fork 必须重 base 到新版官方源码，详见该指南 §2 清单与 §3 流程。
1. 先调研：`dsh-plugin` 主题 / awesome-dsh-plugin / Oh-My-DSH 找现成方案；开发基础以 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/> 为准。
2. 每个项目：定位链路（前端 bundle 实时读盘刷新即生效；后端插件需重启）→ 实施 → 语法校验（`node --check`）→ **本地打包验证** → 记录变更/回退。
3. 整合插件时读 `packages/README.md`（分组规范、包名 `@deepseek-ai/dsh-*`、层级表）与 `packages/client/AGENTS.md`（新插件 checklist）；迁移前先读懂 `apps/cli/composition.md` 与 `packages/preset/` 确定装配点。
4. 提交信息用 Conventional Commits（`type(scope): subject`），避免 emoji；**有意义的改动即 git 提交**，禁止把 node_modules / 密钥提交入库。
5. 根 [README.md](README.md) 与 [PLUGINS.md](PLUGINS.md) 保持同步更新。

## Conventions

**通用约定：**

- **文档一处一事实**：红线以本文件为唯一权威（见上），其余规则各归其位——子树 AGENTS.md、包 README、docs/；重复内容一律改为链接而非复述。
- **提交信息**用 Conventional Commits（`type(scope): subject`），避免 emoji；有意义的改动即提交。
- **代码/注释/文档**避免 emoji；产品文案中文、代码注释英文。
- **改源码不碰产物**：改插件 = 改 `packages/<group>/<pkg>/src` → `pnpm run build` → 本地打包验证（红线 1 / 2）。
- **可调参数进设置卡**：凡可调参数必须进「设置 → 插件 → 插件配置」卡片，禁止硬编码（红线 5）。

## 关键事实（需核对）

- 本仓库基线 = deepseek-harness `dsh-v0.1.1-rc.2`（已平铺仓库根；上一基线 `dsh-v0.1.0-rc.8`）；**不跟随官方更新**，自维护基线；所有 workspace 包版本号带 `-local.1` 本地后缀（如 `0.1.1-rc.2-local.1`）防 npm 安装被官方包覆盖。
- vendored packages are rescoped ([mapping](docs/rescope.md)) and `private: true`. `@deepseek-ai/cordis` is a peerDependency (+ dev) of every harness package.
- 整合迁移铁律：**官方 rc.2 已实现同功能 → 优先用官方、弃用对应 fork/适配层**；保留的 fork 必须重 base 到 rc.2 源码（见 [docs/升级适配指南.md](docs/升级适配指南.md)）。
- 平台支持：Linux / Windows / Termux（Android）三平台均可构建打包运行；打包脚本有跨平台 node（`scripts/package-npm.mjs`）与 bash（`scripts/package-npm.sh`）两个版本。
- 构建入口：`pnpm install && pnpm run build`；打包 `node scripts/package-npm.mjs`；验证走全局安装（`npm i -g ./dist/npm/*.tgz` → `dsh web`）。
- 皮肤中心只保留 **maid-atelier（Abyssal Maid Atelier）**，其余皮肤源码已删除。
- **完成定义（验收/打包/发布）**：开发完成后本地打包自测 → `dsh web` 起实例验收 → 用户自测 → **用户测试通过后才 push GitHub**（通过前禁止 push）。
