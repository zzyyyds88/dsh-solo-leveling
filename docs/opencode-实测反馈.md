# opencode 实测反馈（2026-08-17）

> 本文件由 opencode 在正式环境完整走了一遍「恢复出厂 → 重装 5 插件 → HTTPS 反代 → 设置页配置」后整理。
> 给后续 AI 开发/维护者：**已修复的改动在 git 工作区（未提交），未修复的是建议项**。

## 一、已修复的问题（工作区有改动，待提交）

### 1. `credentials.*` 及特权方法在 HTTPS 反代下被 403 拦截（严重）

**现象**：通过 HTTPS 反代（`https://<host>:5700`）已登录访问时，保存 API Key 报
`transport failure for /api/credentials.set: HTTP 403`；直连回环（127.0.0.1:3080）正常。

**根因**：`dsh-AccessGate/packages/dsh-client-connection/src/index.ts` 的
`PRIVILEGED_METHODS` 对非回环请求默认 403，只对 `method.startsWith('settings.')` 例外放行
已认证（`webAuthAuthed`）会话。`credentials.*`、`agentPreset.*`、`host.*`、`llm.discoverModels`
都漏了——这是 access-gate 引入真实鉴权（会话 cookie）**之前**的保守设计（那时
`trustedHosts` 只是 DNS 反绑防线，非认证）。

**修复**：放行条件从「`settings.*` 且已登录」改为「**已登录即放行全部特权方法**」：

```ts
if (method !== undefined
  && PRIVILEGED_METHODS.has(method)
  && !isTrustedApiRequest(request, [])
  && !webAuthAuthed(ctx, request)) {
  return new Response('forbidden', { status: 403 })
}
```

理由：门闸会话 cookie 本身就是认证层，已登录调用者就是部署所有者，继续拦截只让
远程管理（API Key / Agent 预设 / 目录选择器 / 模型探测）残缺。匿名调用仍被拒。

**涉及**：`src/index.ts`（`webAuthAuthed` 定义处注释 + 403 判断），已重新构建 `lib/`。

### 2. task-suite 设置命名空间未进 apiproxy 白名单（集成缺口）

**现象**：正式环境设置页里「任务看板 / 实时令牌估算 / 图像理解」卡片显示
「当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用」。

**根因**：`dsh-host-apiproxy` fork 的 `exposedNamespaces()` 白名单没有 task-suite
各包注册的设置命名空间（`task-board` / `live-stats` / `describe-image` /
`skin-background`），`settings.describe` 对它们返回 `settings-not-exposed`。

**修复**：在 `exposedNamespaces()` 追加 4 个命名空间（`dsh-AccessGate` 与
`dsh-Moresettings` 两份 apiproxy 副本同步改，都重新构建了 `lib/`）。

**教训**：测试环境 verify 只查 boot 清单 + bundle 路由，**没有验证设置卡片能否真实
编辑**——这是验证盲区。以后重装 task-suite 必须实测设置页卡片可读写。

### 3. `install-suite-plugin.mjs` 对空 HOME 层 `[]` 不兼容（新机首装必现）

**现象**：HOME 层 `cordis.patch.yml` 为官方空模板 `[]` 时，装 task-suite 直接把皮肤
managed 区段 append 在 `[]` 后面 → 非法 YAML → `dsh web` 启动崩溃
（`YAMLException: end of the stream or a document separator is expected`）。

**修复**：写 managed 区段前，把 `[]`（空模板）也当作无用户层内容处理：
`homeExisting.replace(/^\[\]$/, '').trim()`。

### 4. `install-suite-plugin.mjs` 缺 `--allow-formal`

**现象**：正式安装 task-suite 只能改脚本绕过 `test-env*` 安全断言。

**修复**：加 `--allow-formal` 开关（与 access-gate/pet/defaults 安装器对齐），正式安装
须显式传入。

## 二、未修复的建议项（供后续 AI 处理 → 处置结果见文末「四」）

### 5. 安装脚本 pipefail 假失败

`dsh-Moresettings/install-to-profile.sh`、`dsh-mobile/install-to-profile.sh`：
`set -euo pipefail` 下 web 已停止时 `ss | grep` 无匹配返回非零 → 脚本 EXIT=1 假失败，
误导排障。建议命令替换后加 `|| true` 或改 `set -eu`。

### 6. verify 脚本入口不统一

五套 verify（AccessGate/Moresettings/mobile/pet/task-suite）默认端口、指向正式环境的方式
各不相同（3090/3080、`--base`/`DSH_HOME`/`DSH_PORT`/写死 `TEST_ENV`）。task-suite 的
verify 甚至无法验证正式环境。建议统一为：默认 test-env，支持 `--formal`（或
`DSH_HOME=/root/.dsh DSH_PORT=3080`）验证正式。

