/**
 * dsh-mobile-adapt — 移动端适配插件（本地定制，不随上游分发）
 *
 * 原则：桌面端 UI 本身设计良好，不做结构级改动。本插件只在窄屏
 * （手机/平板，max-width: 768px）下做两件事：
 *
 *   A. 注入移动端 CSS（本文件，index.html tap）：
 *      1. 侧栏与详情列抽屉化：client bundle 给 AppFrame 打 data-dshm-role
 *         角色标记、把 grid 压成「仅中心列」，这两列改成 position:fixed
 *         抽屉，靠 shell 自身的 data-sidebar-collapsed / data-details-collapsed
 *         驱动滑入/滑出（侧栏左缘滑出、详情右缘滑出）；
 *      2. 输入区触控优化（16px 防 iOS 聚焦缩放、安全区、底部贴边）；
 *      3. 视口与基础：100dvh、禁下拉刷新、禁文字缩放、隐藏 tooltip；
 *      4. aionui 右侧面板（文件树/预览）在窄屏下变成「抽屉」；
 *      5. 设置弹层单列化 + 图标栏导航；
 *      6. 桌宠缩小贴角。
 *
 *   B. 浏览器端 JS（lib/client.js，client bundle）：
 *      1. 打 data-dshm-role 角色标记、维护 data-dshm-narrow、强制 grid；
 *      2. 左缘右滑呼出侧栏、点遮罩收起（走 ctx.layout 服务）；
 *      3. enterkeyhint=send、禁捏合缩放、命令面板键盘守卫；
 *      4. 进入窄屏时自动收起 aionui 文件树一次（抽屉默认关闭）；
 *      5. visualViewport 键盘避让：键盘高度写 --dsm-keyboard-inset
 *         （本文件的输入区规则消费）+ body data-dshm-keyboard（桌宠让位）；
 *      6. aionui 抽屉打开时同样显示遮罩，点遮罩走面板自身收起控件关闭。
 *
 * 鉴权不变：仍走 dsh-web-auth 登录门闸。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Stable Cordis plugin name. */
export const name = 'client-ui-mobile-adapt'

/** Services required before the index tap can register. */
export const inject = ['webServer']

