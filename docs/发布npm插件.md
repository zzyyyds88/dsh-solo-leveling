# 个人发布 DSH 插件到 npm

> 结论：**可以。** 个人完全可以把 DSH 插件发布到 npm（dsh-plugin 生态里大量
> 插件都是个人发布的）。但有两种情况要分清，同名覆盖的 fork 包**不能**发 npm。

## 1. 先分清两类插件

| 类型 | 包名 | 能否发布 npm | 分发方式 |
|---|---|---|---|
| **同名覆盖 fork**（如 `@deepseek-ai/dsh-host-webserver`） | `@deepseek-ai/*`（scope 归 DeepSeek 所有，受保护，你发不上去；而且 `"private": true`） | ❌ | 本仓库 git 分发 / tarball / profile 挂载脚本（见 `定制插件化改造/`） |
| **全新独立插件**（自己研发、不覆盖官方包） | `@<你的npm用户名>/dsh-*` 或独立名 | ✅ | `npm publish` → `dsh plugin add @<用户名>/dsh-xxx` |

参考先例：`dsh-web-ui`（zhu1090093659）用个人 scope `@linxin666/dsh-*` 发布全家桶；
`dsh-web-auth`（kitty-eu-org）也是个人发布的 npm 插件。

## 2. 发布前置

```bash
npm config get registry        # 应为 https://registry.npmjs.org/
npm login                      # 需要 npmjs.com 账号（当前本机尚未登录，先注册+登录）
# 或 CI 环境用 token：NPM_TOKEN=<token> npm publish（token 只放环境变量/用户级 ~/.npmrc）
```

## 3. 包规范（对标官方/社区插件）

```jsonc
// package.json 要点
{
  "name": "@<你的npm用户名>/dsh-<功能>",   // dsh- 前缀；个人 scope
  "version": "0.1.0",
  "description": "一句话说明（会被 dsh-plugin 聚合收录）",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./package.json": "./package.json" },
  "files": ["lib"],                         // 只发布构建产物
  "scripts": { "build": "tsdown", "prepack": "tsdown" },  // 发布前自动构建 lib/
  "license": "MIT"
}
```

- **发布前必须先构建出 `lib/`**（`dsh plugin add` 装的是 npm 包里的预构建产物，
  不会替你跑 build；git 安装才需要 prepare 脚本——见 §4）。
- 客户端插件（`dsh-client-ui-*`）bundle 构建用 tsdown，参照
  `定制插件化改造/build/tsdown.client.ts` 与 `dsh-web-ui-main/shared/tsdown.client.ts`。

## 4. 发布与安装

```bash
# 发布（scoped 包默认私有，必须 --access public）
npm publish --access public
# 验证
npm view @<你的npm用户名>/dsh-<功能> version

# 用户安装（三种方式）
dsh plugin add @<你的npm用户名>/dsh-<功能>        # npm
dsh plugin add ./dsh-<功能>-0.1.0.tgz              # tarball（npm pack）
dsh plugin add github:<你>/<仓库>#<sha>            # git（需 prepare 脚本 + allowBuilds 授权，务必锁 commit）
```

## 5. 发布后对接生态（被更多人发现）

1. GitHub 仓库打 **`dsh-plugin`** 主题标签 → 进入
   [dsh-plugin 主题](https://github.com/topics/dsh-plugin)，Oh-My-DSH、
   插件市场等聚合站点会自动/定期收录；
2. 可选：向 [awesome-dsh-plugin](https://github.com/beancookie/awesome-dsh-plugin)
   提 PR 收录；
3. 仓库 README 写明：功能、截图、安装方式（npm/git/tarball 三选一）、
   适配的 DSH 版本、维护说明（破坏性更新应对）。

## 6. 维护（DSH 破坏性更新）

- 发布新版本 = 改 version → `npm publish`；用户 `dsh plugin add <包>@<版本>` 升级。
- DSH 升级后先在 `test-env/`（端口 3090）重验再发版；破坏性 API 变更时同步
  更新 README 的适配版本。
- 大版本破坏性变更建议走 semver：`0.x → 0.y`（不兼容）或 `1.0.0` 起步。