### 7. verify-defaults 无法区分「装坏」和「没配」

重装后供应商清空，`llm-pi-ai` 两项必失败（预期，用户还没配供应商），输出却显示
`[FAIL]`，误导。建议供应商为空时打印 `[SKIP] 供应商未配置` 而非 `[FAIL]`。

### 8. 缺正式一键重装入口

「恢复出厂 + 重装 5 插件」需人工拼 5 个脚本 + 不同参数（`--allow-formal` / 交互 /
`--no-restart`）。建议加 `scripts/formal-reinstall.sh`（备份 → 停 → 按依赖序装 →
起 → 逐项 verify 一条命令收口）。

### 9. HTTPS 反代端口被占用的提示不直观

`check-port` 接口正常返回 `inUse`，但用户侧对「保存失败」的提示文案（
「可能已被其它修改覆盖或权限不足」）与实际根因（页面状态过期 revision 冲突）对不上。
建议：settings 卡片 save 失败时能区分并提示 revision 冲突（提示刷新页面重试）。

## 三、部署自动化方向（用户决定：以后只走 opencode 部署）

- 插件安装/升级由 opencode 执行（安装器本身可安全幂等重跑）。
- 人工只保留：启动/重启 `dsh web`、最终确认。
- 建议把 AGENTS.md 红线 6 从「正式安装只能用户手动执行」调整为「opencode 可执行
  安装器，但停/起正式 web 由用户确认」。
- 前提：先把第 8 条「正式一键重装入口」做出来，opencode 编排时才不会出错。

## 四、本轮处置结果（2026-08-17 第二轮，已完成 / 已落地）

### 建议项 5–8：已修复

| 项 | 处置 | 落地 |
|---|---|---|
| 5. pipefail 假失败 | 4 个脚本的命令替换末尾加 `\|\| true`：`dsh-Moresettings/install-to-profile.sh`、`dsh-mobile/install-to-profile.sh`、`dsh-AccessGate/switch-to-https.sh`、`dsh-AccessGate/migrate-to-embedded-caddy.sh` | ✅ |
| 6. verify 入口不统一 | 5 套 verify 统一为「默认 test-env + `--formal` 验正式（`DSH_HOME`/`DSH_PORT` 可覆盖）」：`dsh-AccessGate/verify.sh`、`dsh-Moresettings/verify-defaults.mjs`、`dsh-mobile/verify.sh`、`dsh-deepseekpet/verify.sh`、`dsh-task-suite/verify.sh` | ✅ |
| 7. verify-defaults 分不清「装坏/没配」 | 供应商未配置时输出 `[SKIP]`（不判失败），汇总行加「跳过 N 项」 | ✅ |
| 8. 缺正式一键重装入口 | 新增 `scripts/formal-reinstall.sh`：备份 → 停 3080 → 按依赖序装 5 插件（--allow-formal，幂等）→ 起 → 逐项 verify；支持 `--no-restart` / `--rebuild` / `--skip-verify` | ✅ |

### 建议项 9：已记录（暂缓）

- **根因**：官方 `dsh-client-ui-settings-plugins`（未 fork）里 `CardForm.save()` 对
  写入失败统一置 `failed`，只显示泛化文案「本部署没有接受这些值」；而 scope
  （`dsh-client-ui-settings` fork 的 `SettingsScopeController.write()`）在
  `settings.mutate` 失败（含 revision 冲突，服务端已返回 `code: "settings-conflict"`）
  时静默吞错并返回 `undefined`，卡片只能靠「写后读回」判断失败、无法区分原因。
- **建议修法（后续）**：① fork `dsh-client-ui-settings-plugins`，在 `save()` 失败
  分支按错误码显示「页面状态已过期，请刷新后重试」；② 让 scope 的 `write()` 把
  `settings-conflict` 错误码透出（返回 `{ok:false, code}` 而非 `undefined`）。
  两者都要 fork 官方包（同包名覆盖），改动面较大，本轮未动，留待下次。
- **AGENTS.md 红线 6 已按「opencode 可执行安装器、停/起正式 web 由用户确认」更新。**

### 本轮另有（用户追加需求）

- deepseek-pet 设置卡片拆成两张一级卡片（「DeepSeek 桌宠」仅桌宠开关并改为下拉框、
  「账房面板」独立开关+预算+费率），声音/音效控制只在三击诊断面板、设置页不重复；
  账房开关关闭时桌宠不再显示账房信息。
- 皮肤中心只保留 **maid-atelier（Abyssal Maid Atelier）**，其余 10 款皮肤源码目录
  已删除并重新生成注册表 / dsh-skins 聚合包。
