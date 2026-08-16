# deepseek-pet —— DSH 桌宠插件（收录上游）

> **收录项目**：从 [keleus/deepseek-pet](https://github.com/keleus/deepseek-pet)
> （MIT）收录的第三方 DSH 前端插件。零改动收录——当前 DSH `0.1.0-rc.6`
> 的客户端 API（`slots` / `sessions` / `shell.overlay` / ModuleLoader）与其
> 完全兼容，**无需改造**，构建产物 `lib/` 直接可用。
>
> 角色是一个嵌入 DeepSeek Harness 网页的交互式桌宠：跟随当前任务、工具调用、
> 上下文占用和活跃会话自动切换表情，支持拖动、缩放、折叠、批准/提问气泡等。

---

## 1. 收录来源与许可

| 项 | 值 |
|---|---|
| 上游仓库 | <https://github.com/keleus/deepseek-pet> |
| 收录时的上游 commit | `287414d`（merge: feat/whip-reactions） |
| 许可 | MIT（见 [LICENSE](LICENSE)），Copyright (c) 2026 keleus |
| 本文件夹内容 | 上游完整源码 + 构建产物（`lib/`）+ 本工作区安装/验证脚本 |
| 上游 README | 见 [README.upstream.md](README.upstream.md)（本文件为工作区思路库） |

## 2. 为什么收录（思路库）

- 个人在 Linux 服务器上部署 DSH，从浏览器/手机访问；桌宠让网页端更有「陪伴感」，
  任务执行中一眼可见状态（思考/工具调用/等待批准/多会话忙碌），符合仓库
  「把 DSH 部署在 Linux 服务器上随时调用」的目标。
- **零改动可用**：经逐项核对（见 §5），其客户端注入 `['slots', 'sessions']`、
  槽位 `shell.overlay`（官方 `dsh-client-ui-layout` 渲染）、
  `ctx.sessions.binding()/open()`、`window.__ModuleLoader__.load()` 协议、
  peerDependencies（react ^18.2.0，运行时 18.3.1）均与 DSH `0.1.0-rc.6` 匹配。
- 构建链独立（esbuild + Python/Pillow 素材生成），`lib/` 已入库，安装不依赖
  网络与构建环境。

## 3. 目录结构

```text
deepseek-pet/
├── README.md              ← 本思路库（收录说明 + 安装 + 验证）
├── README.upstream.md     ← 上游 README（原名归档）
├── LICENSE                ← 上游 MIT 许可
├── package.json           ← 上游包定义（dsh.client / dsh.bundle 声明）
├── cordis.patch.yml       ← 上游自带 patch（insert: deepseek-pet）
├── src/                   ← 上游源码（client 组件 / host 空壳 / 素材）
├── lib/                   ← 构建产物（lib/index.js + lib/client.js，已入库）
├── public/ assets/        ← 表情源素材（WebP）
├── scripts/               ← 上游构建/素材脚本（build.mjs / embed-assets.mjs / build_assets.py）
├── tests/                 ← 上游单元测试（node --test）
├── docs/                  ← 上游预览图
├── install-to-test-env.sh ← 装进工作区测试环境（只写 test-env*，不碰正式）
└── verify.sh              ← 黑盒验证（client bundle 可加载 + 页面含插件）
```

## 4. 安装与测试环境验证

### 4.1 测试环境（本工作区纪律，端口 3090/3091/…）

```bash
# 1) 使用前声明（多环境纪律，见 AGENTS.md）：
#    在目标 test-env*/USAGE.md 填写 项目/用途/开始时间

# 2) 安装（幂等；把包复制进 profile node_modules + 合并 cordis.patch.yml）：
TEST_ENV_INDEX=2 bash install-to-test-env.sh

# 3) 启动测试实例并验证：
TEST_ENV_INDEX=2 scripts/test-env-start.sh
TEST_ENV_INDEX=2 bash verify.sh            # 或 DSH_HOME=$PWD/test-env-2 bash verify.sh

# 4) 测试完成恢复官方基线（纪律）：
TEST_ENV_INDEX=2 scripts/test-env-stop.sh && TEST_ENV_INDEX=2 scripts/test-env-reset.sh
```

### 4.2 正式安装（仅用户，在 SSH 终端手动执行）

上游官方方式（推荐，保持与上游一致，升级时重复执行即可拉新）：

```bash
dsh plugin --profile web add github:keleus/deepseek-pet
# 或本地：dsh plugin --profile web add /path/to/deepseek-pet
dsh web   # 重启网页后刷新浏览器
```

卸载：

```bash
dsh plugin --profile web remove deepseek-pet
```

> 本工作区纪律：**正式安装由用户在 SSH 终端手动执行**；AI 代理只允许
> 在 test-env*（3090-3093）里做打包测试，见 AGENTS.md。

## 5. 兼容性核对记录（DSH 0.1.0-rc.6）

| 检查项 | 结论 |
|---|---|
| 客户端注入 `slots` / `sessions` | ✓ 官方 `dsh-client-runtime` 提供；`dsh-client-ui-input-trigger` 同用 `inject: ["sessions"]` |
| 槽位 `shell.overlay`（kind: list, scope: root） | ✓ 官方 `dsh-client-ui-layout` 声明并 `renderSlot("shell.overlay", {})` 渲染 |
| `ctx.slots.register({name,id,order,label,inject}, Component)` | ✓ 契约逐字段匹配（list 槽位要求 id，排序 priority→order） |
| `ctx.sessions.binding(id)?.session` / `open(id)` | ✓ runtime 提供 `binding(id)` 与 `open(id)` |
| client bundle 协议 `window.__ModuleLoader__.load({id, factory})` | ✓ 与官方 `dsh-client-runtime` 等一致 |
| peerDependencies react `^18.2.0` | ✓ 运行时 react 18.3.1 |
| `dsh.client.inject` 依赖 `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-layout` | ✓ rc.6 均存在 |
| 构建产物 | ✓ `node scripts/build.mjs` 可重复构建（esbuild，无需 Pillow；`assets.generated.js` 已入库） |
| 上游单元测试 | ⚠ 14 项中 13 项通过；1 项失败为上游测试断言 bug（idle 轮换 phase=99 期望 'idle' 实际 'proud'，不影响运行） |

## 6. 上游同步（升级 DSH 后 / 上游更新后）

- **DSH 升级**：这是纯 profile 挂载插件，不碰安装包，升级天然免疫；只需在升级后
  重复 §4.2 的安装命令即可。
- **上游更新**：`git fetch` 上游 → 合并 → 重新 `node scripts/build.mjs` → 重新装
  进测试环境验证 → 记录新 commit。
- 包名 `deepseek-pet`（非 `@deepseek-ai/*`、非 `dsh-*` 前缀）为上游原名，**收录不
  改名**，以便与上游同步；`scripts/test-env-install.sh` 只支持 `@deepseek-ai/*` /
  `dsh-*` 命名，故本项目的安装脚本按「访问门禁」模式自行复制到裸包名
  `node_modules/deepseek-pet`。
