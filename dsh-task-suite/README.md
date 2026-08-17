# dsh-task-suite —— DSH Web GUI 精选插件集（思路库）

> 从 [zhu1090093659/dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)
> （v0.1.17，Apache-2.0）**抽取部分功能**，放到本工作区自己的仓库，scope 统一为
> **`@zzyyyds88`**，组成**一个聚合插件**（`dsh-task-suite-all`）安装即得全部功能；
> 并加入 [Small-tailqwq/dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale)
> 的「深海女仆工坊」（maid-atelier）皮肤。
>
> 覆盖用户点名要的功能：**任务看板 · 实时令牌统计 · 实时吞吐统计 · Git 图谱 ·
> 右侧面板（预览 + 文件/变更）· 图像理解（describe_image 工具 + 配置卡）·
> 皮肤设置（皮肤中心）+ 皮肤全家桶（11 款）**。

---

## 1. 抽取来源与许可

| 项 | 值 |
|---|---|
| 上游仓库 | <https://github.com/zhu1090093659/dsh-web-ui> |
| 抽取基线 | `v0.1.17`（2026-08-16，commit `986845a`，"chore(release): bump to 0.1.17"） |
| 上游许可 | Apache-2.0（各包内 LICENSE） |
| 上游仓库 | [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)（本地快照已删除，按 `开发备忘.md` 加速命令可重下） |
| 新增皮肤 | <https://github.com/Small-tailqwq/dsh-deep-whale> → `maid-atelier`（CC BY-NC-SA 4.0，见其 LICENSE/NOTICE） |
| 本套件 scope | `@zzyyyds88`（原上游 `@linxin666` 全局改名，含 package.json / tsdown / cordis.patch.yml / skin.json / skin-switch / 生成物） |

## 2. 抽取了什么

