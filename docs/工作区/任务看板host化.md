# 任务看板 host 化设计（dsh-host-task-board）

> 状态：已实现（2026-08-23）。
> 配套文档：[手机遥控插件.md](手机遥控插件.md)（App 侧消费方）、
> App 侧设计 `DSH Reins/docs/design/dsh-remote-android-设计文档.md` 与技术文档（同级 `DSH Reins` 工作区）。
> 本文件是任务看板 host 化的**唯一技术事实源**；实现与其冲突时以本文件为准并先改本文件。

## 1. 背景与动机

任务看板现为纯 client 插件（`packages/client/ui-task-board`）：

- 任务台账存浏览器 `localStorage`（键 `dsh.taskBoard.v1`，`src/core/store.ts`）；
- cron 调度是浏览器标签页内的 `setInterval`（`src/core/scheduler.ts`，60s tick），
  **GUI 标签页不打开就不跑**——插件自己的 `TASK_BOARD_GUIDANCE`（`src/index.ts`）也明示此限制。

两个外部需求同时指向同一结论：

1. 网页看板自身需要「PC 侧可靠定时」——定时任务不应依赖浏览器是否开着；
2. 手机遥控器（DSH 遥控器 App）的定时模块需要 host 侧调度 + 手机镜像，
   否则 App 只能镜像一个「网页不开就停摆」的调度器。

决策（对应 App 侧 ADR-8）：**把任务看板拆成 host + client 双包，调度与台账收进 host 进程**，
网页看板与手机 App 共用同一份台账。放弃的备选：在手机插件里另建一套独立 cron
（两套调度器并存，任务来源分裂，用户要在两处管理定时任务）。

## 2. 目标 / 非目标

**目标**

1. 定时触发不再依赖浏览器标签页；host 进程存活即调度存活。
2. 台账唯一事实源落到 host 侧文件；网页看板与 App 是同源视图。
3. 现有看板 UI（五列、钉住工作区/模式/权限、执行历史、设置卡）行为不变。
4. 存量 localStorage 任务一次性迁移，用户无感。

**非目标**

- 不改 cron 语义：仍为 5 段 cron（`core/schedule.ts` 的 `isValidCron`/`nextRunAtMs`），
  不引入自然语言表达式、时区配置（沿用 host 本地时区）。
- 不做错过补发队列：**错过即跳过**语义保持（host 重启后逾期的任务触发一次后前滚，
  与浏览器版「重新打开标签页后 overdue 任务触发一次」行为一致）。
- 不做多人协同 / 权限分级（单用户产品）。

## 3. 现状盘点（改造依据）

| 事实 | 位置 | 对改造的意义 |
|---|---|---|
| `TaskStore` 是存储接缝（load/save/clear/subscribeExternal），localStorage 只是当前后端 | `src/core/store.ts` | 换 host API 后端，接缝不变 |
| `SchedulerService` 无框架依赖，全部依赖走注入面（tasks/now/runTask/applySchedule/tickMs） | `src/core/scheduler.ts` | 类原样搬进 host，喂 host 侧依赖 |
| `TaskRecord`：`{id,title,description,prompt,createdAt,updatedAt,workspaceId?,mode?,permission?,executions[],schedule?,status}` | `src/core/tasks.ts` | 台账 schema v1 沿用，迁移 = 纯搬家 |
| 多标签页同步靠 localStorage `storage` 事件 | `src/core/store.ts` | 改为 host SSE 推送 |
| 执行 = 客户端驱动真实会话（session.create/prompt + 钉住字段） | `src/core/controller.ts` | host 半改走 `ctx.apiProxy` 进程内同参调用 |

## 4. 目标架构

```
┌───────────────────────── dsh Host 进程 ─────────────────────────┐
│  task-board host 半（新包 dsh-host-task-board）                 │
│  · TaskBoardService（ctx.taskBoard，台账唯一写者）               │
│  · ledger.json 持久化（$DSH_HOME/task-board/，原子写）           │
│  · SchedulerService（60s tick，5 段 cron，进程内）               │
│  · 执行：apiProxy.sessions.create + prompt（带钉住字段）         │
│  · HTTP：/api/task-board/* CRUD + /api/task-board/events (SSE)  │
│  · cordis 事件：task-board/changed                              │
└───────┬──────────────────────────────┬─────────────────────────┘
        │ SSE（账本变更）               │ 进程内 ctx.taskBoard
        ▼                              ▼
  ui-task-board（改造成纯视图）   手机遥控插件（/api/mobile/* 转发）
```

