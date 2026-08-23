/**
 * dsh-mobile-adapt — 移动端适配插件（本地定制，不随上游分发）
 *
 * 原则：桌面端 UI 本身设计良好，不做结构级改动。本插件只在窄屏
 * （手机/平板，默认 max-width: 768px，设置卡可调）下做三件事：
 *
 *   A. 注入移动端 CSS（本文件，index.html tap；模板在 shared.ts 的
 *      buildMobileCss，浏览器半在配置偏离默认值时接管重建）：
 *      1. 侧栏与详情列抽屉化：client bundle 给 AppFrame 打 data-dshm-role
 *         角色标记、把 grid 压成「仅中心列」，这两列改成 position:fixed
 *         抽屉，靠 shell 自身的 data-sidebar-collapsed / data-details-collapsed
 *         驱动滑入/滑出（侧栏左缘滑出、详情右缘滑出）；
 *      2. 输入区触控优化（16px 防 iOS 聚焦缩放、安全区、底部贴边）；
 *      3. 视口与基础：100dvh、禁下拉刷新、禁文字缩放、隐藏 tooltip；
 *      4. aionui 右侧面板（文件树/预览）在窄屏下变成「抽屉」；
 *      5. 设置弹层单列化 + 图标栏导航 + 手机端专项（触控目标加大、
 *         圆角收紧、外观主题方块一行三等分、提供方操作按钮加高）；
 *      6. 桌宠窄屏默认展开（0.75 缩放，设置卡可调），整体抬到输入区
 *         上方避免遮挡；最小化后的小圆角标仍贴角显示。
 *      7. 会话标题行（面包屑簇）窄屏水平居中。
 *      抽屉宽度与桌宠缩放走 --dshm-* CSS 变量（client 半运行时写入），
 *      断点写在媒体查询里（偏离默认时由 client 半重建样式表）。
 *
 *   B. 注册 `mobile-adapt` 设置命名空间（installSettingsSection）：
 *      「设置 → 插件 → 插件配置 → 移动端适配」卡片可调总开关 / 断点 /
 *      三个抽屉宽度 / 桌宠缩放，保存即生效（无需重启）。
 *
 *   C. 浏览器端 JS（lib/client.js，client bundle）：
 *      打角色标记/强制 grid/抽屉与遮罩交互/键盘避让/观察器节流，
 *      详见 client/index.ts 头注。
 *
 * 鉴权不变：仍走 dsh-web-auth 登录门闸。
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { Config as MobileAdaptSchema, MOBILE_ADAPT_SETTINGS_NAMESPACE } from './settings.ts'
import { buildMobileCss, MOBILE_ADAPT_DEFAULTS } from './shared.ts'
import type { Config } from './shared.ts'

/** Stable Cordis plugin name. */
export const name = 'client-ui-mobile-adapt'

/** Services required before the index tap can register. */
export const inject = ['webServer']

/** Build the index.html transform: inject the style block before </head>. */
function buildTap() {
  return (html: string): string => {
    if (typeof html !== 'string' || !html.includes('</head>')) return html
    // 默认断点的样式：浏览器半加载后按设置接管（配置偏离默认时重建）。
    const tag = `<style data-plugin-css="dsh-client-ui-mobile-adapt">${buildMobileCss(MOBILE_ADAPT_DEFAULTS.breakpoint)}</style>`
    return html.replace('</head>', `${tag}</head>`)
  }
}

/**
 * Mount the plugin: register the settings section, then tap index.html so
 * the mobile adaptation CSS rides along with every rendered page.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - deployment configuration (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config: Config = {}): void {
  installSettingsSection(ctx, MOBILE_ADAPT_SETTINGS_NAMESPACE, MobileAdaptSchema, config, {
    // 行为全在浏览器半（scope.subscribe 即时响应），host 侧无需派生。
    setSource: () => {},
    onChange: () => {},
  })
  ctx.effect(() => ctx.webServer.tapIndex(buildTap()), 'client-ui-mobile-adapt: index tap')
}
