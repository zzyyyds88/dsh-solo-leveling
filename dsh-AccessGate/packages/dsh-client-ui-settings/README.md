# dsh-client-ui-settings（本地 fork）

`@deepseek-ai/dsh-client-ui-settings` 的本地副本，与官方包同名，装进 profile 后覆盖全局安装
（机制同 `dsh-client-connection` / `dsh-host-webserver` 两个 fork；`dsh-host-apiproxy` 已弃用，
rc.7 移除白名单，所有命名空间自动可见）。

## 为什么需要 fork

官方设计：**设置平面（settings/credentials RPC）仅限回环（localhost/127.x）访问**。
客户端 `dsh-client-ui-settings` 里 `SettingsScopeBinder.bind` 按
`connection.isLoopback ? "host" : "memory"` 决定 scope 模式：

- 回环页面 → `host` 模式 → 从服务器读命名空间 → 设置卡片（访问门禁/终端/Agent循环/网页搜索/默认值）显示；
- 非回环页面（LAN IP / HTTPS 入口，如 `https://192.168.1.100:5701`）→ `memory` 模式 →
  **完全不读服务器** → scope 永远 `unavailable` → 所有绑定设置命名空间的卡片渲染 `null` 隐藏。
  官方 README 原话：*"Remote browsers get no durable settings — the settings RPCs are loopback-only"*。

## fork 的改动（一行）

`lib/client.js` 中 `SettingsScopeBinder.bind`：

```diff
- const controller = new SettingsScopeController(connection.api, spec, connection.isLoopback ? "host" : "memory");
+ const controller = new SettingsScopeController(connection.api, spec, "host");
```

客户端 scope 一律走 `host` 模式。安全性由**服务端强制**（`dsh-client-connection` fork 的
`webAuthAuthed` + 特权方法栅栏，见 `packages/dsh-client-connection/src/index.ts`）：

| 场景 | settings.* 结果 |
|---|---|
| 回环（127.0.0.1:3090） | ✅ 放行 |
| 非回环 + 有效访问门禁会话（HTTPS/LAN 登录后） | ✅ 放行 |
| 非回环 + 无会话（匿名远程） | ⛔ 门闸 401（gate 拦 `/api`） |
| 非回环 + 有会话调 credentials.* / host.* / agentPreset.* | ⛔ 403（保持仅回环） |

匿名远程的 scope 读请求被 401/403 拦下 → scope 保持 `unavailable` → 卡片隐藏，与官方
`memory` 模式的表现一致；因此放宽客户端判定不构成信息泄露。

## 维护

- 本 fork 直接改**构建产物** `lib/client.js`（官方包未随发布附带 TS 源码；改动仅此一行，
  无 tsdown 构建流程）。
- 升级 DSH 后若 `dsh-client-ui-settings` 官方包结构变化，用
  `install-to-test-env.sh`（重跑 fork 安装）即可覆盖；若官方 `bind` 逻辑重构，需重新比对
  `lib/client.js` 中该处代码再套用同一行改动。
- 已 rebase 到 rc.7（2026-08-18）：从 rc.7 官方包 `lib/client.js` 重新打补丁。
- 正式安装同样走 `install-access-gate-plugin.mjs`（FORK_PKGS 含本包）。