双包拆分模式照抄整合迁移期先例（git-graph、aionui-panel）：
host 半承载持久化与调度，client 半承载 UI。

## 5. host 半设计（`packages/host/task-board`，包名 `@deepseek-ai/dsh-host-task-board`）

### 5.1 服务与注入

- `TaskBoardService extends Service`，服务名 `taskBoard`，`declare module` 挂到 `ctx.taskBoard`。
- `static inject = ['webServer', 'apiProxy', 'workspaceRegistry']`
  （执行会话走 `apiProxy`，钉住的 `workspaceId` 校验走 `workspaceRegistry`）。

### 5.2 台账持久化

- 路径：`$DSH_HOME/task-board/ledger.json`；整本替换写，`write tmp + rename` 原子落盘。
- schema：`TaskRecord[]`，结构沿用 client 现行 v1（§3 表）；解析时套用
  `store.ts` 现有的行校验/修复逻辑（坏行丢弃、坏 schedule 剥离），坏文件从空台账起步并告警。
- 写入时机：每次变更（CRUD、执行记录、调度前滚）写穿，不攒批。

### 5.3 调度器

- 直接复用 `SchedulerService`（从 `ui-task-board/src/core/scheduler.ts` 迁入 host 包，
  client 包不再持有定时器）。依赖装配：
  - `tasks()` 读内存台账（Service 启动时 load）；
  - `runTask(id)` 调执行（§5.4），返回是否受理；
  - `applySchedule(id, nextRunAt, lastTriggeredAt)` 更新任务并写穿台账。
- tick 60s（常量，不做可调参数）；错过即跳过；任务正在运行时跳过本次触发。
- Service 启动即 start，卸载即 stop（`ctx.effect` 清理）。

### 5.4 执行

- 与浏览器版同参：`apiProxy.sessions.create`（带 `workspaceId`/`agentPreset`=钉住的 mode）
  → `apiProxy.sessions.prompt`(任务的 `prompt`)；权限钉住沿用现行语义——经命令运行时
  admit 一条 `/permission <id>` slash 命令（与浏览器半的 `session.command` 同通道，
  绝不作为 prompt 正文发送），admit 失败则该次执行判失败且不发送任务 prompt。
- 执行会话落定后由 apiProxy 的 host 帧流回填结果：`host/agent-error` 先到判 failed，
  `host/session-status(running:false)` 后到（或先到且无 error）判 succeeded，二者幂等；
  host 重启时遗留的未完结 running 执行在下次加载时统一 settle 为 cancelled（无帧可看的
  会话无法对账，宁可放开互斥也不永久卡卡）。
- 执行记录写入 `TaskRecord.executions`（id/sessionId/startedAt/endedAt/result/error），
  会话状态经 `host/session-status` 等事件回填 endedAt/result。
- 手动触发与定时触发共用 `runTask`，带「正在运行」互斥。

### 5.5 HTTP API（浏览器看板消费）

全部在 access-gate 门禁之后（gate 全局前置，无需自带鉴权），加同源 fence
（`sec-fetch-site`/Origin 校验，仿 `ui-skin-center/src/routes.ts` 的 `requireSameOrigin`），
POST 强制 `application/json`，body 上限 1MiB。