| 功能 | 包 | 说明 |
|---|---|---|
| 任务看板 | `@zzyyyds88/dsh-client-ui-task-board` | 五列看板（待规划/待办/进行中/已完成/已失败）、真实 DSH 会话执行、cron 定时跑 |
| 实时令牌统计 | `@zzyyyds88/dsh-live-stats` | 输入框下方 TPS / LLM 耗时 / 上下文占用 / 缓存命中率 / 输入输出 token |
| 实时吞吐统计 | `@zzyyyds88/dsh-live-stats` | 会话状态行流式 token 估算（~ 启发式），provider 用量到达自动换真实值 |
| Git 图谱 | `@zzyyyds88/dsh-client-ui-git-graph` | 分支选择器 + 提交历史 + 分支泳道图谱（host 端 git 服务 + 前端图谱） |
| 右侧面板 | `@zzyyyds88/dsh-client-ui-aionui-panel` | 文件树 + 多标签预览（md/html/code/diff/csv/pdf/office/图片）+ SCM stage/unstage/discard，宽度拖拽与折叠持久化 |
| 图像理解 | `@zzyyyds88/dsh-tool-describe-image` | 纯文本模型获得视觉：`describe_image` 工具把图片（本地路径 / http(s) URL / 附件引用）交给配置的 OpenAI 兼容视觉端点（Qwen-VL / GLM-4V / GPT-4o / 本地 Ollama 等），**只有返回文本进会话**；输入框加图片按钮；端点/模型/密钥/默认指令/**重试次数（maxRetries，默认 2，瞬时失败自动重试）**在「设置 → 插件 → 插件配置 → Image understanding」卡配置，即时生效 |
| 设置中心 | `@zzyyyds88/dsh-client-ui-web-ui-settings` | 「设置 → 插件 → 插件配置」Web UI 插件组卡片（**已剔除社区插件索引卡**） |
| 皮肤中心 | `@zzyyyds88/dsh-client-ui-skin-center` | 皮肤列表 / 试穿 / 一键应用（host `/api/skin-center/*`，热切换不重启） |
| 皮肤聚合 | `@zzyyyds88/dsh-skins` | 唯一皮肤资产内置（**maid-atelier**，Abyssal Maid Atelier；其余皮肤已按用户要求删除） |
| 聚合插件 | `@zzyyyds88/dsh-task-suite-all` | 一个包装齐上面全部（cordis.patch.yml 汇总各行 + compat shim 内嵌） |

未抽取：pet（桌宠，工作区另有 `deepseek-pet/`）、ssh、remote-web-ui、liangshen。

## 3. 关键设计决策

- **一个插件 = 聚合包**：`dsh-task-suite-all` 的 `cordis.patch.yml` 由
  `scripts/aggregate.mjs` 从 `aggregate.yml`（`patchFrom` + `deps`）生成；安装聚合包
  即全部就位（子包以 `workspace:*` 依赖安装，loader 从 profile 顶层解析行）。
- **皮肤启用互斥走 HOME 层 managed 区段**（上游 `dsh-skin` 语义）：皮肤行的
  **唯一**来源是 harness home 的 `cordis.patch.yml` 的 `# --- dsh-skin managed ---`
  区段（全部皮肤 disabled + 启用皮肤 insert）。**profile 层 patch 绝不写皮肤行**，
  否则与 managed 区段产生 `duplicate loader entry id` 导致启动失败（本次实测踩坑，
  见 `变更记录.md`）。皮肤中心宿主（`skin-switch.ts`）在进程内改这个区段 +
  profile 符号链接，配置 watcher 秒级热生效，无需重启。
- **rebrand 一致性**：`@linxin666` → `@zzyyyds88` 波及 package.json / tsdown
  clientBundle 名 / cordis.patch.yml / skin.json `package` / skin-switch 的 scope
  目录解析 / skin-center 的 `manifest.ts` boot URL 匹配 / dsh-skins 载体生成 /
  `generated/skins.ts`（脚本重生成）/ 测试断言。社区索引（`community.json`、
  `generated/community.ts`）里第三方真实包名（`@linxin666/dsh-client-ui-chat-summary`）
  保持原样不改。
- **实时令牌统计 / 吞吐是同一个包**：`dsh-live-stats` 一个包同时提供输入框下方的
  令牌统计条与会话状态行的流式吞吐，用户点名两项都是它。
- **v0.1.17 已修复本机旧故障**：本机正式 profile 曾因
  `compat-settings-scope.ts` 的 `fallbackStarted` TDZ 把 task-board / live-stats /
  skin-center 停用（cordis.patch.yml 注释里可见）；v0.1.17 源码已修（`let
  fallbackStarted` + 判空守卫），本套件构建产物已含修复（grep 验证），无 TDZ。

## 4. 目录结构

```
dsh-task-suite/
├── README.md / 变更记录.md / 升级后重打补丁指南.md
├── build.sh / install-to-test-env.sh / install-suite-plugin.mjs / verify.sh
├── package.json / pnpm-workspace.yaml（workspace 根）
├── shared/                  ← 上游构建预设（tsdown.client.ts 等，单点维护）
├── scripts/                 ← aggregate.mjs（聚合生成）+ skin-center-bundles（皮肤注册表）
└── packages/
    ├── dsh-task-suite-all/  ← 聚合插件（“一个插件”）
    ├── dsh-task-board / dsh-live-stats / dsh-git-graph / dsh-aionui-panel /
    │   dsh-web-ui-settings / dsh-skins
    └── skins/               ← skin-center + 10 上游皮肤 + maid-atelier（新增）
```

## 5. 构建 / 测试 / 回退

```bash
# 构建（顺序敏感：皮肤 → dsh-skins → 注册表 → 全量）
bash dsh-task-suite/build.sh

# 装进测试环境（test-env，端口 3090）并验证
SKIN=maid-atelier bash dsh-task-suite/install-to-test-env.sh   # 可换 SKIN=null / 其他皮肤
scripts/test-env-stop.sh && scripts/test-env-start.sh
bash dsh-task-suite/verify.sh --live

# 测试后恢复官方基线（强制纪律）
scripts/test-env-stop.sh && scripts/test-env-reset.sh
```

正式安装（**由用户手动执行**，会重启正式 dsh）：

```bash
# 方式 A：dsh plugin add 聚合包（子包需可被 profile 解析，或先逐个 add）
# 方式 B：脚本式复制（同 install-suite-plugin.mjs，但 --profile-dir 指向正式 profile；
#         注意正式环境 HOME 层已有旧 @linxin666 皮肤 managed 区段，应用前先备份）
```

回退：`test-envs/test-env-1/profiles/web/cordis.patch.yml.bak` 还原 patch；
`node_modules/@zzyyyds88/` 删除即卸载（皮肤符号链接一并删除）。

## 6. 验证结论（2026-08-16，test-env 3090）

- 构建：22 个包全部 `tsdown` 构建成功；`aggregate.mjs --check` 与
  `skin-center-bundles --check` 通过。
- 测试：全仓 vitest 通过（task-board 153 / live-stats 30 / web-ui-settings 35 /
  git-graph 77 / aionui-panel 160 / describe-image 140 / 皮肤各包 + skin-center 85 /
  maid-atelier 83 等，合计 830+ 断言）；typecheck 通过。
- 运行：boot 清单含全部 8 个插件 + maid-atelier 皮肤；9 个 client bundle 语法
  通过、路由 200；`/describe-image/attach|raw` 路由已注册（400/404 语义正确）；
  服务日志无错误关键字（无 TDZ / 无 duplicate entry id）。
- 皮肤热切换闭环：`/api/skin-center/apply` official → maid-atelier → official，
  boot 清单每次都正确跟随（配置 watcher 秒级生效）。
