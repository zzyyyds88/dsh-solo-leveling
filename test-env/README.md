# 工作区级专用 DSH 测试环境（test-env/）

> 打包测试专用的 DSH 环境：**独立 DSH_HOME + 独立端口（3090）**，与正式环境
> （`$HOME/.dsh`、全局安装 `/usr/lib/node_modules/@deepseek-ai/dsh`、正式端口 3080）
> 完全隔离。**铁律：任何打包 / 安装 / 升级测试，只允许在这里进行，严禁在运行中的
> 正式 DSH 上直接替换。**

## 结构

```
test-env/
├── README.md            ← 本说明
├── settings.yaml        ← 测试设置（web-auth 口令 test123456，仅供本环境）
├── dsh-web.pid          ← 测试实例 PID 文件（脚本管理）
├── dsh-web.log          ← 测试实例日志
├── storages/            ← 测试会话数据（独立）
├── sessions/            ← 测试会话（独立）
└── profiles/web/        ← 从正式 profile 克隆的测试 profile
    └── node_modules/@deepseek-ai/   ← 装入测试的定制插件（fork）
```

## 日常命令（都在 scripts/ 下）

| 命令 | 作用 |
|---|---|
| `scripts/test-env-init.sh` | 初始化 / 重建测试环境（默认从正式 profile 克隆基线；`--from 定制插件化改造/test-env` 可从已验证种子克隆） |
| `scripts/test-env-start.sh [--port 3090]` | 启动测试实例（隔离 DSH_HOME，默认 3090） |
| `scripts/test-env-stop.sh` | 按 PID 文件精确停止（不用 pkill -f） |
| `scripts/test-env-status.sh` | 查看实例 / 端口 / 已装插件 |
| `scripts/test-env-install.sh <包目录>…` | 把已构建插件包装进测试 profile（自动备份被覆盖包为 .bak） |

## 打包测试标准流程

```bash
# 1. 构建插件（在项目目录，如 定制插件化改造/）
cd 定制插件化改造 && ./build.sh && cd ..

# 2. 装进测试环境（不碰正式环境）
scripts/test-env-install.sh --from-project 定制插件化改造

# 3. 重启测试实例并验证
scripts/test-env-stop.sh && scripts/test-env-start.sh
# 浏览器访问 http://127.0.0.1:3090 （测试口令 test123456）

# 4. 全部验证通过后，才允许执行正式安装脚本（install-to-profile.sh，
#    且必须由用户在 SSH 终端手动执行，会重启正式 dsh web）
```

## 重建与升级适配

- DSH 升级后，测试环境基线过期 → `scripts/test-env-init.sh --force` 从新正式
  profile 重建基线，再重装定制插件验证。
- 重建前确认没有运行中的测试实例（`scripts/test-env-status.sh`）。
- 本环境可随时删除重建（`rm -rf test-env` 后重新 init），不影响任何正式数据。
