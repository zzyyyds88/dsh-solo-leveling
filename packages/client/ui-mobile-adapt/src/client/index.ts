/**
 * dsh-client-ui-mobile-adapt — 移动端适配（浏览器端 bundle）
 *
 * 职责（窄屏 max-width: 768px 生效）：
 *   1. 给 AppFrame 加 data-dshm-narrow 属性（host 注入的 CSS 据此把
 *      aionui 右侧面板变成抽屉）；
 *   2. 把 AppFrame 的 grid 轨道强制为「侧栏 + 聊天全宽 + 0/0/0」——
 *      aionui 每次布局变更都会重写 inline grid，这里用 important
 *      覆盖并观察变更持续生效；
 *   3. 抽屉默认关闭：启动时以及切换工作区（root 变化导致 aionui
 *      重新展开文件树）时自动收起；用户主动点浮出按钮打开则放行。
 *
 * 注意：不能用 classList 操作 frame 的 className——React 会重写
 * className，与 MutationObserver 形成死循环（实测 renderer 被杀）。
 * 一律使用 data-* 属性（React 不管理、无人观察，安全）。
 */
import type { Context } from '@deepseek-ai/cordis'

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

function findFrame(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-dsh-frame]')
    ?? document.querySelector<HTMLElement>('[data-sidebar-collapsed], [data-details-collapsed]')
}

/** 期望的窄屏 grid（保留侧栏与 DSH details 轨道，aionui 两轨压成 0）。 */
function narrowGrid(f: HTMLElement): string | null {
  const tracks = (f.style.gridTemplateColumns || '').split(/\s+/).map(t => t.trim()).filter(Boolean)
  if (tracks.length < 5) return null
  return `${tracks[0]} minmax(0, 1fr) ${tracks[2]} 0px 0px`
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

/** 窄屏布局：data 标记 + grid 强制 + 抽屉管理。 */
function applyNarrow(): void {
  const f = findFrame()
  if (f === null) return
  frame = f

  if (!mql.matches) {
    // 回到桌面：撤销窄屏覆盖，恢复 aionui 自己的 grid
    f.removeAttribute('data-dshm-narrow')
    if (f.dataset.dshmGrid === '1') {
      f.style.removeProperty('grid-template-columns')
      delete f.dataset.dshmGrid
    }
    return
  }

  f.setAttribute('data-dshm-narrow', '')

  // grid 强制（important 覆盖 aionui 的非 important 写入；值未变化时跳过，避免自触发循环）
  const next = narrowGrid(f)
  if (next !== null && (f.style.gridTemplateColumns !== next || f.dataset.dshmGrid !== '1')) {
    f.style.setProperty('grid-template-columns', next, 'important')
    f.dataset.dshmGrid = '1'
  }

  ensureExplorerWatcher()
}

function onMediaChange(): void {
  applyNarrow()
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
    }
    applyNarrow()
  })
  bodyObserver.observe(document.body, { childList: true, subtree: true })

  const f = findFrame()
  if (f !== null) {
    styleObserver = new MutationObserver(applyNarrow)
    styleObserver.observe(f, { attributes: true, attributeFilter: ['style', 'class'] })
  }

  return () => {
    mql.removeEventListener('change', onMediaChange)
    if (bodyObserver !== null) bodyObserver.disconnect()
    if (styleObserver !== null) styleObserver.disconnect()
    if (expObserver !== null) expObserver.disconnect()
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
  }
}

/** 客户端插件不依赖任何 cordis 服务。 */
export const inject: string[] = []

export function apply(ctx: Context): void {
  ctx.effect(() => install(), 'client-ui-mobile-adapt: narrow layout')
}
