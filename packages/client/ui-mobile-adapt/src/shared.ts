/**
 * Client-safe mobile-adapt settings contract: the namespace id, the
 * configuration shape, and the behavior-side defaults/resolve. This module
 * deliberately imports nothing — the browser bundle pulls it in for the
 * namespace spelling, defaults, and merge logic, and any Host-side import
 * here would violate the client bundle purity gate. The schema itself lives
 * in `settings.ts` (node half only).
 */

/**
 * Settings namespace of the mobile adaptation — the section the web
 * settings surface edits. The node half registers it via
 * `settingsNamespace('mobile-adapt')`; both halves must spell the same id.
 */
export const MOBILE_ADAPT_NS = 'mobile-adapt'

/** Plugin configuration: every tunable of the narrow-screen adaptation. */
export interface Config {
  /** Master switch: off removes the narrow-screen overrides entirely. */
  enabled?: boolean
  /** Viewport width (px) at or below which the mobile layout activates. */
  breakpoint?: number
  /** Width cap (px) of the sidebar drawer. */
  sidebarWidth?: number
  /** Width cap (px) of the details drawer. */
  detailsWidth?: number
  /** Width cap (px) of the aionui panel (file tree / preview) drawers. */
  drawerWidth?: number
  /** Pet scale on narrow screens (1 = desktop size). */
  petScale?: number
}

/**
 * Behavior-side defaults — mirror of the schema defaults in `settings.ts`.
 * The browser half merges these under whatever the settings scope serves so
 * an unset field keeps the shipped behavior.
 */
export const MOBILE_ADAPT_DEFAULTS = {
  enabled: true,
  breakpoint: 768,
  sidebarWidth: 300,
  detailsWidth: 480,
  drawerWidth: 360,
  petScale: 0.75,
} as const satisfies Required<Config>

/**
 * Merge a served (possibly partial) section over the defaults.
 * @param value - the settings scope's served value (may be partial or absent).
 * @returns the effective configuration with every field resolved.
 */
export function resolveMobileAdaptConfig(value: Partial<Config> | undefined): Required<Config> {
  const v = value ?? {}
  return {
    enabled: v.enabled ?? MOBILE_ADAPT_DEFAULTS.enabled,
    breakpoint: v.breakpoint ?? MOBILE_ADAPT_DEFAULTS.breakpoint,
    sidebarWidth: v.sidebarWidth ?? MOBILE_ADAPT_DEFAULTS.sidebarWidth,
    detailsWidth: v.detailsWidth ?? MOBILE_ADAPT_DEFAULTS.detailsWidth,
    drawerWidth: v.drawerWidth ?? MOBILE_ADAPT_DEFAULTS.drawerWidth,
    petScale: v.petScale ?? MOBILE_ADAPT_DEFAULTS.petScale,
  }
}

/**
 * Build the narrow-screen stylesheet for one breakpoint. Single source of
 * truth for both halves: the node half taps the default-breakpoint copy into
 * index.html (no flash before the browser bundle loads), and the browser
 * half rebuilds it through this function when the configured breakpoint (or
 * the master switch) deviates. Drawer widths and the pet scale ride CSS
 * variables (`--dshm-*`) written by the browser half, so editing them needs
 * no stylesheet rebuild.
 * @param breakpointPx - the viewport width the media query gates on.
 * @returns the complete stylesheet text.
 */
export function buildMobileCss(breakpointPx: number): string {
  return `
@media (max-width: ${String(breakpointPx)}px) {
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
    width: min(78vw, var(--dshm-sidebar-w, 300px));
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
    width: min(100vw, var(--dshm-details-w, 480px));
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

  /* ── 1.5 会话标题行：窄屏水平居中 ─────────────────────────────────
     桌面端面包屑（当前会话标题）随标题簇靠左；手机上标题行与左上角浮出
     的菜单按钮同处顶栏，靠左的标题会被按钮压住且视觉偏坠。窄屏把标题簇
     内容（面包屑 + 后随动作）整体居中：簇本身 flex:1 占满整行，改的是
     簇内主轴对齐，不为布局加结构。 */
  [data-dsh-frame][data-dshm-narrow] [class*='titleCluster'] {
    justify-content: center !important;
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
    width: min(88vw, var(--dshm-panel-w, 360px)) !important;
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

  /* ── 5. 桌宠：窄屏默认展开，整体抬到输入区上方 ──────────────────
     展开态尺寸走 --dshm-pet-scale（设置卡可调，默认 0.75）；bottom 抬高
     到输入卡之上（统计条 + 模型行 + 输入卡 ≈ 190px），角色不再压住
     输入区——遮让由定位解决，组件端窄屏不再默认折叠成小圆角标。
     折叠态（最小化按钮）仍贴角：10px 底距 + 安全区。 */
  [data-dsh-live2d-root] {
    --pet-scale: var(--dshm-pet-scale, 0.75) !important;
    right: 8px !important;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 190px) !important;
  }
  [data-dsh-live2d-root][data-collapsed='true'] {
    --pet-scale: 1 !important;
    right: 8px !important;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
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
}
