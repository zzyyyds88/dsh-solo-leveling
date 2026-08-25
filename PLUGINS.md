# 插件列表（Plugin List）

> 本仓库 = **大宝贝定制版**：deepseek-harness `dsh-v0.1.1-rc.2` 的 fork 整合包，源码平铺仓库根。
> 所有自研/收录插件已迁入 `packages/<group>/<pkg>/`（包名 `@deepseek-ai/dsh-*`），
> 按官方分组命名并装配进 `packages/bundle/*/cordis.patch.yml`，`pnpm run build` 后
> `dsh web` 一装全有，不再走「旧目录 + profile 挂载」老路。fork 逐项映射见
> [docs/工作区/升级适配指南.md](docs/工作区/升级适配指南.md)。

## 1. 正在使用的插件

### 1.1 自研/定制插件（已整合进 harness 源码，`@deepseek-ai/dsh-*` 第一方包）

| 包 | 组 | 作用 |
|---|---|---|
| `dsh-host-access-gate` + `dsh-client-ui-access-gate` | host / client | **访问门禁**：登录门闸（首次 `/setup` 设口令、会话 Cookie + 限速、`access-gate` 口令命名空间）+「设置 → 插件 → 插件配置 → 访问门禁」卡片（改口令 + HTTPS 证书方式：自动自签 / 上传自有证书） |
| `dsh-defaults` + `dsh-client-ui-defaults` | settings / client | 默认工作目录 / 默认重试次数的设置命名空间 +「默认值」卡片 |
| `dsh-client-ui-mobile-adapt` | client | **手机端适配**：窄屏聊天区占满全宽、右侧面板变抽屉（含遮罩关闭）、输入框 16px 防 iOS 缩放、虚拟键盘避让（输入卡可滚到键盘上方、桌宠让位）、桌宠窄屏默认展开并抬到输入区上方（缩放可调，最小化仍贴角）、会话标题行窄屏水平居中、设置弹层手机端专项（触控目标/圆角/外观方块/字段行作用域修复）；「移动端适配」设置卡可调总开关/断点/三个抽屉宽度/桌宠缩放（保存即生效） |
| `dsh-client-ui-pet` | client | **网页桌宠**：随任务/工具/上下文/活跃会话切换表情，WebAudio 音效（基础+附加分组）、edge-tts 离线语音、账房 token 统计、纸屑庆祝 |
| `dsh-host-task-board` + `dsh-client-ui-task-board` | host / client | **任务看板**：五列看板 + 真实会话执行；台账落 `$DSH_HOME/task-board/ledger.json`、cron 调度与执行收进 host 进程（网页不开也照跑），`/api/task-board/*`（CRUD/run/migrate/SSE）供网页看板与手机遥控共用，`task-board/changed` 事件广播全量快照 |
| `dsh-host-mobile-remote` + `dsh-client-ui-mobile-remote` | host / client | **手机遥控**：DSH 遥控器 App 与本机 dsh 之间的 BFF——`/api/mobile/*`（info 握手 / 白名单 RPC 进程内转发 / respond 审批与问答应答 / 工作区圈根产物读取）+ `/api/mobile/events` 单向下行 WS 事件流（mux/host/taskboard，15s ping，上行即 1008）；鉴权复用访问门禁；「手机遥控」设置卡管总开关与请求体上限（保存即生效） |
| `dsh-client-ui-live-stats` | client | **实时令牌统计**：TPS / LLM 耗时 / 上下文 / 缓存命中 / 输入输出 token |
| `dsh-client-ui-describe-image` | client | **图像理解**：`describe_image` 工具 +「Image understanding」配置卡（端点/模型/密钥/重试次数） |
| `dsh-host-git-graph` + `dsh-client-ui-git-graph` | host / client | **Git 图谱**：分支选择器 + 提交历史 + 分支泳道 |
| `dsh-host-aionui-panel` + `dsh-client-ui-aionui-panel` | host / client | **右侧面板**：Explorer 文件树 + Preview 多 tab 预览 + SCM 变更（stage/unstage/discard） |
| `dsh-client-ui-skin-maid-atelier` | client | 唯一皮肤资产：Abyssal Maid Atelier（CC BY-NC-SA 4.0） |
| `dsh-client-ui-skin-center` | client | **皮肤中心**：列表/试穿/一键应用（host `/api/skin-center/*` 热切换） |

