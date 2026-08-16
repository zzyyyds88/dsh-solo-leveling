# 迁移到「每实例内置 caddy」（2026-08-16）

> 现状：全局 systemd caddy 管正式 5700（`/etc/caddy/Caddyfile` + `sites.d/` 片段）。
> 目标：每个 dsh 实例用自己的**内置 caddy**（插件包 `bin/caddy`，配置在
> `$DSH_HOME/caddy/`），实例间完全隔离、restart 互不影响、换机器无需装 caddy。

## 正式实例（3080）迁移步骤（SSH 终端手动执行）

```bash
# 1) 停掉全局 systemd caddy（避免与实例内 caddy 抢 5700 端口）
systemctl disable --now caddy

# 2) 清理旧全局配置（备份后删除）
mv /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-embedded.bak
rm -rf /etc/caddy/sites.d

# 3) 重启正式 dsh —— 插件读到 settings 反代参数后自动用内置 caddy 接管 5700
#    （dsh 以 root 运行；`systemctl restart <你的 dsh 服务>` 或按你原来的方式启动）
#    若 settings.yaml 还没有反代参数，先在 GUI 设置卡填：
#      局域网地址/域名：192.168.1.100
#      HTTPS 端口：5700
#    保存 → 点「重启」→ 系统拉起 dsh → 实例内 caddy 自动运行

# 4) 验证
curl -k https://192.168.1.100:5700/        # 应 302 到 /login
ls $DSH_HOME/caddy/                        # Caddyfile / certs/ / caddy.pid
```

## 说明

- **启动方式不变**：`npx @deepseek-ai/dsh web`（或你的 supervisor 配置），
  插件启动时自动 spawn 内置 caddy。
- **多实例并存**：各实例配置在各自的 `$DSH_HOME/caddy/`，端口各自配置
  （如正式 5700、测试 5701），互不干扰。
- **restart 按钮**：只停本实例的 caddy + 退出本实例 dsh，其它实例反代不受影响。
- **换机器**：无需安装 caddy（插件自带二进制，打包时放入 `bin/caddy`，
  见 dsh-AccessGate/README 的打包说明）。
- **回退**：`systemctl enable --now caddy` + 恢复 `/etc/caddy/Caddyfile.pre-embedded.bak`。
