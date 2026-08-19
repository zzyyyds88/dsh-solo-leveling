/**
 * dsh-client-ui-mobile-adapt — 移动端适配（浏览器端 bundle）
 *
 * 职责（窄屏 max-width: 768px 生效）：
 *   1. 给 AppFrame 打 data-dshm-narrow 属性，并按 DOM 顺序给前三个网格列
 *      打 data-dshm-role（sidebar/center/details）角色标记，host 注入的 CSS
 *      据此把侧栏/详情/aionui 面板变成抽屉；
 *   2. 把 AppFrame 的 grid 轨道强制为「0px + 中心全宽 + 0/0/0」——aionui 每次
 *      布局变更都会重写 inline grid，这里用 MutationObserver 持续覆盖；
 *   3. 侧栏抽屉：左缘右滑呼出 + 左上角菜单按钮 + 点遮罩收起，走 ctx.layout
 *      服务（toggleSidebar / closeDetails），不碰 React 内部；
 *   4. 触控/键盘：enterkeyhint=send、禁捏合缩放、命令面板脚本聚焦守卫；
 *   5. 抽屉默认关闭：启动时以及切换工作区（root 变化导致 aionui 重新展开
 *      文件树）时自动收起；用户主动点浮出按钮打开则放行。
 *
 * 注意：不能用 classList 操作 frame 的 className——React 会重写 className，
 * 与 MutationObserver 形成死循环（实测 renderer 被杀）。一律使用 data-*
 * 属性（React 不管理、无人观察，安全）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

const NARROW_QUERY = '(max-width: 768px)'
const mql = window.matchMedia(NARROW_QUERY)

let frame: HTMLElement | null = null
let styleObserver: MutationObserver | null = null
let bodyObserver: MutationObserver | null = null

// 抽屉（aionui 文件树）管理
let expObserver: MutationObserver | null = null
let userOpenedAt = 0
let lastExpVis: string | null = null
let suppressUserFlag = false
let docWatchInstalled = false

// 侧栏/详情抽屉 chrome（遮罩 + 菜单按钮）
let scrim: HTMLButtonElement | null = null
let menuButton: HTMLButtonElement | null = null
let frameAttrObserver: MutationObserver | null = null

// 由 ctx.layout 服务注入的 panel 动作
let toggleSidebar: () => void = () => {}
let closeDetails: () => void = () => {}

function findFrame(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-dsh-frame]')
    ?? document.querySelector<HTMLElement>('[data-sidebar-collapsed], [data-details-collapsed]')
}

/** 按 DOM 顺序给 shell 的前三列打角色标记（overlay 层前停止）。 */
function stampRoles(f: HTMLElement): void {
  const roles = ['sidebar', 'center', 'details']
  for (let i = 0; i < roles.length; i += 1) {
    const child = f.children.item(i)
    if (child === null || child.hasAttribute('data-shell-overlay')) break
    ;(child as HTMLElement).dataset.dshmRole = roles[i]
  }
}

/** 期望的窄屏 grid：只留中心列，其余（侧栏/详情/aionui×2）全部压成 0。 */
function narrowGrid(): string {
  return '0px minmax(0, 1fr) 0px 0px 0px'
}

/** 收起文件树（等价于点 aionui 浮出按钮的 toggle，会持久化 collapse）。 */
function collapseExplorer(): void {
  suppressUserFlag = true
  const btn = document.querySelector<HTMLElement>('.aionui-floating-expand')
  if (btn !== null) btn.click()
  suppressUserFlag = false
}

function closestTarget(e: Event): Element | null {
  return e.target instanceof Element ? e.target : null
}

/**
 * 观察文件树列的 visibility：窄屏下「hidden→visible」且非用户主动
 * 打开（root 切换/自动展开）时自动收起；用户点浮出按钮打开的放行。
 * 启动时若文件树默认展开也收一次。
 */
function ensureExplorerWatcher(): void {
  const explorer = document.querySelector<HTMLElement>('[data-aionui-explorer-col]')
  if (explorer === null || expObserver !== null) return

  // 浮出按钮可能是之后才渲染的，用 document 捕获阶段委托监听
  if (!docWatchInstalled) {
    docWatchInstalled = true
    document.addEventListener('click', (e) => {
      if (closestTarget(e)?.closest('.aionui-floating-expand') && !suppressUserFlag) {
        userOpenedAt = Date.now()
      }
    }, true)
  }
  // 用户在抽屉里点收起箭头也算用户操作（委托监听，箭头是 React 渲染的）
  explorer.addEventListener('click', (e) => {
    if (closestTarget(e)?.closest('.aionui-collapse-chevron')) {
      userOpenedAt = Date.now()
    }
  })

  lastExpVis = explorer.style.visibility
  expObserver = new MutationObserver(() => {
    const vis = explorer.style.visibility
    if (vis === 'visible' && lastExpVis === 'hidden' && mql.matches) {
      if (Date.now() - userOpenedAt > 600) collapseExplorer()
    }
    lastExpVis = vis
  })
  expObserver.observe(explorer, { attributes: true, attributeFilter: ['style'] })

  // 启动默认状态：文件树展开时收一次
  if (mql.matches && explorer.style.visibility === 'visible') collapseExplorer()
}

