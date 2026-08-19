# 插件列表（Plugin List）

> 本仓库 = **大宝贝定制版**：deepseek-harness `dsh-v0.1.0-rc.7` 的 fork 整合包，源码平铺仓库根。
> 所有自研/收录插件已迁入 `packages/<group>/<pkg>/`（包名 `@deepseek-ai/dsh-*`），
> 按官方分组命名并装配进 `packages/bundle/*/cordis.patch.yml`，`pnpm run build` 后
> `dsh web` 一装全有，不再走「旧目录 + profile 挂载」老路。迁移映射见
> [docs/整合迁移路线图.md](docs/整合迁移路线图.md)。

## 1. 正在使用的插件

### 1.1 自研/定制插件（已整合进 harness 源码，`@deepseek-ai/dsh-*` 第一方包）

| 包 | 组 | 作用 |
|---|---|---|
| `dsh-host-access-gate` + `dsh-client-ui-access-gate` | host / client | **访问门禁**：登录门闸（首次 `/setup` 设口令、会话 Cookie + 限速、`access-gate` 口令命名空间）+「设置 → 插件 → 插件配置 → 访问门禁」卡片（改口令 + HTTPS 证书方式：自动自签 / 上传自有证书） |
| `dsh-defaults` + `dsh-client-ui-defaults` | settings / client | 默认工作目录 / 默认重试次数的设置命名空间 +「默认值」卡片 |
| `dsh-client-ui-mobile-adapt` | client | **手机端适配**：窄屏聊天区占满全宽、右侧面板变抽屉、输入框 16px 防 iOS 缩放、桌宠缩小让位 |
| `dsh-client-ui-pet` | client | **网页桌宠**：随任务/工具/上下文/活跃会话切换表情，WebAudio 音效（基础+附加分组）、edge-tts 离线语音、账房 token 统计、纸屑庆祝 |
| `dsh-client-ui-task-board` | client | **任务看板**：五列 + cron 定时跑 + 真实会话执行 |
| `dsh-client-ui-live-stats` | client | **实时令牌统计**：TPS / LLM 耗时 / 上下文 / 缓存命中 / 输入输出 token |
| `dsh-client-ui-describe-image` | client | **图像理解**：`describe_image` 工具 +「Image understanding」配置卡（端点/模型/密钥/重试次数） |
| `dsh-host-git-graph` + `dsh-client-ui-git-graph` | host / client | **Git 图谱**：分支选择器 + 提交历史 + 分支泳道 |
| `dsh-host-aionui-panel` + `dsh-client-ui-aionui-panel` | host / client | **右侧面板**：Explorer 文件树 + Preview 多 tab 预览 + SCM 变更（stage/unstage/discard） |
| `dsh-client-ui-skin-maid-atelier` | client | 唯一皮肤资产：Abyssal Maid Atelier（CC BY-NC-SA 4.0） |
| `dsh-client-ui-skin-center` | client | **皮肤中心**：列表/试穿/一键应用（host `/api/skin-center/*` 热切换） |

> 8 个同名 fork（webserver / apiproxy / connection / ui-settings / directory-picker-browse /
> llm / llm-deepseek / llm-pi-ai）已重 base 到 rc.7 对应包源码；其中 apiproxy 的
> `exposedNamespaces` 与 llm 系列的思考档位已被 rc.7 官方化 → 弃用 fork，其余重试兜底 /
> 门闸钩子 / settings scope 恒 host 等改动保留在对应包。
>
> task-suite 的 `web-ui-settings`（rc.6 HTTP bridge + 组卡）、`dsh-skins`（聚合载体）、
> `dsh-task-suite-all`（聚合包）已退役——前者被官方 rc.7 settings surface 取代，后两者
> 因只保留单皮肤而无需聚合，各行已在 web-app 直接注册。

### 1.2 补丁项目（安装包级，升级需重打，正逐步被插件化替代）

| 项目 | 内容 | 现状 |
|---|---|---|
| ~~修改默认工作目录~~ | Web GUI 目录选择器默认打开 `/home/user/Projects` | 已被 **dsh-defaults 统一插件**替代，原文件夹已删除 |
| ~~思考强度与重试默认值~~ | 思考强度档位 + 默认重试 2→5 | 已被 **dsh-defaults 统一插件**替代 |
| ~~全网监听与登录鉴权~~ | HTTPS 监听 0.0.0.0 + 口令门闸 | 已插件化并收敛为「访问门禁」+ 默认 HTTPS（`dsh-host-access-gate` / `dsh-client-ui-access-gate`；TLS 由 `dsh-web-app` 原生提供：纯 JS 自签或上传自有证书，caddy 二进制已移除） |

### 1.3 环境

- 正式实例：端口 3080（`$HOME/.dsh`）；验证用独立实例（非 3080 端口，如 3090）。

## 2. 公开插件的使用方法

> 本仓库插件已整合进 harness 源码，**无需** `dsh plugin add` 单独安装——`pnpm run build`
> 后 `dsh web` 一装全有。对外分发（打包成 npm 包）的流程见
> [docs/整合迁移路线图.md §8](docs/整合迁移路线图.md)。

各插件验证要点（构建后在浏览器或接口上核对）：

| 插件 | 验证方法 |
|---|---|
| 访问门禁 | 首次 `/setup` 设口令；设置 → 插件 → 插件配置 →「访问门禁」卡片改口令 + 证书方式（自签 / 上传自有证书）；未登录 302/401/403；默认 HTTPS 0.0.0.0:3080 开箱可用 |
| 默认值 | 设置 → 插件 → 插件配置 →「默认值」卡片可读写；改默认工作目录后选择器即时定位 |
| 手机端适配 | 手机视口（≤768px）打开 GUI：聊天区占满全宽、右侧面板变抽屉、设置面板无竖排 |
| 桌宠 | 页面右下角出现桌宠；音效/语音/账房/诊断面板正常 |
| 任务看板 / 实时统计 / Git 图谱 / 右侧面板 / 图像理解 / 皮肤中心 | 见各包 README 与本地打包实测 |

## 3. 插件的更新情况

| 插件 | 适配 DSH 版本 | 状态 |
|---|---|---|
| 8 个同名 fork | `dsh-v0.1.0-rc.7` | 已重 base 到 rc.7 对应包源码（apiproxy exposedNamespaces + llm 思考档位官方化 → 弃用） |
| 访问门禁 / 默认值 / 手机端 / 桌宠 | `dsh-v0.1.0-rc.7` | 已迁移进 `packages/*`，构建 + lint 全绿 |
| task-suite 8 包 | `dsh-v0.1.0-rc.7` | 已迁移（scope 改名 + rc.7 API 重 base + host/client 拆分），web-ui-settings / dsh-skins / dsh-task-suite-all 退役 |

## 4. 插件维护（DSH 破坏性更新应对）

**维护原则**：改插件 = 改 `packages/<group>/<pkg>/src` → `pnpm run build` → 本地打包验证；
任何打包测试只在独立实例（非 3080 端口）进行，通过后才允许正式安装（用户手动执行）。
正式环境（3080 / `$HOME/.dsh` / 全局安装）绝不触碰。详见 [AGENTS.md](AGENTS.md) 红线。
