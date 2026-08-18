/**
 * dsh-client-ui-git-graph — 浏览器半的 node 半入口。
 *
 * host 半（git 服务 + /git 路由）已拆分到 `dsh-host-git-graph`；本包只承载
 * 浏览器半（分支选择 chip + 图谱对话框），通过 `exports["./client"]`
 * （package.json 的 `dsh.client` 声明）装配。
 */

/** Host plugin body — the git service lives in dsh-host-git-graph. */
export function apply(): void {}
