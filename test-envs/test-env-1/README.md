# 工作区级专用 DSH 测试环境（test-envs/）

> 打包测试专用的 DSH 环境：**独立 DSH_HOME + 独立端口**，与正式环境
> （`$HOME/.dsh`、全局安装 `/usr/lib/node_modules/@deepseek-ai/dsh`、正式端口 3080）
> 完全隔离。**铁律：任何打包 / 安装 / 升级测试，只允许在这里进行，严禁在运行中的
> 正式 DSH 上直接替换。**
>
> 四个环境统一收纳在 `test-envs/` 目录下（重新编号 test-env-1~4）。

## 多测试环境（共 4 个，`TEST_ENV_INDEX` 选择，默认 1）

所有 `scripts/test-env-*.sh` 均支持 `TEST_ENV_INDEX` 环境变量：

| 索引 | 目录 | 端口 | 用法 |
|---|---|---|---|
| 1 | `test-envs/test-env-1/` | 3090 | `scripts/test-env-start.sh`（默认） |
| 2 | `test-envs/test-env-2/` | 3091 | `TEST_ENV_INDEX=2 scripts/test-env-start.sh` |
| 3 | `test-envs/test-env-3/` | 3092 | `TEST_ENV_INDEX=3 scripts/test-env-start.sh` |
| 4 | `test-envs/test-env-4/` | 3093 | `TEST_ENV_INDEX=4 scripts/test-env-start.sh` |

## 纪律（强制，多 Agent 并行工作区）

- **独占**：同一时刻一个测试环境只允许一个项目使用。使用前必须在该环境
  `USAGE.md` 填写「项目 / 用途 / 开始时间」；`test-env-start.sh` 会检查声明，
  已被其他项目占用时拒绝启动。
- **验收**：测试完成后**必须等用户验收通过**，才允许清理测试环境。
  `test-env-reset.sh` 恢复基线必须带 `--verified`（用户验收标记），不带参数
  直接拒绝，防止 Agent 误清未验收环境。
- **测试环境**：插件开发/打包测试一律上 test-env，**禁止直接在正式环境测试**。

## 结构

```
test-envs/test-env-N/
├── USAGE.md             ← 使用声明（强制填写：项目/用途/开始时间/验收状态）
├── settings.yaml        ← 测试设置（基线为最小测试设置，不复制正式口令/密钥）
├── dsh-web.pid          ← 测试实例 PID 文件（脚本管理）
├── dsh-web.log          ← 测试实例日志
├── storages/            ← 测试会话数据（独立）
├── sessions/            ← 测试会话（独立）
└── profiles/web/        ← 从正式 profile 克隆的基线（含已装插件/fork，贴近真实环境）
```

## 基线（从正式克隆，不是官方空模板）

测试环境基线 = **从正式 profile 克隆**（含正式环境已装插件/fork，贴近真实环境）。
`test-env-reset.sh --verified` 重建基线时：
- 克隆正式 profile（`$HOME/.dsh/profiles/web`）→ 测试 profile；
- settings.yaml 只写最小测试设置（**不复制**正式口令/密钥/供应商配置）；
- 清空 USAGE.md 使用声明。

## 日常命令（都在 scripts/ 下）

| 命令 | 作用 |
|---|---|
| `scripts/test-env-init.sh` | 初始化 / 重建测试环境（`--force` 从正式 profile 克隆基线；`--from` 可从已验证种子克隆） |
| `scripts/test-env-reset.sh --verified` | **验收后**恢复基线（必须 `--verified`；清测试期改动 + 声明） |
| `scripts/test-env-reset.sh --check` | 检查环境是否已是基线（实例停、声明空、无测试残留） |
| `scripts/test-env-start.sh [--port 3090]` | 启动测试实例（独占检查：被其他项目占用时拒绝） |
| `scripts/test-env-stop.sh` | 按 PID 文件精确停止（不用 pkill -f） |
| `scripts/test-env-status.sh` | 查看实例 / 端口 / 已装插件 / 使用声明 |
| `scripts/test-env-install.sh <包目录>…` | 把已构建插件包装进测试 profile（自动备份被覆盖包为 .bak） |

## 打包测试标准流程（独占 + 验收纪律）

```bash
# 0. 选定环境（默认 1）并确认从基线开始；声明使用项目
export TEST_ENV_INDEX=2                              # 用 test-env-2（端口 3091）
scripts/test-env-status.sh                           # 查看声明状态
# 填写 test-envs/test-env-2/USAGE.md：项目 / 用途 / 开始时间 / 验收状态=待验收

# 1. 构建插件（在项目目录，如 dsh-AccessGate/ 或 dsh-Moresettings/）
cd dsh-AccessGate && ./build.sh && cd ..

# 2. 装进测试环境（不碰正式环境）
scripts/test-env-install.sh --from-project dsh-AccessGate
bash dsh-AccessGate/install-to-test-env.sh           # 完整安装流程

# 3. 重启测试实例并验证
scripts/test-env-stop.sh && scripts/test-env-start.sh
# 浏览器访问对应端口（基线从正式克隆；临时装 web-auth 后口令 test123456）
node dsh-AccessGate/test-access-gate.mjs             # 黑盒验证

# 4. 验证完成 → 向用户提交验收；用户验收通过后（USAGE.md 验收状态=已验收），
#    才允许清理：
scripts/test-env-stop.sh
scripts/test-env-reset.sh --verified                 # 验收后重建基线
scripts/test-env-reset.sh --check                    # 确认已是基线

# 5. 全部验证通过后，才允许执行正式安装脚本（install-to-profile.sh，
#    且必须由用户在 SSH 终端手动执行，会重启正式 dsh web）
```

## 重建与升级适配

- DSH 升级后，测试环境基线过期 → `scripts/test-env-init.sh --force` 重建基线，
  再重装定制插件验证。
- 重建前确认没有运行中的测试实例（`scripts/test-env-status.sh`）。
- 本环境可随时删除重建（`rm -rf test-envs/test-env-N` 后重新 init），不影响任何正式数据。
