# 插件列表（Plugin List）

> 本仓库（DSH 用户体验升级工作区）存放的插件与定制清单，适用于
> DSH `0.1.0-rc.6`（升级后请同步更新 §3 的适配版本）。
> 内容：**1. 正在使用的插件　2. 公开插件的使用方法　3. 插件的更新情况　
> 4. 插件维护（DSH 破坏性更新应对）**。
>
> **⚠ 插件源码正在整理完善中，暂未上传本仓库**（本地保留，完善后将随仓库发布）。
> 本文件是插件总览：先公开使用方式、更新情况与维护方案，源码发布后同步补齐。

---

## 1. 正在使用的插件

### 1.1 自研/定制插件（源码维护，升级免疫）

| 插件 | 类型 | 作用 | 挂载方式 |
|---|---|---|---|
| `dsh-host-webserver`（fork @deepseek-ai） | 后端 | `registerGate` 门闸钩子：HTTP + WebSocket 统一过闸（未登录 302/401/403） | profile 同名覆盖 |
| `dsh-host-apiproxy`（fork @deepseek-ai） | 后端 | `exposedNamespaces` 增加 `web-auth` / `dsh-defaults` 设置命名空间 | profile 同名覆盖 |
| `dsh-client-connection`（fork @deepseek-ai） | 客户端 | 登录后放行 `settings.*`（`webAuthAuthed`） | profile 同名覆盖 |
| `dsh-host-directory-picker-browse`（fork @deepseek-ai） | 后端 | 目录选择器默认打开目录读取 `dsh-defaults.defaultWorkingDirectory`（空 = 主目录） | profile 同名覆盖 |
| `dsh-llm`（fork @deepseek-ai） | 后端 | 注册兜底：未声明 retryPolicy 的 adapter 按 `dsh-defaults.defaultRetryCount` 兜底 | profile 同名覆盖 |
| `dsh-llm-deepseek`（fork @deepseek-ai） | 后端 | 内置 DeepSeek 供应商未声明 retryPolicy 时按 `dsh-defaults.defaultRetryCount` 兜底 | profile 同名覆盖 |
| `dsh-llm-pi-ai`（fork @deepseek-ai） | 后端 | 手写 OpenAI 风格模型默认思考强度档位 off/low/medium/high + `supportsReasoningEffort`；第三方供应商未声明 retryPolicy 时按 `dsh-defaults.defaultRetryCount` 兜底 | profile 同名覆盖 |
| `dsh-defaults` | 后端 | 注册 `dsh-defaults` 设置命名空间（默认工作目录 / 默认重试次数），GUI 可配置 | profile 挂载 |
| `dsh-client-ui-defaults` | 前端 | 「设置 → 插件 → 插件配置 → 默认值」卡片：配置默认工作目录与默认重试次数，保存即生效 | profile 挂载 |
| `dsh-web-auth`（[kitty-eu-org](https://github.com/kitty-eu-org/dsh-web-auth)） | 后端 | 登录门闸：首次 `/setup` 设口令、会话 Cookie + 限速 | profile 挂载 |
| `dsh-client-ui-web-auth` | 前端 | 「设置 → 插件 → 访问口令」独立标签页（改口令后旧会话立即失效） | profile 挂载 |
| `dsh-host-access-gate` | 后端 | **访问门禁**：登录门闸（首次 `/setup` 设口令、会话 Cookie + 限速、`access-gate` 口令命名空间）；由 `dsh-web-auth` 改名规范化，正式形态见 `dsh-AccessGate/` | profile 挂载 |
| `dsh-client-ui-access-gate` | 前端 | 「设置 → 插件 → 插件配置 → 访问口令」**卡片**（`settings.plugin.item`，样式同官方网页搜索卡片）；由 `dsh-client-ui-web-auth` 改名 + 标签页改卡片 | profile 挂载 |
| `dsh-mobile-adapt` | 前端 | 移动端适配 | profile 挂载 |
| `deepseek-pet`（[keleus/deepseek-pet](https://github.com/keleus/deepseek-pet)，MIT，收录） | 前端 | **网页桌宠**：随任务/工具调用/上下文占用/活跃会话自动切换表情（思考/编码/等待批准/多会话忙碌等），支持拖动、缩放、折叠、批准/提问气泡；**增强**：WebAudio 音效（完成琶音/出错安慰/戳音）、edge-tts 离线语音（23 条原创台词）、长按摸头、双击静音、三击诊断、纸屑庆祝、音量持久化 | profile 挂载（`deepseek-pet/install-to-test-env.sh` / 正式 `dsh plugin add`） |
| `@zzyyyds88/dsh-task-suite-all`（`dsh-task-suite/`，自 [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) v0.1.17 抽取） | 前端聚合 | **精选 Web UI 插件集（一个包装齐）**：任务看板（五列 + cron 定时跑 + 真实会话执行）、实时令牌统计（TPS/LLM 耗时/上下文/缓存命中/输入输出 token）、实时吞吐统计（流式估算）、Git 图谱（分支泳道 + 提交历史）、右侧面板（文件树 + 多标签预览 + SCM stage/unstage/discard）、图像理解（describe_image 工具 + 配置卡）、设置中心、皮肤中心 + 11 款皮肤 | 聚合包 cordis.patch.yml 汇总子包行；皮肤互斥走 HOME 层 managed 区段（皮肤中心热切换，无需重启） |
| `@zzyyyds88/dsh-client-ui-task-board` | 前端 | **任务看板**：五列（待规划/待办/进行中/已完成/已失败），卡片「执行」交给真实 DSH 会话并回写状态，详情可配 cron 定时跑 | 聚合包子包 |
| `@zzyyyds88/dsh-live-stats` | 前端 | **实时令牌统计 + 实时吞吐统计**：输入框下方 TPS / LLM 耗时 / 上下文占用 / 缓存命中率 / 输入输出 token；会话状态行流式 token 估算（~ 启发式，provider 用量到达自动换真实值） | 聚合包子包 |
| `@zzyyyds88/dsh-client-ui-git-graph` | 前端+后端 | **Git 图谱**：分支选择器、提交历史、分支泳道图谱（host 端 git 服务 + 前端渲染） | 聚合包子包 |
| `@zzyyyds88/dsh-client-ui-aionui-panel` | 前端+后端 | **右侧面板**：文件树（搜索定位）+ 多标签预览（md/html/code/diff/csv/pdf/office/图片）+ SCM 变更（stage/unstage/discard），宽度拖拽 + 折叠持久化 | 聚合包子包 |
| `@zzyyyds88/dsh-tool-describe-image` | 前端+后端 | **图像理解**：`describe_image` 工具把图片（本地路径 / URL / 附件引用）交给 OpenAI 兼容视觉端点，只有返回文本进会话；输入框图片按钮；「设置 → 插件 → 插件配置 → Image understanding」卡配置端点/模型/密钥/默认指令，即时生效 | 聚合包子包 |
| `@zzyyyds88/dsh-client-ui-web-ui-settings` | 前端 | **设置中心**：「设置 → 插件 → 插件配置」Web UI 插件组卡片 + 社区插件索引 | 聚合包子包 |
| `@zzyyyds88/dsh-client-ui-skin-center` + `@zzyyyds88/dsh-skins` | 前端+后端 | **皮肤中心 + 皮肤全家桶**：列表/试穿/一键应用（host `/api/skin-center/*` 热切换）；11 款皮肤资产内置（含收录的 maid-atelier，CC BY-NC-SA 4.0） | 聚合包子包 |

> 皮肤：正式 profile 当前启用 `@linxin666/dsh-client-ui-skin-whale-song`（旧上游装）；
> `dsh-task-suite/` 的皮肤中心（`@zzyyyds88`）应用后会以 `@zzyyyds88` 重建
> HOME 层 managed 区段（旧行自动清除，属预期迁移）。
>
> `dsh-client-ui-directory-picker-browse` fork 已退役（默认目录改由 host 端
> `dsh-host-directory-picker-browse` 从设置读取，改设置即时生效、无需重启）。

### 1.2 补丁项目（安装包级，升级需重打，正逐步被插件化替代）

| 项目 | 内容 | 现状 |
|---|---|---|
| ~~修改默认工作目录~~ | Web GUI 目录选择器默认打开 `/home/user/Projects` | 已被 **dsh-defaults 统一插件**替代，原文件夹已删除 |
| ~~思考强度与重试默认值~~ | 思考强度档位 + 默认重试 2→5 | 已被 **dsh-defaults 统一插件**替代（思考强度 fork 内建、重试设置页全局生效），原文件夹已删除 |
| `全网监听与登录鉴权/` | caddy HTTPS 反代 + 口令门闸 | 门闸/命名空间/放行已 fork 化；插件本体已**插件化并更名为「访问门禁」（`dsh-AccessGate/`）**，本文件夹保留为事故回滚参照（旧版补丁脚本已退役） |

### 1.3 环境

- 正式实例：端口 3080（`$HOME/.dsh`）；**专用测试环境：`test-env/`，端口 3090**
  （打包测试唯一去处，见 [test-env/README.md](test-env/README.md)）。

## 2. 公开插件的使用方法

安装方式（按插件类型选一）：

```bash
# A. profile 同名覆盖（本仓库的 fork 插件：定制 @deepseek-ai 同名包，升级免疫）
git clone <本仓库> && cd 定制插件化改造 && ./build.sh
bash install-to-profile.sh        # 会停/重启 dsh web，需在 SSH 终端手动执行
#   （测试先行：scripts/test-env-install.sh --from-project 定制插件化改造
#     + scripts/test-env-start.sh，端口 3090 验证）

# B. npm 包安装（发布到 npm 的独立插件）
dsh plugin add <包名>             # 例如 dsh plugin add @zzyyyds88/dsh-xxx

# C. git 安装（源码托管；拉取的是源码，作者需提供自包含 prepare 脚本，且需 allowBuilds 授权）
dsh plugin add github:<owner>/<repo>#<commit-sha>

# D. tarball（无需构建授权）
dsh plugin add ./<包名>-<版本>.tgz
```

各插件验证要点（安装后在浏览器或接口上核对）：

| 插件 | 验证方法 |
|---|---|
| `dsh-host-webserver`（门闸） | 未登录访问 `/` → 302/401/403；登录后放行；WS 未登录 403 |
| `dsh-host-apiproxy` + `dsh-client-connection` | 登录后 `settings.describe` 200 且含 `web-auth` / `dsh-defaults` 命名空间；未登录 401 |
| `dsh-host-directory-picker-browse` | `host.listDirectory`（无路径）返回设置页配置的默认目录 |
| `dsh-llm-pi-ai` | `llm.models` 中手写模型带 off/low/medium/high 强度菜单；未声明 retryPolicy 的供应商按 `defaultRetryCount` 重试 |
| `dsh-defaults` + `dsh-client-ui-defaults` | 设置 → 插件 → 插件配置 →「默认值」卡片可读写；改默认工作目录后选择器即时定位；重试默认对所有供应商生效（`node dsh-defaults/verify-defaults.mjs` 一键验证） |
| `dsh-web-auth` + `dsh-client-ui-web-auth` | 首次 `/setup` 设口令；设置 → 插件 → 访问口令可改口令 |
| `dsh-host-access-gate` + `dsh-client-ui-access-gate`（访问门禁） | 首次 `/setup` 设口令；设置 → 插件 → 插件配置 →「访问口令」**卡片**改口令；`settings.describe`（登录后）含 `access-gate` 命名空间 |
| `deepseek-pet` | 页面右下角出现桌宠角色；`deepseek-pet/verify.sh --live` 一键验证（boot 清单含 `deepseek-pet` 条目 + `/plugins/deepseek-pet/client.js` 可加载） |
| `dsh-task-suite`（`@zzyyyds88/*` 全家桶） | 侧边栏「任务看板」、输入框下方实时统计、输入框上方 Git 分支选择器、右侧「预览 / 文件/变更」面板、对话提到图片可走 describe_image、设置 → 插件 → 插件配置 Web UI 组（含 Image understanding 卡）+ 皮肤中心；`dsh-task-suite/verify.sh --live` 一键验证（boot 清单 8 插件 + 皮肤行 + bundle 路由）；皮肤热切换：`POST /api/skin-center/apply {"skin":"<id>"}` |

## 3. 插件的更新情况

| 插件 | 适配 DSH 版本 | 构建 | 测试环境验证 | 正式安装 | 备注 |
|---|---|---|---|---|---|
| 八个 fork 插件（webserver / apiproxy / connection / host-directory-picker / llm / llm-deepseek / pi-ai / 退役的 client-directory-picker） | 0.1.0-rc.6 | ✅ 全部构建通过 | ✅ 全链路 + 强度菜单 + 默认目录 + 全局重试兜底 | ⏳ 待用户执行（`dsh-defaults/install-to-profile.sh`） | 同包名覆盖，升级天然免疫 |
| `dsh-defaults` / `dsh-client-ui-defaults`（统一默认值插件） | 0.1.0-rc.6 | 源码即产物 | ✅ verify-defaults.mjs 9 项全过 | ⏳ 待用户执行 | 插件配置卡片：默认工作目录 + 对所有供应商生效的默认重试次数 |
| `dsh-web-auth` / `dsh-client-ui-web-auth` | 0.1.0-rc.6 | 源码即产物 | ✅ | ✅（正式 profile 已挂载） | 升级免疫；**已被「访问门禁」插件化替代（`dsh-AccessGate/`），正式切换待用户执行 `switch-to-https.sh`** |
| `dsh-host-access-gate` / `dsh-client-ui-access-gate`（访问门禁） | 0.1.0-rc.6 | 源码即产物（依赖 fork 需重建 apiproxy） | ✅ 17 项集成 + 真实实例链路（test-env 3090） | ⏳ 待用户执行（`dsh-AccessGate/switch-to-https.sh`） | 升级免疫；apiproxy fork 含 `access-gate` 命名空间暴露 |
| `dsh-mobile-adapt` | 0.1.0-rc.6 | ✅ | ✅ | ✅ | 升级免疫 |
| `deepseek-pet`（收录上游桌宠 + 移植 whale-pet 音效/语音/互动） | 0.1.0-rc.6 | ✅ `node scripts/build.mjs`（lib/ 已入库；语音 `scripts/synth-voice.py`） | ✅ test-env-2（3091）：boot 清单 + client bundle 加载全过（含音效/语音/纸屑/诊断功能） | ⏳ 待用户执行（`dsh plugin --profile web add github:keleus/deepseek-pet`） | 零改动收录（MIT）+ Web 端增强（WebAudio 音效、edge-tts 原创台词离线语音、长按摸头/双击静音/三击诊断/纸屑庆祝/音量持久化）；上游测试 14 项中 1 项断言 bug 不影响运行；升级免疫 |
| `dsh-task-suite`（`@zzyyyds88/dsh-task-suite-all` 聚合 + 7 功能包 + skin-center + dsh-skins + 11 皮肤，自 dsh-web-ui v0.1.17 抽取） | 0.1.0-rc.6 | ✅ `pnpm -r build`（22 包） | ✅ test-env（3090）：boot 8 插件 + maid-atelier 皮肤 + 皮肤热切换闭环 + 830+ 断言测试 | ⏳ 待用户执行 | 升级免疫（profile 插件）；皮肤互斥走 HOME 层 managed 区段；maid-atelier 为 CC BY-NC-SA 4.0 收录 |
| 补丁项目（默认目录 / 重试 / 鉴权安装包补丁） | 0.1.0-rc.6 | — | ✅（副本上全测） | ✅（已实施） | **升级后需重打**（幂等脚本 + `升级后重打补丁指南.md`；默认目录/重试已由 dsh-defaults 插件化替代，脚本保留兜底） |

> 更新日期：2026-08-16 核对。DSH 升级后请按 §4 流程重验并更新本表。

## 4. 插件维护（DSH 破坏性更新应对）

**维护原则**：优先插件化（profile 挂载、升级免疫）；补丁项目必须配幂等重打脚本；
任何打包测试只在 `test-env/`（3090）进行，通过后才允许正式安装（用户手动执行）。
**插件配置入口规范**：一律用「设置 → 插件 → 插件配置」区独立卡片
（`settings.plugin.item`，样式同官方「网页搜索」卡片），禁止独立标签页
（见 [docs/开发规范.md §2.5](docs/开发规范.md)）。

**DSH 升级后的统一流程**：

1. 更新根 README「当前安装版本」；查看上游 [changelog](https://github.com/deepseek-ai/deepseek-harness) 的破坏性变更。
2. 各补丁项目执行 `升级后重打补丁指南.md`（幂等重打脚本，如 `patch-*.py` / `install-auth-plugin.mjs` / `switch-to-https.sh`）。
3. 重建测试环境基线：`scripts/test-env-init.sh --force`（从新正式 profile 克隆），
   再 `scripts/test-env-install.sh --from-project 定制插件化改造` 重装定制插件。
4. 启动测试实例（`scripts/test-env-start.sh`，端口 3090）按 §2 验证要点逐条实测。
5. 全部通过后，由用户在 SSH 终端执行正式安装脚本；**回填本表 §3 的适配版本与日期**。

**各插件维护动作速查**：

| 插件/项目 | 升级后动作 | 回退方法 |
|---|---|---|
| fork 插件（profile 覆盖） | 通常免疫；重验即可；上游 API 变动时改 `src/` 重新构建 | 覆盖前自动 `.bak` 备份，拷回即回退 |
| `dsh-web-auth` / `dsh-host-access-gate` 等 npm 插件 | 随 profile 免疫；误删则重跑 `node dsh-AccessGate/install-access-gate-plugin.mjs --allow-formal`（旧版重跑 `node install-auth-plugin.mjs`） | 同脚本幂等重装 |
| 安装包补丁（三个旧项目） | 重跑各自幂等补丁脚本 + `switch-to-https.sh` | 补丁旁 `.bak` / unpatch 说明 |
| `deepseek-pet`（收录桌宠） | 随 profile 免疫；上游更新时 `git fetch` 合并 + `node scripts/build.mjs` 重建 + test-env 重验 | `dsh plugin --profile web remove deepseek-pet`；测试环境 `node deepseek-pet/install-pet-plugin.mjs --unpatch` |
| `dsh-task-suite`（精选 Web UI 插件集） | 随 profile 免疫；上游 dsh-web-ui 发新版时对照 README §1 重新抽取相关包源码 + `pnpm -r build` + test-env 重验；DSH 大版本升级按 `dsh-task-suite/升级后重打补丁指南.md` | 测试环境：`scripts/test-env-reset.sh`（patch 有 `.bak`）；正式：删 `node_modules/@zzyyyds88/` 目录 + 还原 `cordis.patch.yml` 与 HOME 层 managed 区段（先备份） |
| retryPolicy 配置 | 重跑 `patch-retry-policy.py`（apply/幂等/unpatch 全测过） | 脚本 unpatch |