| 路由 | 方法 | 请求 | 响应 |
|---|---|---|---|
| `/api/task-board/tasks` | GET | — | `{ok:true, value: TaskRecord[]}` |
| `/api/task-board/tasks/create` | POST | 任务字段（id/createdAt/updatedAt/executions 可省略；提供时按提供的身份落账，网页 diff 同步因此免于换 id） | `{ok:true, value: TaskRecord}` |
| `/api/task-board/tasks/update` | POST | `{id, patch}` | `{ok:true, value: TaskRecord}` |
| `/api/task-board/tasks/delete` | POST | `{id}` | `{ok:true, value:{deleted:true}}` |
| `/api/task-board/run` | POST | `{id}` | `{ok:true, value:{executionId, sessionId}}` |
| `/api/task-board/migrate` | POST | `{tasks: TaskRecord[]}`（仅当台账为空时接受，否则丢弃返回现状） | `{ok:true, value:{imported:number}}` |
| `/api/task-board/events` | GET | — | SSE：`event: change`，`data: {tasks}` 全量快照；15s 心跳注释行 |

错误统一 `{ok:false, error:{code,message}}`；`code` ∈ `bad-request | not-found | conflict`。

### 5.6 cordis 事件

- 台账每次变更后 `ctx.emit('task-board/changed', { tasks })`（全量快照）。
- 消费方：手机遥控插件（转发进 App 事件流，见其文档 §6）；host 内其它插件。

## 6. client 半改造（`packages/client/ui-task-board`）

1. `TaskStore` 后端替换：新增 host API 后端（load=GET tasks，save=逐项 diff 调
   create/update/delete，clear=逐项 delete）；`TaskStore` 接口与上层不变。
2. **删除浏览器 `SchedulerService` 实例与定时逻辑**——不允许两个调度器并存（双触发风险）。
   手动「立即执行」保留，改调 `/api/task-board/run`。
3. 账本变更订阅：`EventSource('/api/task-board/events')`，收到即重载台账
   （替代原 localStorage `storage` 事件跨标签页同步）。
4. 一次性迁移：加载时若 localStorage `dsh.taskBoard.v1` 存在且 host 台账为空 →
   `POST /api/task-board/migrate` 上传 → 成功后 `removeItem`；host 侧空台账守卫保证幂等
   （两个标签页竞争时后到者被拒/丢弃）。
5. `TASK_BOARD_GUIDANCE`（`src/index.ts`）与 PLUGINS.md 看板条目同步改写
   （去掉「数据存 localStorage / 定时需标签页打开」旧事实）。

## 7. 兼容性与行为变化

| 项 | 变化前 | 变化后 |
|---|---|---|
| 定时执行条件 | 浏览器标签页打开 | host 进程存活 |
| 多标签页同步 | localStorage storage 事件 | host SSE 推送 |
| 断网时看板编辑 | 本地可编辑，恢复后靠 storage 事件对账 | CRUD 直接失败并提示（台账在 host） |
| 数据位置 | 浏览器 localStorage（卸载即孤儿） | `$DSH_HOME/task-board/ledger.json` |
| 错过语义 | 跳过 | 不变（重启后 overdue 触发一次再前滚） |

## 8. 配置

v1 不新增可调参数（tick、上限均为常量），无新设置卡；看板现有公告设置卡保留。
若日后引入可调参数（如错过补发开关），必须进「设置 → 插件 → 插件配置」卡片（红线 5）。

## 9. 装配与文件落点

- 新包：`packages/host/task-board/`（`@deepseek-ai/dsh-host-task-board`，版本 `0.1.1-rc.2-local.1` 对齐）。
- 装配：`packages/bundle/web-app/cordis.patch.yml` host 区 `- insert:` 加
  `{id: task-board, name: '@deepseek-ai/dsh-host-task-board'}`；
  浏览器 roster 的 `ui-task-board` 行已有，不动。
- 文档：PLUGINS.md 看板行、根 README 项目清单随实现提交同步。

## 10. 验收口径

1. `pnpm run build` 全绿；打包 → 全局安装 → `dsh web`。
2. 浏览器看板：五列/钉住/执行/设置卡行为与改造前一致；localStorage 旧任务首启自动迁入。
3. **关闭全部浏览器标签页**，host 存活时 cron 任务按点触发并产生真实会话执行记录。
4. 两个标签页同时开看板，一处改动另一处经 SSE 秒级可见。
5. 手机侧：`task-board.*` 方法经 `/api/mobile/rpc` 可增删改查，`taskboard` 流标签能收到变更帧。