const MENU_ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>'

/** 左上角菜单按钮：侧栏抽屉的常驻呼出入口。 */
function ensureMenuButton(): void {
  if (menuButton !== null) return
  menuButton = document.createElement('button')
  menuButton.type = 'button'
  menuButton.className = 'dshm-menu-button'
  menuButton.setAttribute('aria-label', '菜单')
  menuButton.setAttribute('aria-pressed', 'false')
  menuButton.innerHTML = MENU_ICON
  menuButton.addEventListener('click', () => { toggleSidebar() })
  document.body.appendChild(menuButton)
}

/** 抽屉遮罩：侧栏/详情打开时覆盖中心区，点按收起。 */
function ensureScrim(): void {
  if (scrim !== null) return
  scrim = document.createElement('button')
  scrim.type = 'button'
  scrim.className = 'dshm-scrim'
  scrim.setAttribute('aria-label', '关闭面板')
  scrim.addEventListener('click', () => {
    const f = frame
    if (f === null) return
    if (!f.hasAttribute('data-sidebar-collapsed')) toggleSidebar()
    if (!f.hasAttribute('data-details-collapsed')) closeDetails()
  })
  document.body.appendChild(scrim)
}

/** 根据窄屏 + 抽屉开合状态刷新遮罩/菜单按钮的可见性。 */
function syncChrome(): void {
  const f = frame
  const narrow = mql.matches
  const drawerOpen = narrow && f !== null
    && (!f.hasAttribute('data-sidebar-collapsed') || !f.hasAttribute('data-details-collapsed'))
  if (scrim !== null) scrim.hidden = !drawerOpen
  if (menuButton !== null) {
    menuButton.hidden = !narrow
    if (f !== null) {
      const pressed = !f.hasAttribute('data-sidebar-collapsed')
      menuButton.setAttribute('aria-pressed', String(pressed))
    }
  }
}

/** 窄屏布局：data 标记 + 角色 + grid 强制 + 抽屉管理。 */
function applyNarrow(): void {
  const f = findFrame()
  if (f === null) return
  frame = f

  // 本 fork 集成 aionui 面板时没有 web-ui aggregate 的 compat shim，因此
  // data-dsh-frame 从未被打标；而 aionui 与本插件的 CSS 都依赖它。这里补打，
  // 让 [data-dsh-frame] 选择器（aionui 抽屉 + 本插件抽屉）真正生效。
  if (!f.hasAttribute('data-dsh-frame')) f.setAttribute('data-dsh-frame', '')

  if (!mql.matches) {
    // 回到桌面：撤销窄屏覆盖，恢复 shell/aionui 自己的 grid
    f.removeAttribute('data-dshm-narrow')
    if (f.dataset.dshmGrid === '1') {
      f.style.removeProperty('grid-template-columns')
      delete f.dataset.dshmGrid
    }
    syncChrome()
    return
  }

  f.setAttribute('data-dshm-narrow', '')
  stampRoles(f)

  // grid 强制（important 覆盖 aionui 的非 important 写入；值未变化时跳过，避免自触发循环）
  const next = narrowGrid()
  if (f.style.gridTemplateColumns !== next || f.dataset.dshmGrid !== '1') {
    f.style.setProperty('grid-template-columns', next, 'important')
    f.dataset.dshmGrid = '1'
  }

  ensureScrim()
  ensureMenuButton()
  ensureExplorerWatcher()
  syncChrome()
}

function onMediaChange(): void {
  applyNarrow()
}

/** 观察侧栏/详情折叠属性，驱动遮罩与菜单按钮态。 */
function ensureFrameAttrObserver(f: HTMLElement): void {
  frameAttrObserver?.disconnect()
  frameAttrObserver = new MutationObserver(() => { syncChrome() })
  frameAttrObserver.observe(f, {
    attributes: true,
    attributeFilter: ['data-sidebar-collapsed', 'data-details-collapsed'],
  })
}

/** 左缘右滑呼出侧栏抽屉。 */
function installEdgeSwipe(): () => void {
  let active = false
  let opened = false
  let startX = 0
  let startY = 0
  const onStart = (event: TouchEvent): void => {
    const touch = event.touches[0]
    const f = frame
    const sidebarOpen = f !== null && !f.hasAttribute('data-sidebar-collapsed')
    active = touch !== undefined && event.touches.length === 1
      && mql.matches && !sidebarOpen && touch.clientX <= 24
    opened = false
    if (!active || touch === undefined) return
    startX = touch.clientX
    startY = touch.clientY
  }
  const onMove = (event: TouchEvent): void => {
    if (!active || opened || event.touches.length !== 1) return
    const touch = event.touches[0]
    if (touch === undefined) return
    const deltaX = touch.clientX - startX
    if (Math.abs(touch.clientY - startY) > 32 || deltaX < 0) {
      active = false
      return
    }
    if (deltaX < 56) return
    opened = true
    active = false
    toggleSidebar()
  }
  const onEnd = (): void => { active = false }
  window.addEventListener('touchstart', onStart, { passive: true })
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', onEnd, { passive: true })
  window.addEventListener('touchcancel', onEnd, { passive: true })
  return () => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onEnd)
  }
}

