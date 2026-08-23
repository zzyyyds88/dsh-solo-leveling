# DSH 遥控器 · 任务拆分（大任务流程第②步）

> 状态：执行中。依据＝三份定稿设计：[任务看板host化.md](任务看板host化.md)、
> [手机遥控插件.md](手机遥控插件.md)、[dsh-remote-android-设计文档.md](dsh-remote-android-设计文档.md)
> （+技术文档）。全部完成后按流程以 chore: 删除本文件。

## 总序（设计文档 §10 定案）

```
①任务看板 host 化（本仓库） → ②手机遥控插件（本仓库） → ③App P1→P4（DSH Reins 仓库）
```

每个任务单元的完成定义：源码 + 受影响测试 + `pnpm run build` 全绿 + 原子提交；
实例级验收（打包→全局安装→逐项实测）在该阶段全部代码完成后统一走一次慢路径，
含「关全部浏览器标签页 cron 仍触发」「非 loopback 远程场景」（rc.2 教训）。

## 阶段一：任务看板 host 化（本仓库）

| # | 单元 | 内容 | 落点 |
|---|---|---|---|
| 1.1 | host 包骨架 | `packages/host/task-board`（`@deepseek-ai/dsh-host-task-board`，版本 `0.1.1-rc.2-local.1`）：package.json / tsconfig / Service 声明 `taskBoard`、`inject=['webServer','apiProxy','workspaceRegistry']` | 新包 |
| 1.2 | 台账持久化 | `$DSH_HOME/task-board/ledger.json`，tmp+rename 原子写穿；复用 store.ts 行校验/修复逻辑；坏文件空台账起步告警 | host 包 |
| 1.3 | 调度器迁入 | `SchedulerService` 自 `ui-task-board/src/core/scheduler.ts` 迁入 host 包（client 不再持有定时器）；60s tick 常量；错过即跳过；运行中互斥 | host 包 |
| 1.4 | 执行链路 | `apiProxy.sessions.create+prompt` 同参替代浏览器驱动；executions 回填（id/sessionId/start/end/result/error）；手动/定时共用 runTask | host 包 |
| 1.5 | HTTP API | `/api/task-board/tasks{,/create,/update,/delete}`、`/run`、`/migrate`、`/events`(SSE 15s 心跳)；同源 fence 仿 skin-center `requireSameOrigin`；POST JSON、body ≤1MiB；错误 `{ok:false,error:{code,message}}` | host 包 |
| 1.6 | cordis 事件 | 台账变更后 `ctx.emit('task-board/changed',{tasks})` 全量快照 | host 包 |
| 1.7 | client 半改造 | TaskStore 换 host API 后端（接缝不变）；删浏览器调度器；EventSource 订阅 `/events` 收到即重载；localStorage→`/migrate` 一次性迁移（空台账守卫幂等）；手动执行改 `/run` | `ui-task-board` |
| 1.8 | 装配与文档 | cordis.patch.yml host 区 insert；PLUGINS.md / README 看板条目改写（去 localStorage/标签页旧事实）；TASK_BOARD_GUIDANCE 改写 | 装配层 |
| 1.9 | 测试 | scheduler 迁移回归、ledger 校验/原子写、HTTP API fence、迁移幂等；现有 client 测试适配 | 两包 |

## 阶段二：手机遥控插件（本仓库）

| # | 单元 | 内容 | 落点 |
|---|---|---|---|
| 2.1 | host 包骨架 | `packages/host/mobile-remote`（BFF），`inject=['webServer','apiProxy','workspaceRegistry']`，taskBoard 可选依赖（缺失降级裁剪白名单） | 新包 |
| 2.2 | 端点 | GET info / POST rpc / POST respond / POST fs/read / GET fs/raw(Range) ；统一信封 `{ok,value|error:{code,message}}`；请求体 ≤maxRequestBytes(默认20MiB) | host 包 |
| 2.3 | RPC 白名单 v1 | host.describe、session.*×10、llm.*×2、workspace.list、task-board.*×5（进程内调 apiProxy 各 face / ctx.taskBoard） | host 包 |
| 2.4 | 事件流 | WS `/api/mobile/events`（registerUpgrade，noServer）：meta mobile/hello → mux/host 帧原样透传 + taskboard 变更帧；上行即 1008；15s ping；每连接独立消费迭代器 | host 包 |
| 2.5 | fs 服务 | workspaceRegistry 圈根 + 防穿越 + 上限（文本80k字符/图片8MiB dataURL），仿 aionui-panel FsService，不注入 agent fs 域 | host 包 |
| 2.6 | 设置卡 | `packages/client/ui-mobile-remote`：命名空间 `mobile-remote`（enabled 总开关=false 时全路由404+WS拒升级、maxRequestBytes），`settings.plugin.item` 卡片样式对齐网页搜索卡 | 新包 |
| 2.7 | 装配与文档 | cordis.patch.yml host 区 + 浏览器 roster；PLUGINS.md / README | 装配层 |
| 2.8 | 测试 | 白名单裁剪、信封形状、WS hello/1008、fs 防穿越、开关降级 | 两包 |

## 阶段三：App P1→P4（DSH Reins 仓库，独立提交历史）

| # | 单元 | 内容 | 前置 |
|---|---|---|---|
| 3.0 | 环境 | Windows 安装 Flutter SDK 3.x（当前缺失；Android SDK 已有），`flutter create --project-name dsh_remote --platforms android` 落骨架 | 无 |
| 3.1 | P1 连通 | core/rpc `DshMobileClient`（dio+CookieJar）、auth（302 判定换 Cookie、TOFU、secure_storage）、ConnectionConfig 页、发一条 prompt 收首条回复 | 阶段二装配进实例 |
| 3.2 | P2 会话流 | `DshEventChannel`（WS 重连指数退避+seq 缝合+尾页重拉）、会话流组件（气泡/工具卡/审批卡/提问卡/进度）、会话列表详情 resume/fork | 3.1 |
| 3.3 | P3 产物+定时 | flutter_markdown/highlight/webview 三种预览（fs/read+raw）、task-board 镜像三页（cron 校验+预设） | 3.2 + 阶段一 |
| 3.4 | P4 推送 | flutter_local_notifications 触发矩阵、电池白名单引导、前台服务、断线补偿补发去重 | 3.2 |

App 端每单元遵循 DSH Reins AGENTS.md 流程；测试口令 `test123456`。

## 环境与风险备忘

- **Flutter SDK 本机缺失**（Android SDK 已在 `%LOCALAPPDATA%/Local/Android/Sdk`）：3.0 需先行；
  中国网络建议镜像 FLUTTER_STORAGE_BASE_URL/PUB_HOSTED_URL。
- 本仓库侧验收需停/起全局 dsh——按红线先与用户确认再操作。
- Linux 机可作第二验证环境（dev 用户跑权限类测试，见开发备忘）。
