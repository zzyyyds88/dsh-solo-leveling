/**
 * deepseek-pet 应用级设置 —— 目前只有「桌宠开关」（是否显示桌宠本体）。
 *
 * 与音效设置（sound.js，deepseek-pet:sound）分开存储：关掉桌宠 = 完全不渲染、
 * 不发声，是比静音更高一层的开关。纯前端实现，localStorage 持久化，
 * 变更时派发 deepseek-pet:app-changed 事件（诊断面板/设置卡片/组件本体共享）。
 */

const APP_KEY = 'deepseek-pet:app'

function loadApp(): { enabled: boolean } {
  try {
    const raw = window.localStorage.getItem(APP_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: boolean }
      return { enabled: parsed.enabled !== false }
    }
  } catch {}
  return { enabled: true }
}

/** 单例应用设置（模块级，避免多实例重复读盘）。 */
const app = loadApp()

function persist(): void {
  try {
    window.localStorage.setItem(APP_KEY, JSON.stringify(app))
    window.dispatchEvent(new Event('deepseek-pet:app-changed'))
  } catch {}
}

/** 桌宠是否开启（false 时组件不渲染、不发声）。
 * @returns true when the pet is shown and audible, false when hidden entirely.
 */
export function isPetEnabled(): boolean {
  return app.enabled
}

/** 设置桌宠开关，返回新状态。
 * @param enabled - the new pet-enabled state.
 * @returns the resulting enabled state.
 */
export function setPetEnabled(enabled: boolean): boolean {
  app.enabled =  enabled
  persist()
  return app.enabled
}

/** 读取全量应用设置快照（设置卡片用）。
 * @returns a copy of the current app settings (currently just the pet-enabled flag).
 */
export function appSettingsSnapshot(): { enabled: boolean } {
  return { enabled: app.enabled }
}

/** 设置卡片批量保存：一次写入多个字段，返回新快照。
 * @param patch - partial settings to apply; only defined fields are written.
 * @returns the new settings snapshot after the patch is applied.
 */
export function applyAppSettings(patch: { enabled?: boolean }): { enabled: boolean } {
  if (typeof patch.enabled === 'boolean') {
    app.enabled = patch.enabled
    persist()
  }
  return appSettingsSnapshot()
}

/** 订阅应用设置变化（桌宠本体 / 设置卡片共用）。
 * @param listener - invoked on every app-settings change, locally and across tabs.
 * @returns an unsubscribe function that removes both listeners.
 */
export function subscribeAppSettings(listener: () => void): () => void {
  window.addEventListener('deepseek-pet:app-changed', listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener('deepseek-pet:app-changed', listener)
    window.removeEventListener('storage', listener)
  }
}