/** 注入的移动端样式（仅窄屏生效，不影响桌面布局）。 */
const MOBILE_CSS = `
@media (max-width: 768px) {
  /* ── 0. 视口与基础 ──────────────────────────────────────────────── */
  html, body, [id='root'] {
    height: 100dvh;
  }
  body {
    overscroll-behavior-y: none;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
  }
  /* 手机隐藏 tooltip（触屏无 hover，悬停气泡会遮挡内容） */
  [role='tooltip'] {
    display: none !important;
  }
  /* 会话内容顶部留白：第一条消息不贴到标签栏/分割线下方 */
  [data-conversation-scroll] {
    padding-top: 10px !important;
  }
  /* 触控目标：按钮走浏览器无 300ms 延迟的手势。
     排除桌宠角色：它需要 touch-action:none（自己的样式）才能顺畅拖拽，
     被 manipulation 覆盖后浏览器会把拖拽手势抢去滚动，导致每次只能挪一点。 */
  [data-dshm-narrow] button:not(.dsh-live2d-character),
  [data-dshm-narrow] [role='button'] {
    touch-action: manipulation;
  }
  /* 代码块横向滚动（手机上长代码/长命令不挤压正文） */
  [data-dshm-narrow] pre {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
  }

  /* ── 1. 侧栏/详情列 → 抽屉 ──────────────────────────────────────
     client bundle 打 data-dshm-role 角色标记，并把 grid 压成
     「0px minmax(0,1fr) 0px 0px 0px」；这两列改成 fixed 抽屉，
     靠 shell 自身的 data-*-collapsed 属性驱动开合。 */
  [data-dsh-frame][data-dshm-narrow] > [data-dshm-role='sidebar'] {
    position: fixed !important;
    z-index: 46;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(78vw, 300px);
    transform: translateX(-104%);
    transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 32px rgba(2, 8, 23, 0.4);
  }
  [data-dsh-frame][data-dshm-narrow] > [data-dshm-role='sidebar'] > * {
    width: 100% !important;
  }
  [data-dsh-frame][data-dshm-narrow]:not([data-sidebar-collapsed]) > [data-dshm-role='sidebar'] {
    transform: translateX(0);
  }
  [data-dsh-frame][data-dshm-narrow] > [data-dshm-role='details'] {
    position: fixed !important;
    z-index: 46;
    top: 0;
    bottom: 0;
    right: 0;
    width: min(100vw, 480px);
    transform: translateX(104%);
    transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 32px rgba(2, 8, 23, 0.4);
  }
  [data-dsh-frame][data-dshm-narrow]:not([data-details-collapsed]) > [data-dshm-role='details'] {
    transform: translateX(0);
  }
  /* 侧栏/详情/aionui 都 out-of-flow 后，中心列是唯一 in-flow 子项，
     需显式落到第 2 轨（1fr），否则会自动落到 0px 的第 1 轨导致聊天区消失 */
  [data-dsh-frame][data-dshm-narrow] > [data-dshm-role='center'] {
    grid-column: 2;
  }
  /* 移动端隐藏 shell 侧栏/详情拖拽把手（fixed 抽屉下其 inline left 已无意义） */
  [data-dsh-frame][data-dshm-narrow] > [data-side] {
    display: none !important;
  }

  /* 移动端浮出菜单按钮（client bundle 创建） */
  .dshm-menu-button {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 12px;
    z-index: 45;
    width: 40px;
    height: 40px;
    border: 1px solid var(--dsw-alias-border-l1);
    border-radius: 12px;
    background: var(--dsw-alias-bg-layer-1);
    color: var(--dsw-alias-label-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    box-shadow: 0 4px 14px rgba(2, 8, 23, 0.16);
  }
  .dshm-menu-button:active,
  .dshm-menu-button[aria-pressed='true'] {
    color: var(--dsw-alias-label-primary);
    background: var(--dsw-alias-button-ghost-active-fill);
  }

  /* 抽屉遮罩（client bundle 创建） */
  .dshm-scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.45);
    cursor: pointer;
    touch-action: none;
  }

  /* ── 2. 输入区：贴边 + 安全区 + 16px 防 iOS 聚焦缩放 ───────────── */
  /* 键盘避让：iOS 布局视口不随键盘压缩，client 半把键盘高度写进
     --dsm-keyboard-inset，这里加出等高滚动余量让输入卡可滚到键盘上方；
     Android 布局视口自身会压缩（差值为 0），不会双重抬高 */
  [data-composer-seat] {
    padding-bottom: calc(max(env(safe-area-inset-bottom), 10px) + var(--dsm-keyboard-inset, 0px));
  }
  /* hero 空会话态：桌面端输入框居中，手机上沉到底部（margin-top:auto 把
     flex 列里的输入座推到底，覆盖 scrollBody 的 justify-content:center） */
  [data-phase='hero'] [data-composer-seat] {
    margin-top: auto;
  }
  /* hero 标题与输入卡片解耦：默认标题/工作区 chip/输入卡片同处 composerHero
     堆叠（gap 8px），手机上看起来「粘在一起」。把 HeroShell 从堆叠中提出，
     固定定位到视口中部悬浮（45% 略高于真中心以平衡鱼图标视觉重心），
     输入卡片与 chip 留在底部，两者明显分离。 */
  [data-phase='hero'] [class*='composerHero'] > [class*='root'] {
    position: fixed !important;
    top: 45% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: max-content !important;
    height: auto !important;
  }
  [data-composer-seat] [data-composer-card] textarea,
  [data-composer-seat] textarea {
    font-size: 16px !important; /* 防止 iOS 聚焦时自动放大页面 */
    line-height: 1.5;
  }
  /* hero 输入区（空会话）：工作区/预设/分支 chip 一行放不下时换行，避免右缘裁剪 */
  [data-composer-seat] [class*='heroWorkspaceRow'] {
    flex-wrap: wrap !important;
    gap: 8px !important;
    /* chip 行默认顶到座位最左（x:0），而输入卡有 16px 左右内边距；让 chip
       行与输入卡内容对齐，避免「悬浮在卡片外」的错位感。 */
    padding-left: 16px !important;
    padding-right: 16px !important;
    box-sizing: border-box !important;
  }
  /* Git 分支快捷 chip（input.dock 槽）：hero 空会话态在手机上无空位可放
     （与预设座重叠），窄屏下隐藏；分支仍可在文件树抽屉/Git 图谱查看 */
  [data-composer-seat] [class*='anchorDock'] {
    display: none !important;
  }

  /* ── 3. aionui 右侧面板（文件树/预览）→ 抽屉 ─────────────────────
     client bundle 在窄屏时给 AppFrame 加 data-dshm-narrow，并把 grid 里
     aionui 的两个轨道压成 0px；这里的规则把这两个列改成绝对定位抽屉：
     aionui 自身用 inline visibility 表达开/合（visible=展开），据此滑入/滑出。 */
  [data-dsh-frame][data-dshm-narrow] [data-aionui-explorer-col],
  [data-dsh-frame][data-dshm-narrow] [data-aionui-preview-col] {
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    right: 0 !important;
    left: auto !important;
    width: min(88vw, 360px) !important;
    max-width: 88vw !important;
    z-index: 46 !important;
    transform: translateX(104%);
    visibility: hidden !important;
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.28s;
    box-shadow: -14px 0 36px rgba(2, 8, 23, 0.4);
  }
  [data-dsh-frame][data-dshm-narrow] [data-aionui-explorer-col][style*="visibility: visible"],
  [data-dsh-frame][data-dshm-narrow] [data-aionui-preview-col][style*="visibility: visible"] {
    transform: translateX(0);
    visibility: visible !important;
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s;
  }
  /* 移动端隐藏拖拽把手（触摸下无意义），浮出按钮加大便于点按 */
  [data-dsh-frame][data-dshm-narrow] .aionui-explorer-handle,
  [data-dsh-frame][data-dshm-narrow] .aionui-preview-handle {
    display: none !important;
  }
  .aionui-floating-expand {
    width: 24px !important;
    height: 44px !important;
    top: 104px !important;
    transform: none !important;
    border-radius: 10px 0 0 10px !important;
    font-size: 14px !important;
  }

  /* ── 3.5 底部统计栏：窄屏两行完整显示 ─────────────────────────
     布局规则在 ui-live-stats 的 merge-css.ts（@media max-width:768px）：
     官方统计组 + TPS 整段内联流式换行（通常两行），全部内容可见。 */

  /* ── 4. 设置弹层：图标栏导航 + 字段纵向堆叠 ──────────────────────
     侧栏抽屉开了 transform（translateX），会把里面 fixed 的 overlay
     限制在抽屉 300px 内 → 设置弹窗「只弹一半」。设置弹窗打开时解除
     抽屉 transform，overlay 恢复全屏定位（fixed inset:0 才覆盖视口）。 */
  [data-dsh-frame][data-dshm-narrow] > [data-dshm-role='sidebar']:has([role='dialog'][aria-modal='true']) {
    transform: none !important;
  }
  [role='dialog'][aria-modal='true'] {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: calc(100dvh - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
  }
  [role='dialog'][aria-modal='true'] > nav {
    width: 64px !important;
    flex: none !important;
    padding: 16px 8px 0 !important;
    gap: 10px !important;
  }
  [role='dialog'][aria-modal='true'] > nav [class*='navTitle'] {
    display: none !important;
  }
  [role='dialog'][aria-modal='true'] > nav [class*='navList'] {
    gap: 6px !important;
  }
  [role='dialog'][aria-modal='true'] > nav [class*='navCell'] {
    height: 48px !important;
    padding: 0 !important;
    justify-content: center !important;
    border-radius: 12px !important;
  }
  [role='dialog'][aria-modal='true'] > nav [class*='navLabel'] {
    display: none !important; /* 竖屏只显示图标，形成可伸缩图标栏 */
  }
  [role='dialog'][aria-modal='true'] > div[class*='content'] {
    min-width: 0 !important;
  }
  /* 字段行：文字区占满整行、控件换行到下一行全宽，避免文本被挤压成竖排 */
  [role='dialog'][aria-modal='true'] [class*='rowText'] {
    flex: 1 1 100% !important;
    flex-basis: 100% !important;
    padding-right: 0 !important;
    min-width: 0 !important;
    width: 100% !important;
  }
  [role='dialog'][aria-modal='true'] [class*='rowText'] [class*='title'],
  [role='dialog'][aria-modal='true'] [class*='rowText'] [class*='desc'] {
    width: 100% !important;
    max-width: 100% !important;
  }
  [role='dialog'][aria-modal='true'] [class*='row'] {
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    gap: 8px !important;
  }
  [role='dialog'][aria-modal='true'] [class*='row'] > :last-child:not(input[type='checkbox']):not(input[type='radio']) {
    width: 100% !important;
    flex-basis: 100% !important;
  }
  /* 只放大文本输入/下拉/多行输入；复选框/单选框保持原尺寸——
     否则「选择要添加的模型」等弹窗里的 14px 复选块会被撑成 100% 宽的巨块 */
  [role='dialog'][aria-modal='true'] input:not([type='checkbox']):not([type='radio']),
  [role='dialog'][aria-modal='true'] select,
  [role='dialog'][aria-modal='true'] textarea {
    min-height: 44px !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
    font-size: 16px !important;
  }
  [role='dialog'][aria-modal='true'] [class*='options'] {
    padding-left: 16px !important;
    padding-right: 16px !important;
    min-width: 0 !important;
    -webkit-overflow-scrolling: touch;
  }
  [role='dialog'][aria-modal='true'] [class*='section'] {
    max-width: 100% !important;
  }

  /* ── 5. 桌宠：与 3080 完全一致的尺寸（0.75）+ 在屏内 ────────────
     用户要求：3090 桌宠大小必须和 3080 一致（3080 即 0.75）。
     right/bottom 保持 8/74：出屏（-30/-24）是 3080 旧构建的 bug，
     修好后 3080 重装也会是 8/74。 */
  [data-dsh-live2d-root] {
    --pet-scale: 0.75 !important;
    right: 8px !important;
    bottom: 74px !important;
  }
  [data-dsh-live2d-root][data-collapsed='true'] {
    --pet-scale: 1 !important;
    right: 8px !important;
    bottom: 10px !important;
  }
  /* 弹层打开时把桌宠让开（避免遮挡设置/选择器内容） */
  body:has([role='dialog'][aria-modal='true']) [data-dsh-live2d-root] {
    opacity: 0 !important;
    pointer-events: none !important;
  }
  /* 虚拟键盘弹起时桌宠让位（避免浮在键盘上方遮挡输入区） */
  body[data-dshm-keyboard] [data-dsh-live2d-root] {
    opacity: 0 !important;
    pointer-events: none !important;
  }
}
`

/** Build the index.html transform: inject the style block before </head>. */
function buildTap() {
  return (html: string): string => {
    if (typeof html !== 'string' || !html.includes('</head>')) return html
    const tag = `<style data-plugin-css="dsh-client-ui-mobile-adapt">${MOBILE_CSS}</style>`
    return html.replace('</head>', `${tag}</head>`)
  }
}

/**
 * Mount the plugin: register the index tap so the mobile adaptation CSS
 * rides along with every rendered index.html.
 * @param ctx - plugin context carrying the webServer service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.tapIndex(buildTap()), 'client-ui-mobile-adapt: index tap')
}
