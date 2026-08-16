# 定制记录 —— 本文件夹说明

- `变更记录.md`：本次做了什么、为什么、怎么验证、怎么回退（含正式环境误写事件）。
- `本次diff.patch`：机器可读的改动 diff（新插件源码 + apiproxy fork 命名空间暴露）。

配套工具在上一级目录：
- `install-access-gate-plugin.mjs` —— 幂等安装/迁移（复制插件 + 合并 cordis.patch.yml +
  迁移旧 web-auth 口令键；含正式环境防护）；
- `install-to-test-env.sh` —— 装进测试环境（test-env，端口 3090）；
- `switch-to-https.sh` —— 原子切换 HTTPS 反代拓扑（正式安装入口，用户手动执行）；
- `test-access-gate.mjs` —— 独立集成测试（普通鉴权 + 首次设置两大场景，17 项）；
- `verify.sh` —— 一键验证（静态 + 集成 + 可选 --live）；
- `升级后重打补丁指南.md` —— DSH 升级后的恢复指引。