> 8 个同名 fork（webserver / apiproxy / connection / ui-settings / directory-picker-browse /
> llm / llm-deepseek / llm-pi-ai）已重 base 到 rc.2 对应包源码，保留/弃用现状见
> [docs/工作区/升级适配指南.md §2](docs/工作区/升级适配指南.md)。

### 1.2 已退役的旧部署形态（git 历史可见，不再维护）

| 项目 | 内容 | 现状 |
|---|---|---|
| ~~修改默认工作目录~~ | Web GUI 目录选择器默认打开 `/home/user/Projects` | 已被 **dsh-defaults 统一插件**替代，原文件夹已删除 |
| ~~思考强度与重试默认值~~ | 思考强度档位 + 默认重试 2→5 | 已被 **dsh-defaults 统一插件**替代 |
| ~~全网监听与登录鉴权~~ | HTTPS 监听 0.0.0.0 + 口令门闸 | 已插件化并收敛为「访问门禁」+ 默认 HTTPS（`dsh-host-access-gate` / `dsh-client-ui-access-gate`；TLS 由 `dsh-web-app` 原生提供：纯 JS 自签或上传自有证书，caddy 二进制已移除） |

### 1.3 环境

- 本机即唯一运行环境：验证与日常使用是同一个 `dsh web`（默认端口 3080，`$HOME/.dsh`）。

## 2. 公开插件的使用方法

> 本仓库插件已整合进 harness 源码，**无需** `dsh plugin add` 单独安装——`pnpm run build`
> 后 `dsh web` 一装全有。对外分发（打包成 npm 包）的流程见 [CONTRIBUTING.md §8](CONTRIBUTING.md)。

各插件验证要点（构建后在浏览器或接口上核对）：

| 插件 | 验证方法 |
|---|---|
| 访问门禁 | 首次 `/setup` 设口令；设置 → 插件 → 插件配置 →「访问门禁」卡片改口令 + 证书方式（自签 / 上传自有证书）；未登录 302/401/403；默认 HTTPS 0.0.0.0:3080 开箱可用 |
| 默认值 | 设置 → 插件 → 插件配置 →「默认值」卡片可读写；改默认工作目录后选择器即时定位 |
| 手机遥控 | 登录拿 Cookie 后 `GET /api/mobile/info` 返回 protocolVersion=1；`POST /api/mobile/rpc` 调 `host.describe`/`session.list` 成功、白名单外得 `method-not-allowed`；wscat 连 `/api/mobile/events` 先收 `mobile/hello`，上行消息被 1008 关闭；设置卡关总开关后全部 404 且拒升级 |
| 手机端适配 | 手机视口（≤768px）打开 GUI：聊天区占满全宽、右侧面板变抽屉、设置面板无竖排；键盘弹起后输入卡可滚到键盘上方且桌宠让位；点遮罩可关闭侧栏/详情/文件树/预览抽屉 |
| 桌宠 | 页面右下角出现桌宠；音效/语音/账房/诊断面板正常 |
| 任务看板 / 实时统计 / Git 图谱 / 右侧面板 / 图像理解 / 皮肤中心 | 见各包 README 与本地打包实测 |

## 3. 插件维护（DSH 破坏性更新应对）

**维护原则**：改插件 = 改 `packages/<group>/<pkg>/src` → `pnpm run build` → 本地打包验证；
打包后全局安装（`npm i -g ./dist/npm/*.tgz`）起实例验收，停/起/重装前先与用户确认。
详见 [AGENTS.md](AGENTS.md) 红线。

- fork 保留/弃用与重 base 口径：见 [docs/工作区/升级适配指南.md](docs/工作区/升级适配指南.md)。
- 可调参数一律进「设置 → 插件 → 插件配置」卡片（AGENTS.md 红线 5）；手机端适配的
  断点 / 抽屉宽度 / 桌宠缩放已通过「移动端适配」卡片暴露（2026-08-22 补齐，
  含总开关，保存即生效）。
