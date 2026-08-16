# 工作区级专用 DSH 测试环境（test-env/）

> 打包测试专用的 DSH 环境：**独立 DSH_HOME + 独立端口**，与正式环境
> （`$HOME/.dsh`、全局安装 `/usr/lib/node_modules/@deepseek-ai/dsh`、正式端口 3080）
> 完全隔离。**铁律：任何打包 / 安装 / 升级测试，只允许在这里进行，严禁在运行中的
> 正式 DSH 上直接替换。**

## 多测试环境（共 4 个，`TEST_ENV_INDEX` 选择，默认 1）

所有 `scripts/test-env-*.sh` 均支持 `TEST_ENV_INDEX` 环境变量：

| 索引 | 目录 | 端口 | 用法 |
|---|---|---|---|
| 1 | `test-env/` | 3090 | `scripts/test-env-start.sh`（默认） |
| 2 | `test-env-2/` | 3091 | `TEST_ENV_INDEX=2 scripts/test-env-start.sh` |
| 3 | `test-env-3/` | 3092 | `TEST_ENV_INDEX=3 scripts/test-env-start.sh` |
| 4 | `test-env-4/` | 3093 | `TEST_ENV_INDEX=4 scripts/test-env-start.sh` |

**使用声明（强制）**：使用某个环境前，先在该环境 `USAGE.md` 填写
「项目 / 用途 / 开始时间」；`test-env-status.sh` 显示声明状态，
`test-env-reset.sh --check` 把未清空的声明当作残留，恢复基线时自动清空。

## 结构

```
test-env[-N]/
├── USAGE.md             ← 使用声明（强制填写；reset 时自动清空）
├── settings.yaml        ← 测试设置（官方基线为空；测试时按需写入）
├── dsh-web.pid          ← 测试实例 PID 文件（脚本管理）
├── dsh-web.log          ← 测试实例日志
├── storages/            ← 测试会话数据（独立）
├── sessions/            ← 测试会话（独立）
└── profiles/web/        ← 官方模板 profile（node_modules 为空，bundle 从全局回退解析）
```

## 官方基线（默认状态）

测试环境的默认状态 = **官方 web profile 模板**（与 `dsh web` 初始化行为一致）：

- `package.json` bundles：`[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]`
- `cordis.patch.yml`：官方空模板 `[]`（无任何定制挂载）
- `node_modules`：空（Loader 从全局安装回退解析 bundle，官方行为）
- `settings.yaml`：空（无口令、无供应商、无自定义段）

官方基线的可观察行为：无鉴权门闸（HTTP 200）、目录选择器默认主目录、
`llm.models` 只有官方 `deepseek-official` 供应商。

## 日常命令（都在 scripts/ 下）

| 命令 | 作用 |
|---|---|
| `scripts/test-env-reset.sh` | **恢复官方基线**（幂等）：移除 fork / 本地插件 / patch 配置 / 测试设置 / .bak 残留，重建官方模板 profile，清空使用声明 |
| `scripts/test-env-reset.sh --check` | 检查当前是否已是官方基线（实例运行中或声明未清空会提示） |
| `scripts/test-env-init.sh` | 初始化 / 重建测试环境（`--force` 从正式 profile 克隆基线；`--from` 可从已验证种子克隆） |
| `scripts/test-env-start.sh [--port 3090]` | 启动测试实例（隔离 DSH_HOME，默认 3090） |
| `scripts/test-env-stop.sh` | 按 PID 文件精确停止（不用 pkill -f） |
| `scripts/test-env-status.sh` | 查看实例 / 端口 / 已装插件 |
| `scripts/test-env-install.sh <包目录>…` | 把已构建插件包装进测试 profile（自动备份被覆盖包为 .bak） |

## 打包测试标准流程（含环境恢复纪律 + 使用声明）

> **约定（强制）**：
> ① 使用某测试环境前，先在该环境 `USAGE.md` 声明**正在哪个项目使用**
> （项目 / 用途 / 开始时间），`test-env-status.sh` 会显示声明状态；
> ② 每次测试完成（无论成败），都必须用 `test-env-reset.sh` 把测试环境恢复为
> 官方基线**并清空声明**，保证下一次测试从干净的官方行为开始。

```bash
# 0. 选定环境（默认 1）并确认从官方基线开始；声明使用项目
export TEST_ENV_INDEX=2                              # 用 test-env-2（端口 3091）
scripts/test-env-status.sh                           # 查看声明状态
scripts/test-env-reset.sh --check                    # 确认官方基线
# 填写 test-env-2/USAGE.md：项目 / 用途 / 开始时间

# 1. 构建插件（在项目目录，如 定制插件化改造/ 或 dsh-defaults/）
cd 定制插件化改造 && ./build.sh && cd ..

# 2. 装进测试环境（不碰正式环境）
scripts/test-env-install.sh --from-project 定制插件化改造
bash dsh-defaults/install-to-test-env.sh             # dsh-defaults 统一插件的完整安装流程

# 3. 重启测试实例并验证
scripts/test-env-stop.sh && scripts/test-env-start.sh
# 浏览器访问对应端口（官方基线无鉴权；临时装 web-auth 后口令 test123456）
node dsh-defaults/verify-defaults.mjs                 # 黑盒验证

# 4. 验证完毕 → 恢复官方基线并清空声明（下次测试从干净环境开始）
scripts/test-env-stop.sh
scripts/test-env-reset.sh
scripts/test-env-reset.sh --check                 # 确认已是官方基线

# 5. 全部验证通过后，才允许执行正式安装脚本（install-to-profile.sh，
#    且必须由用户在 SSH 终端手动执行，会重启正式 dsh web）
```

## 重建与升级适配

- DSH 升级后，测试环境基线过期 → `scripts/test-env-init.sh --force` 重建基线，
  再重装定制插件验证。
- 重建前确认没有运行中的测试实例（`scripts/test-env-status.sh`）。
- 本环境可随时删除重建（`rm -rf test-env` 后重新 init），不影响任何正式数据。