/** 键盘「发送」：把虚拟键盘的换行键提示改成发送。 */
function enableMobileEnterSend(): () => void {
  if (!mql.matches) return () => {}
  const mark = (node: Node): void => {
    if (node instanceof HTMLTextAreaElement && node.closest('[data-composer-seat]') !== null) {
      node.setAttribute('enterkeyhint', 'send')
    }
  }
  document.querySelectorAll('[data-composer-seat] textarea').forEach(mark)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLTextAreaElement) mark(node)
        else if (node instanceof Element) node.querySelectorAll('[data-composer-seat] textarea').forEach(mark)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect() }
}

/** 禁止浏览器捏合缩放（WebKit gesture + 多点触控）。 */
function lockMobilePageZoom(): () => void {
  const preventGesture = (event: Event): void => { if (mql.matches) event.preventDefault() }
  const preventPinch = (event: TouchEvent): void => {
    if (mql.matches && event.touches.length > 1) event.preventDefault()
  }
  document.addEventListener('gesturestart', preventGesture, { passive: false })
  document.addEventListener('gesturechange', preventGesture, { passive: false })
  document.addEventListener('gestureend', preventGesture, { passive: false })
  document.addEventListener('touchmove', preventPinch, { passive: false })
  return () => {
    document.removeEventListener('gesturestart', preventGesture)
    document.removeEventListener('gesturechange', preventGesture)
    document.removeEventListener('gestureend', preventGesture)
    document.removeEventListener('touchmove', preventPinch)
  }
}

/** 命令面板打开时脚本自聚焦搜索框会弹起键盘，手机上把它 blur 掉。 */
function suppressCommandPanelScriptFocus(): () => void {
  if (!mql.matches) return () => {}
  const onFocusIn = (event: FocusEvent): void => {
    if (event.isTrusted) return
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (target.closest('[data-composer-card]') === null) return
    target.blur()
  }
  document.addEventListener('focusin', onFocusIn, true)
  return () => { document.removeEventListener('focusin', onFocusIn, true) }
}

/** 安装并返回清理函数（供 ctx.effect 使用）。 */
function install(): () => void {
  applyNarrow()

  mql.addEventListener('change', onMediaChange)

  // 观察 frame 出现/样式变化（aionui 会重写 grid，需持续覆盖）
  bodyObserver = new MutationObserver(() => {
    const f = findFrame()
    if (f !== null && f !== frame) {
      frame = f
      if (styleObserver !== null) styleObserver.disconnect()
      styleObserver = new MutationObserver(applyNarrow)
      styleObserver.observe(f, { attributes: true, attributeFilter: ['style', 'class'] })
      ensureFrameAttrObserver(f)
    }
    applyNarrow()
  })
  bodyObserver.observe(document.body, { childList: true, subtree: true })

  const f = findFrame()
  if (f !== null) {
    styleObserver = new MutationObserver(applyNarrow)
    styleObserver.observe(f, { attributes: true, attributeFilter: ['style', 'class'] })
    ensureFrameAttrObserver(f)
  }

  const disposeEdgeSwipe = installEdgeSwipe()
  const disposeEnterSend = enableMobileEnterSend()
  const disposeZoomLock = lockMobilePageZoom()
  const disposeCommandGuard = suppressCommandPanelScriptFocus()

  return () => {
    mql.removeEventListener('change', onMediaChange)
    if (bodyObserver !== null) bodyObserver.disconnect()
    if (styleObserver !== null) styleObserver.disconnect()
    if (expObserver !== null) expObserver.disconnect()
    if (frameAttrObserver !== null) frameAttrObserver.disconnect()
    disposeEdgeSwipe()
    disposeEnterSend()
    disposeZoomLock()
    disposeCommandGuard()
    scrim?.remove()
    menuButton?.remove()
    if (frame !== null) {
      frame.removeAttribute('data-dshm-narrow')
      if (frame.dataset.dshmGrid === '1') {
        frame.style.removeProperty('grid-template-columns')
        delete frame.dataset.dshmGrid
      }
      frame = null
    }
    bodyObserver = null
    styleObserver = null
    expObserver = null
    frameAttrObserver = null
    scrim = null
    menuButton = null
  }
}

/** 客户端插件依赖 ctx.layout 服务。 */
export const inject = ['layout']

export function apply(ctx: Context): void {
  toggleSidebar = () => { ctx.layout.toggleSidebar() }
  closeDetails = () => { ctx.layout.closeDetails() }
  ctx.effect(() => install(), 'client-ui-mobile-adapt: narrow layout')
}
