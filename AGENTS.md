# AGENTS.md —— 大宝贝定制版 AI 代理规则（强制）

> 本仓库 = **大宝贝定制版**：deepseek-harness 的 fork 整合包（基线 `dsh-v0.1.0-rc.8`，源码平铺仓库根）。自研/收录插件与「改官方包」的定制改动**直接整合进 harness 源码**，不跟随官方更新。你是本仓库的执行者，以下规则**每轮会话强制生效**；与 CONTRIBUTING.md 冲突时以本文件为准。完整背景见 [README.md](README.md)。

## 红线（违反即失败，无例外）

1. **绝不触碰运行中的正式 DSH。** 不得对正式环境做任何替换/安装/升级/写入：
   - `$HOME/.dsh`（当前 `/root/.dsh`，含 `profiles/web`、`cordis.patch.yml`、settings.yaml）
   - 全局安装 `/usr/lib/node_modules/@deepseek-ai/dsh`
   - 正式实例（端口 3080 的 `dsh web` 进程）所有验证/打包测试只允许在独立环境（独立 DSH_HOME + 非 3080 端口）进行。
2. **绝不自杀式重启。** 你运行在 dsh web 进程里，**禁止 pkill/kill/重启任何 `dsh web`**（包括自己进程树内的），执行中的工具调用会因此中断。需要「停→改→起」正式 dsh web 的操作，**交用户在 SSH 终端执行** （不在本 dsh web 进程内执行）。
3. **绝不直接改产物。** 禁止修改 node_modules / 安装包里的文件（lib/*.js 等）。改插件 = 改源码（src/）→ `pnpm run build` → 本地打包验证。插件源码由用户掌握改造方向，动手前先确认改造方案。
4. **profile 配置原子化。** 运行中的 dsh web 会热重载 `cordis.patch.yml`；服务存活时改写会搞崩进程。必须：停服务 → 写配置 → 再启动（启动由用户执行）。
5. **不创建散落文件。** 仓库根即 harness monorepo：`packages/`、`apps/`、`vendor/`、 `website/`、`python/`、`native/`、`examples/` 等是 harness 结构，不得另建散落目录。自研/收录插件按官方分组迁入 `packages/<group>/<pkg>/`；迁移前的旧源码暂留 `dsh-*/`（迁完后归档删除）。工作区运维文件（`docs/`、`scripts/`）保持在根。
6. **不把本地验证当正式。** 本地验证通过 ≠ 可以自行正式安装。正式安装/升级统一由**用户在 SSH 终端**执行（`npm i -g ./dist/npm/*.tgz`，会停/起正式 dsh web）；本工作区 agent（运行在 dsh web 进程内）仍**禁止**执行会停/起正式 dsh web 的操作——停/起正式 web 由用户确认后执行。
7. **改 harness 源码，不碰产物。** 本仓库已 fork 官方源码：自研/收录能力一律以 **第一方包**形式整合进 `packages/<group>/<pkg>/`（包名 `@deepseek-ai/dsh-*`）， **不再**走「`@deepseek-ai/*` 同包名覆盖 fork + 脚本铺 profile」的旧路（该路已被本 fork 取代）。改插件 = 改对应包的 `src/` → `pnpm run build` → 本地打包验证； **禁止直接改 node_modules / 安装包产物**（与红线 3 一致）。fork 逐项映射见 [docs/升级适配指南.md §2](docs/升级适配指南.md)；新插件装配点见 `packages/client/AGENTS.md` 与 `apps/cli/composition.md`。
8. **一切可调参数必须进「设置 → 插件 → 插件配置」卡片，禁止固化。** 整合包内今后新增的任何插件，凡有可调参数（阈值、尺寸、端点、次数、开关等）都必须通过「设置 → 插件 → 插件配置」区的独立卡片（`settings.plugin.item`，样式同官方「网页搜索」卡片）暴露出来、即时生效，**绝不允许把参数硬编码进源码/样式/资源**。配置口径见 [docs/开发规范.md §2.5](docs/开发规范.md)；需要默认值时在 schema 里给默认值（如 `dsh-defaults`），由设置卡覆盖，而非写死在代码里。

## 打包 / 验证速查（整合包）

```bash
pnpm install && pnpm run build                 # 构建：tsc -b（host/client）+ tsdown + web bundle
bash scripts/package-npm.sh [--scope <个人>]   # 打包：dsh CLI + 全部 workspace 依赖包 → dist/npm/*.tgz（Windows/Termux 用 node scripts/package-npm.mjs）
npm i -g ./dist/npm/*.tgz                      # 本地安装（体验同 npx @deepseek-ai/dsh web）
dsh web --port 3090                            # 起独立实例验证（端口避开正式 3080）
```

- **整合包形态**：本仓库 = `@deepseek-ai/dsh` CLI（`apps/cli`，`bin.dsh = lib/bin.js`）
  + 第一方插件（`packages/*/*`，包名 `@deepseek-ai/dsh-*`），全部打包进 npm tarball，官方用法 `npx @deepseek-ai/dsh web` / `dsh web`。
- **验证口径**：构建全绿 → 打包 → 本地全局安装 → 起独立实例逐项实测； **旧的 `test-envs/` 逐插件测试环境已移除**（整合包无法逐插件上测试环境）。
- **scope 约束**：`@deepseek-ai` scope 归官方所有、无法发布；正式发布需换个人 scope（`--scope <个人>`，bin 仍叫 `dsh`）。
- 正式实例端口 **3080** 永远别碰；验证用其它端口（如 3090）。

## 工作流速查

0. **开发必须遵从 [docs/开发规范.md](docs/开发规范.md)**（上游官方要点 + 本工作区约定 + 完成定义），官方开发基础见 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/>。 **插件配置入口一律用「设置 → 插件 → 插件配置」区独立卡片（`settings.plugin.item`，样式同官方「网页搜索」卡片），禁止独立标签页**，详见开发规范 §2.5。 **DSH 官方升级适配必须遵从 [docs/升级适配指南.md](docs/升级适配指南.md)**：铁律「**官方新版已实现与本仓库相同功能 → 优先用官方、弃用对应 fork/适配层**」，保留的 fork 必须重 base 到新版官方源码，详见该指南 §2 清单与 §3 流程。
1. 先调研：`dsh-plugin` 主题 / awesome-dsh-plugin / Oh-My-DSH 找现成方案；开发基础以 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/> 为准。
2. 每个项目：定位链路（前端 bundle 实时读盘刷新即生效；后端插件需重启，风险高不优先）→ 实施 → 语法校验（`node --check`）→ **本地打包验证** → 记录变更/回退。
3. 整合插件时读 `packages/README.md`（分组规范、包名 `@deepseek-ai/dsh-*`、层级表）与 `packages/client/AGENTS.md`（新插件 checklist）；迁移前先读懂 `apps/cli/composition.md` 与 `packages/preset/` 确定装配点。
4. 提交信息用 Conventional Commits（`type(scope): subject`），避免 emoji； **有意义的改动即 git 提交**，禁止把 node_modules / 测试环境 / 密钥提交入库。
5. 根 [README.md](README.md) 与 [PLUGINS.md](PLUGINS.md) 保持同步更新。

## Conventions

**通用约定：**

- **文档一处一事实**：红线以本文件为唯一权威（见上），其余规则各归其位——子树 AGENTS.md、包 README、docs/；重复内容一律改为链接而非复述。
- **提交信息**用 Conventional Commits（`type(scope): subject`），避免 emoji；有意义的改动即提交。
- **代码/注释/文档**避免 emoji；产品文案中文、代码注释英文。
- **改源码不碰产物**：改插件 = 改 `packages/<group>/<pkg>/src` → `pnpm run build` → 本地打包验证（红线 3 / 7）。
- **可调参数进设置卡**：凡可调参数必须进「设置 → 插件 → 插件配置」卡片，禁止硬编码（红线 8）。

## 关键事实（需核对）

- 本仓库基线 = deepseek-harness `dsh-v0.1.0-rc.8`（官方 commit `f1f7dc36fa`，已平铺仓库根）； **不跟随官方更新**，自维护基线；所有 workspace 包版本号带 `-local.1` 本地后缀（如 `0.1.0-rc.8-local.1`）防 npm 安装被官方包覆盖。
- vendored packages are rescoped ([mapping](docs/rescope.md)) and `private: true`. `@deepseek-ai/cordis` is a peerDependency (+ dev) of every harness package.
- 运行中的正式 DSH：`/usr/lib/node_modules/@deepseek-ai/dsh`（当前 `0.1.0-rc.8-local.1`）、 DSH_HOME `/root/.dsh`、端口 3080 —— **永远别碰**。
- 整合迁移铁律：**官方 rc.8 已实现同功能 → 优先用官方、弃用对应 fork/适配层**；保留的 fork 必须重 base 到 rc.8 源码（见 [docs/升级适配指南.md](docs/升级适配指南.md)）。
- 平台支持：Linux / Windows / Termux（Android）三平台均可构建打包运行；打包脚本有 bash（`scripts/package-npm.sh`）与跨平台 node（`scripts/package-npm.mjs`）两个版本。
- 构建入口：`pnpm install && pnpm run build`；打包 `bash scripts/package-npm.sh`；验证走本地全局安装（`npm i -g ./dist/npm/*.tgz` → `dsh web`）；正式安装由用户在 SSH 终端执行（会停/起正式 dsh web）。
- 皮肤中心只保留 **maid-atelier（Abyssal Maid Atelier）**，其余皮肤源码已删除。
- **完成定义（验收/打包/发布）**：迁移完成后由我本地测 → 打包成 npm 包（同官方 `npx @deepseek-ai/dsh web` 用法，见 `apps/cli` 的 `bin.dsh`）→ 用户自测 → **用户测试通过后才 push GitHub**（通过前禁止 push）。
