# 访问门禁（Access Gate）—— DSH 登录鉴权插件（思路库）

> 原「全网监听与登录鉴权」定制项目**插件化改造**后的正式形态：
> 把「改安装包补丁 + 手写插件」升级为**源码维护的正式 DSH 插件**
> （后端 `dsh-host-access-gate` + 前端卡片 `dsh-client-ui-access-gate`），
> 升级免疫、可维护、可测试。旧项目的补丁脚本（patch-*.py）已退役——
> 门闸钩子 / 命名空间暴露 / 登录放行由本项目 `packages/` 下的三个 fork 包提供
> （`dsh-host-webserver` / `dsh-host-apiproxy` / `dsh-client-connection`）。

---

## 1. 要解决的问题

`dsh web` 默认只监听 `127.0.0.1:3080`；直接监听 `0.0.0.0` 又被启动器硬性拒绝
（官方警告：会暴露远程代码执行）。目标是让局域网内其他设备能安全访问 Web GUI：

1. 有**口令登录**（避免把「远程代码执行面」裸奔）；
2. 走 **HTTPS**（彻底解决浏览器「非安全上下文」问题，如 `crypto.randomUUID`）。

## 2. 架构（与旧版的关系）

```
局域网设备 ──HTTPS(自签)──▶ 0.0.0.0:5700（caddy 反向代理）
                                │ 未登录 → /login；首次无口令 → /setup
                                ▼
                          127.0.0.1:3080（dsh web，只监听回环）
                                ├─ 路由分发：/api/*（RPC 网关）、/plugins/*/client.js
                                ├─ 回退座：SPA dist（frontend-static）
                                └─ WebSocket 升级：/api/events.mux、/api/events.host
```

| 组件 | 旧版（全网监听与登录鉴权） | 本插件（访问门禁） |
|---|---|---|
| 请求门闸钩子 `registerGate` | `patch-webserver-gate.py` 打安装包 | **fork** `dsh-host-webserver`（profile 同名覆盖） |
| 设置命名空间暴露 | `patch-settings-integration.py` 打安装包 | **fork** `dsh-host-apiproxy`：`exposed.add('access-gate')` |
| settings.* 登录放行 | 同上（connection） | **fork** `dsh-client-connection`：`webAuthAuthed` |
| 鉴权后端插件 | `dsh-web-auth`（手写 ESM） | **`dsh-host-access-gate`**（改名规范化） |
| 设置入口 | 「设置 → 插件」独立标签页 `settings.plugins.tab` | **「设置 → 插件 → 插件配置」卡片** `settings.plugin.item`（开发规范 §2.5） |
| 口令存储键 | settings.yaml `web-auth:` | settings.yaml **`access-gate:`**（安装脚本自动迁移旧键） |
| 环境变量 | `DSH_WEB_PASSWORD` | `DSH_ACCESS_GATE_PASSWORD`（兼容旧名） |

## 3. 命名对照（重命名清单）

