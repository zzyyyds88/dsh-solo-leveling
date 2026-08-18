/**
 * dsh-client-ui-access-gate — 访问门禁设置卡片的 node 半。
 *
 * 空 apply 让插件出现在 host cordis.yml / Loader 中；浏览器半通过
 * `exports["./client"]`（package.json 的 `dsh.client` 声明）提供「设置 →
 * 插件 → 插件配置」里的门禁卡片。它读写的命名空间（`access-gate`）由
 * `dsh-host-access-gate` 宿主插件注册，`dsh-host-apiproxy` 动态暴露。
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
