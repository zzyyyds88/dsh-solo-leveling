# dsh-defaults —— 默认值统一设置插件（思路库）

> 合并原「修改默认工作目录」与「思考强度与重试默认值」两个项目为**一个插件**：
> 全部可配置参数（默认工作目录 / 默认重试次数）在 Web GUI「设置 → 插件 → 插件配置」
> 的「默认值」卡片中由用户自行配置；思考强度菜单保持 fork 内建默认档位
> （off/low/medium/high），不进设置页（composer 对话框里直接可调，见 §3）。
> **默认重试次数对所有供应商生效**（内置 DeepSeek 与第三方一致）。

---

## 1. 要解决的问题

| 原项目 | 原实现（硬编码/脚本） | 本插件 |
|---|---|---|
| 修改默认工作目录 | 构建期 `DSH_PICKER_DEFAULT_PATH` 注入 client bundle | 设置页配置 `defaultWorkingDirectory`，目录选择器打开时实时读取 |
| 思考强度与重试默认值 | 思考强度：fork 内建 off/low/medium/high；重试：`patch-retry-policy.py` 逐供应商写 settings.yaml | 思考强度保持内建默认；重试：设置页配置 `defaultRetryCount`，**所有供应商**（含内置 DeepSeek）未声明时自动兜底 |

## 2. 架构（一个项目，两个新插件 + 五个 fork）

```
dsh-defaults/
├── packages/
│   ├── dsh-defaults/            ← 新插件（宿主半）：注册 dsh-defaults 设置命名空间
│   ├── dsh-client-ui-defaults/  ← 新插件（前端半）：设置 → 插件 → 插件配置 →「默认值」卡片
│   └── （fork 源码同目录：picker-browse / llm / llm-deepseek / pi-ai / apiproxy
│        本地副本，全部自包含、不跨项目引用）
├── install-defaults-plugin.mjs  ← 幂等安装：复制新插件 + 合并 cordis.patch.yml
├── build.sh                     ← 构建五个 fork（源码全部在本项目 packages/ 内）
├── install-to-test-env.sh       ← 装进 test-env（3090，agent 可执行）
├── install-to-profile.sh        ← 正式安装（会重启 dsh，由用户手动执行）
├── verify-defaults.mjs          ← 黑盒验证（登录 → RPC → 断言）
└── 定制记录/ 升级后重打补丁指南.md
```

设置命名空间（存 `$DSH_HOME/settings.yaml`）：

```yaml
dsh-defaults:
  defaultWorkingDirectory: ""   # 空 = 官方行为（打开 host 主目录）
  defaultRetryCount: 10         # 所有未声明 retryPolicy 的供应商的默认重试次数
```

五个 fork（源码全部在本项目 `packages/` 内，其中 `dsh-host-apiproxy` 为本地副本，
与 `dsh-AccessGate/` 各维护一份同源码 fork，互不交叉引用；两份均含
`access-gate` + `dsh-defaults` 两个命名空间暴露，同包名覆盖时任一生效两项目皆可用）：

| fork | 改动 | 生效方式 |
|---|---|---|
| `dsh-host-directory-picker-browse` | `list()` 无路径时读 `defaultWorkingDirectory`（非法/空回退主目录） | 每次打开实时读，改设置即生效 |
| `dsh-llm-pi-ai` | ① 手写 OpenAI 风格模型默认 off/low/medium/high 强度（沿用既有 fork）；② 供应商无显式 retryPolicy 时用 `defaultRetryCount` 兜底 | 改设置触发 `settings/updated` → 重新注册路由 |
| `dsh-llm` | `prepareRoutes` 兜底：providerRetryPolicy 为 undefined 的 adapter 用 `defaultRetryCount`（全局兜底的最后一环） | 同上 |
| `dsh-llm-deepseek` | 内置 DeepSeek 供应商 profile 未写 retryPolicy 时用 `defaultRetryCount` 兜底（`resolveAdapterOptions`） | 同上 |
| `dsh-host-apiproxy` | `exposedNamespaces()` 增加 `dsh-defaults`（设置面板可读写） | 重启 dsh |