| 位置 | 旧名 | 新名 |
|---|---|---|
| 项目文件夹 | 全网监听与登录鉴权/ | **dsh-AccessGate/**（项目名「访问门禁」） |
| 后端插件包 | `dsh-web-auth` | **`dsh-host-access-gate`** |
| 前端插件包 | `dsh-client-ui-web-auth` | **`dsh-client-ui-access-gate`** |
| cordis 插件 id | `web-auth` / `ui-web-auth` | **`access-gate`** / **`ui-access-gate`** |
| settings 命名空间 | `web-auth` | **`access-gate`** |
| 会话 Cookie | `dsh_session` | `dsh_session`（不变） |
| webAuth 服务名 | `webAuth` | `webAuth`（不变，connection fork 契约） |
| 环境变量 | `DSH_WEB_PASSWORD` | `DSH_ACCESS_GATE_PASSWORD`（旧名兼容兜底） |

## 4. 方案要点

| 项 | 值 |
|---|---|
| 对外访问 | `https://<IP>:<端口>/`（caddy；**10 年自签证书**，浏览器首次信任一次；只认 https 前缀） |
| 反代参数 | GUI「设置 → 插件 → 插件配置 → 访问门禁」卡片可配置 **局域网地址/域名（lanHost）+ HTTPS 端口（httpsPort，默认 5700）**，`switch-to-https.sh` 读取生成 Caddyfile 与 `--trusted-host` |
| dsh 监听 | `127.0.0.1:3080`（仅回环，明文 HTTP 不再暴露） |
| 登录 | `/login` 输入访问口令（`mode: on` 强制）；登录页为**蓝色液态玻璃**设计（背景图 + 流动光斑 + 毛玻璃卡片） |
| 首次启动 | 未设置任何口令时所有页面跳 `/setup`，由用户**自行设置**访问口令（不生成、不打印） |
| 修改口令 | GUI「设置 → 插件 → 插件配置 → 访问门禁」卡片（口令可留空不修改；保存后旧会话立即失效） |
| 会话 | Cookie `dsh_session`（HMAC-SHA256、HttpOnly、SameSite=Strict、默认 7 天） |
| 未登录行为 | 页面/静态资源 → 302 /login；`/api/*` → 401 JSON；WebSocket 升级 → 403 |
| 口令来源（优先级） | config.password > settings 命名空间 `access-gate.password` > `DSH_ACCESS_GATE_PASSWORD`（兼容 `DSH_WEB_PASSWORD`）> passwordFile |
| 限速 | 每来源 IP（识别 X-Forwarded-For）10 次/10 分钟错误尝试后锁定登录 |
| 版本 | dsh `0.1.0-rc.6`；fork 源码在本项目 `packages/`（`dsh-host-apiproxy` 为本地副本，与 `dsh-Moresettings/` 各自维护一份同源码 fork） |

## 5. 安装 / 测试 / 回退

```bash
# 0) 构建依赖的 fork（apiproxy 已含 access-gate 命名空间暴露）
./build.sh

# 1) 测试环境（不碰正式）
bash install-to-test-env.sh                 # 装 fork + 新插件 + patch 进 test-env（3090）
DSH_ACCESS_GATE_PASSWORD=test123456 scripts/test-env-start.sh
DSH_HOME=$PWD/test-env node test-access-gate.mjs    # 独立集成测试（17 项）
DSH_HOME=$PWD/test-env bash verify.sh               # 静态 + 集成 + 幂等检查

# 2) 正式环境（⚠ 会停/起正式 dsh，需用户在 SSH 终端手动执行）
bash switch-to-https.sh            # 原子：停 dsh → 装插件写配置 → 起 caddy → 起 dsh → 自检
#   局域网地址/端口优先级：DSH_LAN_IP/DSH_HTTPS_PORT 环境变量 > 命令行参数 >
#   设置页保存的 access-gate.lanHost/httpsPort > 默认 192.168.1.100/5700
#   改端口/地址：设置页改后重跑 switch-to-https.sh（会重启 caddy 与 dsh）

# 回退
node install-access-gate-plugin.mjs --unpatch   # 还原 cordis.patch.yml.bak + 删除插件目录
```

## 6. 升级应对策略

DSH 升级/重装只可能覆盖全局安装包；本项目的依赖全部在 `$DSH_HOME`（profile 插件 +
fork 同名覆盖）+ 系统服务（caddy），**天然升级免疫**。若上游 API 契约变化
（registerGate 签名、settings 事件名、client bundle 格式），按
`升级后重打补丁指南.md` 适配：改 fork 源码 → rebuild → test-env 验证。

## 7. 关键代码位置

- 门闸钩子：`packages/dsh-host-webserver/src/index.ts`（`registerGate`）
- 命名空间暴露：`packages/dsh-host-apiproxy/src/api-proxy.ts`
  （`exposedNamespaces()`：`access-gate` + 兼容 `web-auth`）
- 登录放行：`packages/dsh-client-connection/src/index.ts`
  （`webAuthAuthed`，消费 `webAuth` 服务）
- 鉴权插件：`packages/dsh-host-access-gate/lib/index.js`（登录/首次设置/会话/限速/命名空间）
- 前端卡片：`packages/dsh-client-ui-access-gate/lib/client.js`
  （`settings.plugin.item` 注册 + AccessGateCard 组件）
- 安装/迁移：`install-access-gate-plugin.mjs`（含旧 `web-auth` 行与口令键迁移）

## 8. 经验与避坑

### 8.1 参数解析与正式环境防护（本次最大教训）

`--profile-dir test-env/profiles/web` 这类**空格分隔参数**曾被解析为 `--flag=value`
形式而漏读 → 脚本回退到默认正式 profile，**误写正式环境**。修复：
① 参数解析同时支持两种写法；② 增加安全闸：目标 profile 不是 `test-env*` 目录时
**拒绝写入**，必须显式 `--allow-formal`。正式环境的任何安装/还原脚本，一律
封装后**交用户在 SSH 终端执行**（agent 不自启 dsh）。

### 8.2 配置热重载会崩掉运行中的 Web 会话（沿用旧项目教训）

运行中的 dsh web 会热重载 `cordis.patch.yml`：服务存活时改写该文件会把承载
GUI/agent 会话的进程搞崩。所有配置改动必须「先停 → 写 → 再启动」原子化。

### 8.3 非安全上下文问题用 HTTPS 整体解决

明文 HTTP（局域网 IP）是非安全上下文：`crypto.randomUUID` 等浏览器 API 不可用。
用 caddy/nginx 反代 + 自签证书 + `--trusted-host` 一次解决，不逐个 polyfill。

### 8.4 设置写路径的 RPC 契约

客户端设置卡片保存走 `api.settings.mutate({ns, ops:[{op:"set",path:[field],value}]})`
（带 expectedRevision），不是 `settings.update`。改口令落盘后 host 端 `onChange`
轮换 HMAC key → 旧会话立即失效（实测：旧 Cookie 302、新口令登录成功）。

### 8.5 其它沿用旧项目的避坑

- caddy 默认占 80 端口：Caddyfile 加 `auto_https disable_redirects`；
- `tls internal` 只签配置的 host：用真实 IP 访问（127.0.0.1 会 SNI 不匹配）；
- 同端口无法同时收 HTTP 与 HTTPS：直接 `https://` 前缀访问，不做跳转端口；
- 端口与 dsh 解耦：trustedHosts 用无端口 host，改端口只动 Caddyfile；
- **换 IP/域名重配时证书必须重生成**：`switch-to-https.sh` 会比对现有证书 SAN 与
  当前地址，不匹配则自动重新生成（证书绑地址、不绑端口，只改端口不重生成）；
- 首次启动不生成/打印任何随机口令，只提示用户去 `/setup` 设置。
