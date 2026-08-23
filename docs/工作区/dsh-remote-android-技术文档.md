# DSH 遥控器（安卓端）技术文档

> 文档状态：技术定稿，待实现
> 配套文档：`dsh-remote-android-设计文档.md`
> 服务端契约权威：dsh 仓库 `docs/工作区/手机遥控插件.md`（端点/白名单/事件流/鉴权逐条定义）、
> `docs/工作区/任务看板host化.md`（定时任务数据源）
> 面向读者：负责实现的开发/AI。本文档给出技术选型、通信协议、工程结构、实现要点。
> 说明：dsh 为上游开源框架，接口签名以其仓库源码为准（本项目工作区 `D:\ProjectHub\Side_Hustles\DSH\dsh-solo-leveling`）。
>
> 修订记录：
> - 2026-08-23 v2：App 改为对接**手机遥控插件**（`/api/mobile/*` 契约），不再直连 dsh 原生 `/api`；
>   §3 协议章节按源码核对全部重写（原 `client/initialize`/`session.tree.subscribe`/Bearer Token/
>   `lastEventSeq` 增量补拉等假设不成立）；鉴权改口令换 Cookie；定时任务改对接 host 化任务看板；
>   新增远程审批/提问应答。

---

## 1. 技术栈

| 项 | 选型 | 说明 |
|---|---|---|
| 框架 | **Flutter**（3.x，Dart 3） | 单代码库，先出 Android |
| UI | Material 3 + 自绘组件 | 支持深浅色，玻璃拟态点缀 |
| 状态管理 | **Riverpod**（或 Provider） | 推荐 Riverpod，事件流状态多 |
| 网络层 | **dio** + `dio_cookie_manager` + WebSocket | REST 调用（自动管 Cookie）+ 事件流长连 |
| 事件流 | **WebSocket**（首选）/ SSE 备选 | 服务端推送 |
| 本地存储 | **Hive**（轻量 KV）+ **flutter_secure_storage** | Token 用安全存储 |
| Markdown 渲染 | **flutter_markdown** | 产物预览 |
| 代码高亮 | **flutter_highlight** / highlighted_code | 产物预览 |
| Web 预览 | **webview_flutter** | 产物预览 |
| 通知 | **flutter_local_notifications** | 本地通知 |
| 后台长连 | workmanager 或前台服务 | 保活（P4） |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  Android App（Flutter）                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ features/*（业务模块，见 §7 目录结构）                    │  │
│  └──────────────┬────────────────────────────────────────┘  │
│                 ▼                                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ core/（通信核心）                                       │  │
│  │  · DshMobileClient   —— REST 封装（dio + CookieJar）     │  │
│  │  · DshEventChannel   —— 下行 WS 长连 + 重连 + 缝合        │  │
│  │  · AuthController    —— 口令登录 / Cookie 刷新 / TOFU     │  │
│  │  · ReconnectPolicy   —— 指数退避 + 断线补偿               │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS（内网穿透，TLS 必开）
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PC：dsh Host（:3080）                                       │
│  · 门禁 access-gate：POST /login 换 Cookie（全程前置）        │
│  · 手机遥控插件（BFF）：                                      │
│      GET  /api/mobile/info        版本握手                   │
│      POST /api/mobile/rpc         白名单方法转发              │
│      POST /api/mobile/respond     审批/提问应答               │
│      POST /api/mobile/fs/read     产物读取                    │
│      GET  /api/mobile/fs/raw      产物原始流（Range）         │
│      WS   /api/mobile/events      单条下行事件流              │
│  · 进程内：apiProxy（session/llm/host）+ taskBoard + …       │
└─────────────────────────────────────────────────────────────┘
```

**关键约束**：
- App 所有请求走 `baseUrl`（穿透域名），协议 **仅允许 HTTPS**，明文 HTTP 直接报错拒绝。
- App 只对话 `/api/mobile/*` 契约（protocolVersion 管理），不直连 dsh 原生 `/api`
  （原生通道有 loopback/trusted-host 信任围栏，穿透域名会被拒）。
- App 不保存任何 Agent 状态；事件断线后重开流 + 拉尾页 + seq 缝合（§4.3）。

---

## 3. 通信协议（核心）

> 契约权威 = dsh 仓库 `docs/工作区/手机遥控插件.md`；本节是 App 视角的摘录与用法，
> 两者冲突时以插件文档为准。`protocolVersion = 1`。

### 3.1 协议总览

- App 与 dsh 之间的一切流量走**手机遥控插件**的 `/api/mobile/*`（门禁 Cookie 前置）：
  - 上行 = HTTP POST（JSON）；下行事件 = 单条 WebSocket（`/api/mobile/events`，只收不发）。
- 统一响应信封（对齐 dsh 的 `RpcResult` 形状）：
  - 成功：`{ "ok": true, "value": ... }`
  - 失败：`{ "ok": false, "error": { "code": "...", "message": "..." } }`
  - 错误码闭集：`method-not-allowed` / `bad-request` / `unauthorized` / `not-found` /
    `payload-too-large` / `internal`。
- 门禁未登录时一切 `/api/mobile/*` 返回 HTTP 401（JSON 错误体）。

### 3.2 端点清单

| 端点 | 方法 | 请求 | 响应 |
|---|---|---|---|
| `/api/mobile/info` | GET | — | `{protocolVersion, pluginVersion, hostVersion, serverTime}`；App 连接后先校验 protocolVersion |
| `/api/mobile/rpc` | POST | `{method, payload}` | 白名单方法转发结果（§3.3） |
| `/api/mobile/respond` | POST | `{rpcId, kind:'approval'\|'question', result}` | 审批/提问应答（§3.6） |
| `/api/mobile/fs/read` | POST | `{workspaceId, path, asImage?}` | 文本（≤80k 字符）或图片 dataURL（≤8MiB） |
| `/api/mobile/fs/raw` | GET | `?ws=&path=`，支持 `Range` | 原始字节流 |
| `/api/mobile/events` | WS 升级 | —（上行即违规，服务端 1008 关闭） | 事件流（§3.5） |

### 3.3 RPC 方法白名单（`POST /api/mobile/rpc`）

`method` 超出白名单 → `method-not-allowed`。payload/value 结构以 dsh 源码
`packages/host/apiproxy/src/api/*.ts` 的 zod schema 为准（实现时逐个对照建 Dart 模型）。

| method | 用途（App 端） |
|---|---|
| `host.describe` | 连接就绪握手：版本、cwd、attachedSessions、能力 |
| `session.list` | 会话列表（含 running 状态与 projections 摘要） |
| `session.create` | 新建会话（`{workspaceId?/cwd?/sessionId?/agentPreset?}`，幂等可作恢复） |
| `session.history` | 会话尾页快照（`{sessionId, beforeSeq?, maxMessages?}`，含 projections 基线） |
| `session.prompt` | 下发任务（`{sessionId, mode:'queue'\|'steer', content, clientTimeZone?}`） |
| `session.cancel` | 取消当前 turn（保留收件箱） |
| `session.fork` | 分叉（`{sessionId, atSeq?}`） |
| `session.rename` | 会话重命名（摘要来源之一） |
| `session.models` / `session.selectModel` | 会话级模型查看/切换 |
| `session.attachment` | 读会话引用过的持久化图片 |
| `llm.providers` / `llm.models` | 模型目录（模型选择页） |
| `workspace.list` | 工作区列表（任务钉住目标、产物根） |
| `task-board.list` / `create` / `update` / `delete` / `run` | 定时任务镜像 CRUD + 手动执行（§3.7） |

### 3.4 任务下发时序

```
App ──────────────────────────────── PC dsh
 │ 1) GET  /api/mobile/info          │
 │ ◄─ {protocolVersion:1, ...}       │  版本校验
 │ 2) POST /login {password}         │
 │ ◄─ 302 + Set-Cookie               │  口令换 Cookie（§4）
 │ 3) POST /api/mobile/rpc           │
 │    {method:'host.describe'}       │
 │ ◄─ {ok:true, value:{...}}         │  就绪握手
 │ 4) POST /api/mobile/rpc           │
 │    {method:'session.create',      │
 │     payload:{workspaceId}}        │
 │ ◄─ {ok:true, value:{sessionId}}   │
 │ 5) POST /api/mobile/rpc           │
 │    {method:'session.prompt',      │
 │     payload:{sessionId, mode,     │
 │      content:[{type:'text',text}]}}│
 │ ◄─ {ok:true, value:{accepted}}    │  任务入队
 │ 6) WS /api/mobile/events (Cookie) │
 │ ◄─ mobile/hello → session/subscribed → session/event 流
 │ ◄─ turn/end{reason} / host/session-status{running:false}   │  完成
```

### 3.5 事件流协议（`/api/mobile/events`）

- 单条下行 WebSocket；帧 = `{"stream":"mux"|"host"|"taskboard"|"meta","frame":{...}}`；
  连接建立先收 `{stream:"meta", frame:{type:'mobile/hello', protocolVersion, serverTime}}`；
  服务端 15s ping。
- **App 关心的帧**（原样透传自 dsh 官方事件流，字段结构以
  `packages/host/apiproxy/src/api/events.ts` 与 `packages/core/session/src/types.ts` 为准）：

| 帧 | App 用法 |
|---|---|
| `mux: session/subscribed{sessionId, lastSeq}` | 会话基线（seq 对齐依据） |
| `mux: session/event{sessionId, event}` | 事件本体（下表映射渲染） |
| `mux: approval/requested{approvalId, toolName, ...}` | 审批卡（§3.6） |
| `mux: approval/resolved` / `question/resolved` | 卡片终态 |
| `mux: question/requested{questions[]}` | 提问卡（§3.6） |
| `mux: session/queue` / `session/jobs` | 排队/后台任务快照（last-wins） |
| `mux: session/projection{key, value, seq}` | 成品值投影（标题等），higher-seq-wins |
| `host: host/session-status{sessionId, running}` | 会话运行状态 |
| `host: host/session-added` / `session-removed` | 列表增删 |
| `host: host/agent-error` | 失败通知 |
| `taskboard: task-board/changed{tasks}` | 定时任务台账全量快照（last-wins） |

- **`session/event` 内的事件类型 → 渲染映射**：
  - `assistant/chunk` → 流式文本上屏（token 级增量）；
  - `assistant/message` → 定稿整条消息（含 usage）；
  - `tool/call` / `tool/result` → 工具调用卡（`result` 帧带 `view` 渲染意图，如 diff）；
  - `user/message` → 用户气泡（含 `user-rpc` 对账信息）；
  - `turn/start|end` → 进度条起止（`end.reason`：completed/aborted/blocked/error/max-tokens/interrupted）；
  - `todo/write` → 待办清单快照（可选渲染）。
- **seq 语义**：每事件带会话内单调递增 `seq`。`seq <= lastSeq` 丢弃（重放重叠）、
  `seq == lastSeq+1` 追加、`seq > lastSeq+1` 缓存并触发一次尾页重拉补洞。
- **没有** `session.status = idle` 这种事件——状态 = `host/session-status{running}` +
  `turn/end` 组合判定。

### 3.6 远程审批与提问

- `approval/requested` 帧 → 审批卡（工具名 + 原因），操作：
  `POST /api/mobile/respond {rpcId, kind:'approval', result:'allowed-once'|'rejected'}`
  （完整 `ApprovalOutcome`：`allowed-once | rejected | cancelled | unavailable`）。
- `question/requested` 帧（`questions[]` 选项）→ 提问卡，作答 result 结构
  实现时对照 dsh `AskUserQuestion` 应答 schema（插件文档留了同一待钉项）。
- 帧内 `rpcId` 稳定：断线重连后 host 重放 pending 帧，App 按 rpcId 去重恢复待办。

### 3.7 定时任务（host 化任务看板）

- 数据与调度都在 dsh 侧（`docs/工作区/任务看板host化.md`）；App 经
  `task-board.*` 白名单方法做镜像 CRUD 与手动执行，经 `taskboard` 流标签接收变更。
- 任务模型（`TaskRecord` 子集）：`{id, title, description, prompt, cron?, workspaceId?,
  mode?, permission?, executions[], schedule:{cron, nextRunAt, lastTriggeredAt}?}`。
- 语义：调度在 host 进程执行（错过即跳过，重启后 overdue 触发一次再前滚）；
  App 删除缓存不影响 PC 台账。

---

## 4. 连接与鉴权

### 4.1 连接配置

```dart
class ConnectionConfig {
  final String baseUrl;       // https://dsh.example.com
  final String password;      // 门禁口令，写 flutter_secure_storage
  final String workspace;     // 默认工作区，如 D:\Projects\repo
  final String provider;      // 默认 'deepseek-official'
  final String model;         // 默认 'deepseek-v4-flash'
  // 运行态（secure storage 或内存）：会话 Cookie 串、TOFU 证书指纹
}
```

- 首次进入 App 若无配置 → 引导到连接配置页，填写后执行
  `info → login → host.describe` 三步，全部成功即保存。
- 之后每次启动：若已配置，直接尝试连接，失败进入离线态（红条提示 + 自动重连）。

### 4.2 登录与 Cookie（源码核对过的契约）

- `POST {baseUrl}/login`，`content-type: application/json`，体 `{"password":"<口令>"}`。
- **响应是 302 重定向，不是 JSON**：
  - 成功：`302` + `Location: /` + `Set-Cookie: dsh_session_<port>=v1.<exp>.<nonce>.<hmac>; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
  - 口令错：`302` + `Location: /login?error=wrong`；锁定：`?error=locked`（10 次失败 / 10 分钟，按 IP）
- 判定规则：`302 且响应头含 set-cookie` = 成功；解析 `Location` 上的 `error` 参数给中文文案。
- Cookie 名含端口（默认 `dsh_session_3080`），App 不解析名值，直接把 `Set-Cookie` 串
  交给 `CookieJar` 管理（`dio_cookie_manager`）。
- 之后所有 HTTP 请求自动带 Cookie；**WS 升级请求手动带**
  （`IOWebSocketChannel` 的 headers 参数）。
- 任何 `/api/mobile/*` 回 401（或 Cookie 过期，7 天 TTL）→ 用存储口令静默重登一次再重放；
  重登仍失败（`error=wrong`）→ 提示口令失效，跳连接配置页。

### 4.3 安全要求

1. 强制 HTTPS：`baseUrl` 以 `http://` 开头直接校验失败（除非未来显式开启调试模式）。
2. 口令与 Cookie 存 `flutter_secure_storage`（Android Keystore 加密），不进 Hive。
3. 证书 TOFU：dio `badCertificateCallback` 拦截自签证书 → 首次连接记录证书指纹
   （DER 的 SHA-256）存安全存储；之后每次比对，不一致即阻断并告警。
4. 不输出口令/Cookie 到日志 / 崩溃上报。

### 4.4 重连与补偿策略

- WebSocket 断开 → 指数退避重连：1s → 2s → 4s → … → 上限 30s；前台活跃时缩短间隔。
- 网络类型切换（WiFi↔4G/5G）触发主动重连。
- 重连成功后的补偿（**mux 增量补拉官方未实现，不依赖**）：
  1. 重开 `/api/mobile/events` → 收各会话 `session/subscribed{lastSeq}` 基线；
  2. 对每个活跃会话 `session.history` 拉尾页；
  3. 按 `seq` 去重/找洞缝合（§3.5），pending 审批/提问帧由 host 按 rpcId 重放；
  4. 对补偿出的「完成/失败/待审批」补发本地通知（去重）。

---

## 5. 功能实现要点

### 5.1 任务下发

- 输入框文本 → `content = [{type: 'text', text: ...}]`，走 `session.prompt`
  （`mode` 默认 `'queue'`，追问想插队用 `'steer'`）。
- 附件（照片）：`{type: 'image', mediaType, data: <base64>, name?}` 内联进 content
  （`PromptContentPart` 已核实支持，无独立上传端点；压缩到合理尺寸再发）。
- 发送成功返回 `{accepted: true}`，进入会话流视图；随后依赖事件流渲染进度。

### 5.2 会话流渲染

- 会话流数据源 = 事件流（增量）+ 首次进入时的尾页快照（`session.history`）。
- 渲染顺序按事件序号；消息气泡左右布局（用户右、AI 左）。
- 工具调用卡：工具名 + 参数摘要（json 截断）+ 结果摘要；点击可展开完整参数/结果（可折叠）。
- 任务进行中：会话流顶部显示进度指示（步骤文案来自事件流），“运行中”徽标。

### 5.3 产物预览

- 产物类型识别（来自事件 block 的 type/mime）：
  - `markdown` / 文本 → `flutter_markdown` 渲染。
  - `code` → 代码高亮 + 行号 + 复制按钮。
  - `web` / html / url → `webview_flutter` 全屏预览（独立路由，支持返回/刷新/外部浏览器打开）。
- 产物卡片展示在消息流内，点击进全屏预览页。

### 5.4 会话历史

- 列表数据：`session` 插件提供的会话查询（快照拉取，不依赖本地累积）。
- 状态徽标映射：`running`→强调色、`idle`→绿、`error`→红、`paused`→灰。
- 详情页复用任务页布局；操作：续聊（resume）、分叉（fork，确认会话上下文）、删除（二次确认）。

### 5.5 定时任务 UI

- 页面：列表 / 新建 / 详情。
- 新建表单：任务标题 + 任务指令文本 + 5 段 cron 表达式（带校验 + 常用预设如"每天9点"）
  + 可选钉住目标（工作区 `workspaceId` / agent 预设 `mode` / 权限 `permission`）。
- 操作：启用/停用（增删 `schedule` 字段）、编辑、删除（确认）、手动「立即执行」（`task-board.run`）。
- 数据：`task-board.list` 全量镜像（Hive 缓存）+ `taskboard` 流标签增量刷新（全量快照，last-wins）；
  调度在 PC host 进程执行，App 不参与触发。

### 5.6 推送通知（P4）

- 架构：**复用事件流长连接**（App 存活即收事件），帧满足触发条件 → 本地通知。
- 触发条件（可配置，帧映射见 §3.5）：
  - `turn/end{reason:'completed'}` + `host/session-status{running:false}`：任务完成。
  - `turn/end{reason:'error'}` / `host/agent-error`：任务失败。
  - `approval/requested` / `question/requested`：需要用户操作（高优先级）。
  - `taskboard` 变更 + 对应会话事件：定时任务触发执行。
- 通知标题：会话摘要；正文：状态 + 时间；点击 → 深链到会话详情（`/session/<id>`）；
  审批/提问通知点击直达应答卡。
- 后台保活：
  1. 首次开启推送时引导加入电池白名单。
  2. Android 13+ 可用前台服务（`FOREGROUND_SERVICE` + `floating`/`dataSync` 类型）维持长连，通知常驻可手动收起。
  3. 长连接断开的兜底：App 回到前台时按 §4.4 补偿流程补发通知（去重）。
- 不引入 FCM / 厂商通道（ADR-5）。

---

## 6. 本地存储设计

| 存储 | 内容 | 说明 |
|---|---|---|
| Hive box `conn` | ConnectionConfig（除口令） | 单条 |
| flutter_secure_storage | 口令 / Cookie 串 / 证书指纹 | 加密 |
| Hive box `sessions` | SessionCache 列表 | 仅缓存最近 N 条事件（上限 200），LRU 淘汰 |
| Hive box `tasks` | TaskMirror 列表 | 看板镜像 |
| Hive box `settings` | AppSettings | 推送开关等 |

> 所有缓存可在"我的→数据管理"一键清空；清空不触发 PC 侧任何删除操作。

---

## 7. 项目结构

```
dsh-remote-android/
├── lib/
│   ├── main.dart                  # 入口：初始化存储、连接恢复、路由
│   ├── core/
│   │   ├── rpc/dsh_mobile_client.dart     # REST 封装（dio + CookieJar）
│   │   ├── rpc/dsh_event_channel.dart     # 事件流长连 + 重连 + 缝合
│   │   ├── rpc/dsh_types.dart             # 协议类型（对照 apiproxy zod schema）
│   │   ├── auth/auth_controller.dart      # 口令登录 / Cookie 刷新 / TOFU 证书
│   │   └── error/app_exception.dart       # 中文错误映射
│   ├── data/
│   │   ├── local/hive_stores.dart
│   │   ├── local/secure_store.dart
│   │   └── repository/
│   │       ├── connection_repo.dart
│   │       ├── session_repo.dart
│   │       ├── task_board_repo.dart
│   │       └── artifact_repo.dart
│   ├── features/
│   │   ├── connection/            # 连接配置页 + 登录 + 状态
│   │   ├── task/                  # 任务页（输入 + 会话流 + 审批/提问卡）
│   │   ├── sessions/              # 历史列表 + 详情 + resume/fork
│   │   ├── artifact/              # 产物预览（md/code/web）
│   │   ├── schedule/              # 定时任务 UI（看板镜像）
│   │   ├── push/                  # 通知封装 + 保活引导
│   │   └── settings/              # 设置页
│   ├── shared/
│   │   ├── widgets/               # 气泡、工具卡、产物卡、状态条、徽标…
│   │   ├── theme/                 # 主题（浅/深、玻璃拟态组件）
│   │   └── utils/                 # 时间格式化、cron 校验、事件解析
│   └── l10n/                      # 中文字符串
├── android/                       # Flutter 工程默认
├── docs/design/                   # 设计文档 + 本文档
└── pubspec.yaml
```

---

## 8. 关键依赖清单（pubspec 建议）

```yaml
dependencies:
  flutter_riverpod: ^2.x        # 状态管理
  dio: ^5.x                     # REST
  dio_cookie_manager: ^3.x      # 会话 Cookie 管理
  cookie_jar: ^4.x
  web_socket_channel: ^3.x      # WebSocket 事件流（IOWebSocketChannel 支持带 Cookie 的 headers）
  hive: ^2.x                    # 本地缓存
  hive_flutter: ^2.x
  flutter_secure_storage: ^9.x  # 口令/Cookie/证书指纹
  flutter_markdown: ^0.7.x      # md 预览（实现时复核上游维护状态，必要时换社区替代）
  highlighted_code: ^0.5.x      # 代码高亮（或 flutter_highlight）
  webview_flutter: ^4.x         # Web 产物预览
  flutter_local_notifications: ^17.x  # 本地通知
  workmanager: ^0.5.x           # 后台兜底（P4，按需）
  intl: ^0.19.x                 # 本地化/格式化
dev_dependencies:
  flutter_lints: ^4.x
  # 测试：flutter_test + mocktail
```

---

## 9. 错误处理与容错

- 统一异常类型 `AppException`：`连接失败` / `鉴权失败(401)` / `口令错误` / `版本不兼容` /
  `工作区不可用` / `任务执行失败` / `协议错误`，一律映射为中文可读文案。
- 401 处理：先用存储口令静默重登一次并重放原请求；重登失败（302 `error=wrong`）才提示
  口令失效跳连接配置页。
- `method-not-allowed`：提示 dsh 侧能力缺失（如未装 task-board），按能力降级隐藏入口。
- 网络异常：进入离线态红条；请求队列保留（仅幂等请求可重放，如 rpc 查询、事件流重开）。
- 事件流协议解析失败：记录并跳过该帧，不中断长连（会话状态兜底 =
  `host/session-status{running}` + `turn/end` 组合）。
- 所有异步 UI 均带 loading/空/错误三态。

---

## 10. 分期实现指南

### P1：连通（先做，验证链路；前置 = 手机遥控插件已实现）

1. 搭 Flutter 工程 + 目录骨架 + 主题。
2. 实现 `ConnectionConfig` 页 + secure storage 存取。
3. 实现 `DshMobileClient`：`info` 版本校验 → `/login` 换 Cookie → `rpc host.describe`。
4. 简单 UI：输入框 → `session.create` + `session.prompt` → 展示第一条 AI 回复。
5. 验收：内网穿透下手机能收到 dsh 的回复。

### P2：会话流

6. 实现 `DshEventChannel`（`/api/mobile/events` WS + 重连 + seq 缝合 + 尾页重拉）。
7. 会话流组件：气泡、流式文本、工具卡、审批/提问卡、状态条。
8. 会话列表 / 详情 / resume（幂等 create）/ fork。

### P3：产物 + 定时（前置 = 看板 host 化完成）

9. 产物解析与三种预览（`fs/read` + `fs/raw`）。
10. `task-board.*` 对接 + 定时任务三页。

### P4：推送

11. 通知触发逻辑 + flutter_local_notifications。
12. 电池白名单引导 + 前台服务保活。
13. 断线补偿补发（去重）。

---

## 11. 实现时必读的 dsh 源码文件（已核对路径）

| 文件（仓库相对路径） | 用途 |
|---|---|
| `docs/工作区/手机遥控插件.md` | 服务端契约权威（端点/白名单/事件流/鉴权） |
| `docs/工作区/任务看板host化.md` | 定时任务数据源与 TaskRecord 结构 |
| `packages/host/apiproxy/src/api/sessions.ts` | session 方法 payload/value 的 zod schema（Dart 模型依据） |
| `packages/host/apiproxy/src/api/events.ts` | MuxFrame / HostFrame 帧结构 |
| `packages/core/session/src/types.ts` | SessionEvent 事件类型全集（seq/turn/tool） |
| `packages/host/access-gate/src/index.ts` | /login 契约、Cookie 格式、限速 |
| `packages/client/connection/src/api-path.ts` | 官方路径常量（对照，App 不直接使用） |

> 若发现上述路径与最新仓库不符，以仓库实际结构为准并回写本文档（保持"文档=真相源"）。
