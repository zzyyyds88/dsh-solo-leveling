// dsh-client-ui-defaults — 默认值设置卡片，node 半。
// 空 apply 让插件出现在 host cordis.yml / Loader 中；浏览器半通过
// exports["./client"]（package.json 的 dsh.client 声明）提供设置标签页。
// 它读写的命名空间（dsh-defaults）由 dsh-defaults 宿主插件注册并经
// dsh-host-apiproxy fork 暴露。
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
export { apply }