## 3. 关键设计决策

- **思考强度不进设置页**（用户明确要求）：composer 模型选择器里的强度菜单由
  `dsh-llm-pi-ai` fork 的 `DEFAULT_HAND_DECLARED_THINKING_LEVEL_MAP`
  （off/low/medium/high，线值=级别名）提供，与内置 DeepSeek 供应商交互一致。
- **重试默认对所有供应商生效**（用户明确要求）：三个层级兜底——
  ① `dsh-llm-pi-ai`（第三方）与 ② `dsh-llm-deepseek`（内置 DeepSeek）在各自的
  profile 解析处 `retryPolicy ?? {mode:'normal', maxRetries: defaultRetryCount}`；
  ③ `dsh-llm` 在注册兜底处覆盖任何 providerRetryPolicy 为 undefined 的 adapter。
  显式声明的 retryPolicy 始终优先；`mode` 必须显式（`resolveRetryPolicy` 校验）。
- **重试变更监听 `settings/updated` 而非 `settings/document-updated`**：
  `update()` 流程里 `bumpRevision`（发 document-updated）先于 `commit`（替换
  resolved 值）执行，document-updated 监听器会读到旧值导致不重新注册；
  `settings/updated` 在 commit 之后同步发出，值已刷新。
- **目录选择器用 host 端 fork 而非 client 端**：client 端 fork（旧项目做法）需要
  构建期注入或前端读 RPC，host 端 `list()` 每次请求实时读命名空间，改设置即生效；
  旧 client fork 退役（安装脚本移除，Loader 回退官方版）。
- **配置入口是「插件配置」卡片而非独立标签页**（用户明确要求）：注册
  `settings.plugin.item` 槽位，卡片样式与官方「网页搜索」卡片一致（可展开、
  保存/放弃、未保存标记）。

## 4. 安装 / 测试 / 回退

```bash
# 测试环境（不碰正式）
bash dsh-defaults/build.sh                      # 构建五个 fork
bash dsh-defaults/install-to-test-env.sh        # 装进 test-env profile
scripts/test-env-stop.sh && scripts/test-env-start.sh
node dsh-defaults/verify-defaults.mjs           # 黑盒验证（9 项断言）

# 正式环境（⚠ 会重启 dsh，需用户手动执行）
bash dsh-defaults/install-to-profile.sh
# 浏览器打开 设置 → 插件 → 插件配置 →「默认值」卡片，配置两个参数

# 回退
node dsh-defaults/install-defaults-plugin.mjs --unpatch   # 移除新插件 + 还原 cordis.patch.yml
# fork 回退：把 install 脚本备份的 .pre-defaults-* 目录拷回原位置
```

## 5. 升级应对策略

DSH 升级后，全局安装包被官方版覆盖；profile 内同名 fork 与插件保持生效（升级免疫）。
若上游 API 契约变化（settings 事件名、directory-picker 接口、llm 注册结构），
按 `升级后重打补丁指南.md` 适配：对照 upstream 源码重打 diff → rebuild → test-env 验证。

## 6. 涉及的关键代码位置

- 设置命名空间 schema：`dsh-defaults/packages/dsh-defaults/lib/index.js`
- 设置卡片：`dsh-defaults/packages/dsh-client-ui-defaults/lib/client.js`
  （`settings.plugin.item` 注册 + DefaultsCard 组件）
- picker 默认目录：`packages/dsh-host-directory-picker-browse/src/index.ts`
  （`configuredStartPath()`）
- 重试兜底（第三方）：`packages/dsh-llm-pi-ai/src/config.ts`
- 重试兜底（内置 DeepSeek）：`packages/dsh-llm-deepseek/src/index.ts`
  （`resolveAdapterOptions`）
- 重试兜底（全局）：`packages/dsh-llm/src/index.ts`（`prepareRoutes`）
- 重试变更监听：`packages/dsh-llm-pi-ai/src/index.ts` 与
  `dsh-llm-deepseek/src/index.ts`（`settings/updated` 监听器）
- 命名空间暴露：`packages/dsh-host-apiproxy/src/api-proxy.ts`
  （`exposedNamespaces()`）
