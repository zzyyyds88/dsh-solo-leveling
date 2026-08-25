/**
 * dsh-client-ui-mobile-remote — 手机遥控设置卡片的 node 半。
 *
 * 空 apply 让插件出现在 host cordis.yml / Loader 中；浏览器半通过
 * `exports["./client"]`（package.json 的 `dsh.client` 声明）提供「设置 →
 * 插件 → 插件配置」里的「手机遥控」卡片。它读写的命名空间（`mobile-remote`）
 * 由 `dsh-host-mobile-remote` 宿主插件注册并即时消费，保存立即生效。
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
