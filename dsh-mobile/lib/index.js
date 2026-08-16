/**
 * dsh-mobile-adapt — 移动端适配插件（本地定制，不随上游分发）
 *
 * 原则：桌面端 UI 本身设计良好，不做结构级改动。本插件只在窄屏
 * （手机/平板，max-width: 768px）下做两件事：
 *
 *   A. 注入移动端 CSS（本文件，index.html tap）：
 *      1. 设置弹层左侧导航收窄为图标栏，字段行纵向堆叠，避免文本被
 *         挤压成逐字竖排；
 *      2. 输入区触控优化（16px 防 iOS 聚焦缩放、安全区、底部贴边）；
 *      3. aionui 右侧面板（文件树/预览）在窄屏下变成「抽屉」——
 *         平时隐藏，点右侧浮出按钮滑出，聊天区占满全宽（抽屉的开合
 *         由 client bundle 维护的 data-dshm-narrow 属性 + aionui 自身的
 *         visibility 状态驱动）；
 *      4. 桌宠缩小并贴角，减少对手机内容的遮挡。
 *
 *   B. 浏览器端 JS（lib/client.js，client bundle）：
 *      1. 窄屏时把 AppFrame 的 grid 强制为「侧栏 + 聊天全宽 + 0/0/0」，
 *         保住聊天区宽度（aionui 会把 220px+ 的文件树塞进 grid 轨道）；
 *      2. 进入窄屏时自动收起 aionui 文件树一次（抽屉默认关闭）；
 *      3. 桌面↔窄屏切换时自动恢复/应用。
 *
 * 鉴权不变：仍走 dsh-web-auth 登录门闸。
 */

/** Stable cordis plugin name. */
const name = "dsh-mobile-adapt";

/** Services required before routes can be registered. */
const inject = ["webServer"];

/** 注入的移动端样式（仅窄屏生效，不影响桌面布局）。 */
const MOBILE_CSS = `
@media (max-width: 768px) {
  /* ── 1. aionui 右侧面板（文件树/预览）→ 抽屉 ─────────────────────
     client bundle 在窄屏时给 AppFrame 加 data-dshm-narrow，并把 grid 里
     aionui 的两个轨道压成 0px（聊天区占满全宽）；这里的规则把这两个
     列改成绝对定位抽屉：aionui 自身用 inline visibility 表达
     开/合（visible=展开），据此滑入/滑出。 */
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

  /* ── 2. 输入区：贴边 + 安全区 + 16px 防 iOS 聚焦缩放 ───────────── */
  [data-composer-seat] {
    padding-bottom: max(env(safe-area-inset-bottom), 10px);
  }
  [data-composer-seat] [data-composer-card] textarea,
  [data-composer-seat] textarea {
    font-size: 16px !important; /* 防止 iOS 聚焦时自动放大页面 */
    line-height: 1.5;
  }
  /* hero 输入区（空会话）：工作区/预设/分支 chip 一行放不下时换行，避免右缘裁剪 */
  [data-composer-seat] [class*="heroWorkspaceRow"] {
    flex-wrap: wrap !important;
    gap: 8px !important;
  }
  /* Git 分支快捷 chip（input.dock 槽）：hero 空会话态在手机上无空位可放
     （与预设座重叠），窄屏下隐藏；分支仍可在文件树抽屉/Git 图谱查看 */
  [data-composer-seat] [class*="anchorDock"] {
    display: none !important;
  }

  /* ── 3. 设置弹层：图标栏导航 + 字段纵向堆叠 ────────────────────── */
  [role="dialog"][aria-modal="true"] {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    max-height: calc(100dvh - 16px) !important;
  }
  [role="dialog"][aria-modal="true"] > nav {
    width: 64px !important;
    flex: none !important;
    padding: 16px 8px 0 !important;
    gap: 10px !important;
  }
  [role="dialog"][aria-modal="true"] > nav [class*="navTitle"] {
    display: none !important;
  }
  [role="dialog"][aria-modal="true"] > nav [class*="navList"] {
    gap: 6px !important;
  }
  [role="dialog"][aria-modal="true"] > nav [class*="navCell"] {
    height: 48px !important;
    padding: 0 !important;
    justify-content: center !important;
    border-radius: 12px !important;
  }
  [role="dialog"][aria-modal="true"] > nav [class*="navLabel"] {
    display: none !important; /* 竖屏只显示图标，形成可伸缩图标栏 */
  }
  [role="dialog"][aria-modal="true"] > div[class*="content"] {
    min-width: 0 !important;
  }
  /* 字段行：文字区占满整行、控件换行到下一行全宽，避免文本被挤压成竖排 */
  [role="dialog"][aria-modal="true"] [class*="rowText"] {
    flex: 1 1 100% !important;
    flex-basis: 100% !important;
    padding-right: 0 !important;
    min-width: 0 !important;
    width: 100% !important;
  }
  [role="dialog"][aria-modal="true"] [class*="rowText"] [class*="title"],
  [role="dialog"][aria-modal="true"] [class*="rowText"] [class*="desc"] {
    width: 100% !important;
    max-width: 100% !important;
  }
  [role="dialog"][aria-modal="true"] [class*="row"] {
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    gap: 8px !important;
  }
  [role="dialog"][aria-modal="true"] [class*="row"] > :last-child {
    width: 100% !important;
    flex-basis: 100% !important;
  }
  [role="dialog"][aria-modal="true"] input,
  [role="dialog"][aria-modal="true"] select,
  [role="dialog"][aria-modal="true"] textarea {
    min-height: 44px !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box;
    font-size: 16px !important;
  }
  [role="dialog"][aria-modal="true"] [class*="options"] {
    padding-left: 16px !important;
    padding-right: 16px !important;
    min-width: 0 !important;
  }
  [role="dialog"][aria-modal="true"] [class*="section"] {
    max-width: 100% !important;
  }

  /* ── 4. 桌宠缩小贴角，减少对手机内容的遮挡 ─────────────────────── */
  [data-dsh-live2d-root] {
    --pet-scale: 0.58 !important;
    right: -30px !important;
    bottom: -24px !important;
  }
  [data-dsh-live2d-root][data-collapsed="true"] {
    --pet-scale: 1 !important;
    right: 10px !important;
    bottom: 10px !important;
  }
  /* 弹层打开时把桌宠让开（避免遮挡设置/选择器内容） */
  body:has([role="dialog"][aria-modal="true"]) [data-dsh-live2d-root] {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* ── 5. 通用：禁下拉刷新干扰 ───────────────────────────────────── */
  body {
    overscroll-behavior-y: none;
  }
}
`;

/** Build the index.html transform: inject the style block before </head>. */
function buildTap() {
	return (html) => {
		if (typeof html !== "string" || !html.includes("</head>")) return html;
		const tag = `<style data-plugin-css="dsh-mobile-adapt">${MOBILE_CSS}</style>`;
		return html.replace("</head>", `${tag}</head>`);
	};
}

/**
 * Mount the plugin: register the index tap so the mobile adaptation CSS
 * rides along with every rendered index.html.
 * @param ctx - plugin context carrying the webServer service.
 */
function apply(ctx) {
	ctx.effect(() => ctx.webServer.tapIndex(buildTap()), "dsh-mobile-adapt: index tap");
}

export { apply, inject, name };
