/**
 * dsh-client-ui-aionui-panel — 浏览器半的 node 半入口。
 *
 * host 半（fs + git 服务与 /aionui-panel/* 路由）已拆分到 dsh-host-aionui-panel；
 * 本包只承载浏览器半（Explorer / Preview / SCM 面板），经 `exports["./client"]`
 * （package.json 的 `dsh.client` 声明）装配。
 */

/** Host plugin body — the data routes live in dsh-host-aionui-panel. */
export function apply(): void {}
