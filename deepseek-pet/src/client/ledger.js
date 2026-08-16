/**
 * deepseek-pet 账房模块 —— 实时 token 用量 / 缓存命中率 / 预估价格 / 预算封顶。
 *
 * 数据源（比上游 dsh-dayu-fish-skin 的 DOM 抓取更可靠）：DSH 的「轨迹」会话视图
 * 在插件启动时就注册了（dsh-client-ui-trajectory 的 trajectory view），
 * 每个请求的 usage（inputTokens/cacheReadTokens/cacheWriteTokens/outputTokens/
 * reasoningTokens）都挂在 session snapshot 的 views.get('trajectory').requests 上，
 * 无需打开「轨迹」面板、无需展开请求步骤即可读到会话累计用量。
 *
 * 费率按 DeepSeek API 官方价估算（deepseek-chat：输入未命中 ¥2 / 缓存命中 ¥0.5 /
 * 缓存写入 ¥2 / 输出 ¥8 每百万 token），可在「设置 → 插件 → 插件配置」调整，
 * 持久化于 localStorage（deepseek-pet:ledger）。
 */

const LEDGER_KEY = 'deepseek-pet:ledger'

/** 默认账房设置（费率 ¥/百万 token；预算为会话封顶，元）。 */
const DEFAULT_LEDGER = Object.freeze({
  enabled: true,
  budget: 30,
  rates: Object.freeze({ miss: 2, hit: 0.5, write: 2, output: 8 }),
})

function clampNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function loadLedger() {
  try {
    const raw = window.localStorage?.getItem(LEDGER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const rates = {
          miss: clampNonNegative(parsed.rates?.miss, DEFAULT_LEDGER.rates.miss),
          hit: clampNonNegative(parsed.rates?.hit, DEFAULT_LEDGER.rates.hit),
          write: clampNonNegative(parsed.rates?.write, DEFAULT_LEDGER.rates.write),
          output: clampNonNegative(parsed.rates?.output, DEFAULT_LEDGER.rates.output),
        }
        return {
          enabled: parsed.enabled !== false,
          budget: clampNonNegative(parsed.budget, DEFAULT_LEDGER.budget),
          rates,
        }
      }
    }
  } catch {}
  return { enabled: true, budget: 30, rates: { ...DEFAULT_LEDGER.rates } }
}

/** 单例账房设置（模块级，避免多实例重复读盘）。 */
const ledger = loadLedger()

/** 设置修订号：每次持久化自增，供 useSyncExternalStore 订阅（费率/预算变化触发重渲染）。 */
let ledgerRevision = 0

function persist() {
  try {
    window.localStorage?.setItem(LEDGER_KEY, JSON.stringify(ledger))
    ledgerRevision += 1
    window.dispatchEvent(new Event('deepseek-pet:ledger-changed'))
  } catch {}
}

/** 账房设置修订号（费率/预算/enabled 变化时自增；订阅用，避免整快照比较）。 */
export function ledgerRevisionOf() {
  return ledgerRevision
}

/** 账房面板是否开启。 */
export function isLedgerEnabled() {
  return ledger.enabled
}

/** 会话预算封顶（元）。 */
export function ledgerBudget() {
  return ledger.budget
}

/** 当前费率（¥/百万 token）。 */
export function ledgerRates() {
  return { ...ledger.rates }
}

/** 读取全量账房设置快照（设置卡片用）。 */
export function ledgerSettingsSnapshot() {
  return {
    enabled: ledger.enabled,
    budget: ledger.budget,
    rates: { ...ledger.rates },
  }
}

/** 设置卡片批量保存：一次写入多个字段（enabled/budget/rates），返回新快照。 */
export function applyLedgerSettings(patch) {
  if (patch && typeof patch === 'object') {
    if (typeof patch.enabled === 'boolean') ledger.enabled = patch.enabled
    if (Number.isFinite(patch.budget) && patch.budget >= 0) ledger.budget = patch.budget
    if (patch.rates && typeof patch.rates === 'object') {
      ledger.rates = {
        miss: clampNonNegative(patch.rates.miss, ledger.rates.miss),
        hit: clampNonNegative(patch.rates.hit, ledger.rates.hit),
        write: clampNonNegative(patch.rates.write, ledger.rates.write),
        output: clampNonNegative(patch.rates.output, ledger.rates.output),
      }
    }
    persist()
  }
  return ledgerSettingsSnapshot()
}

/** 订阅账房设置变化（桌宠本体 / 设置卡片共用）。 */
export function subscribeLedgerSettings(listener) {
  window.addEventListener('deepseek-pet:ledger-changed', listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener('deepseek-pet:ledger-changed', listener)
    window.removeEventListener('storage', listener)
  }
}

/* ---------------- 用量聚合（来自轨迹会话视图） ---------------- */

/** 从 session snapshot 读会话累计用量。无数据返回 null。 */
export function usageFromSnapshot(snapshot) {
  const requests = snapshot?.views?.get?.('trajectory')?.requests
  if (!Array.isArray(requests) || requests.length === 0) return null
  const acc = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  let found = false
  for (const request of requests) {
    const usage = request?.usage
    if (!usage || typeof usage !== 'object') continue
    if (Number.isFinite(usage.inputTokens)) { acc.input += usage.inputTokens; found = true }
    if (Number.isFinite(usage.outputTokens)) { acc.output += usage.outputTokens; found = true }
    if (Number.isFinite(usage.cacheReadTokens)) { acc.cacheRead += usage.cacheReadTokens; found = true }
    if (Number.isFinite(usage.cacheWriteTokens)) { acc.cacheWrite += usage.cacheWriteTokens; found = true }
    if (Number.isFinite(usage.reasoningTokens)) { acc.reasoning += usage.reasoningTokens; found = true }
  }
  return found ? acc : null
}

/** 计入计费的输入 token = 未命中输入 + 缓存写入（缓存读取按命中价单算）。 */
export function billedInput(usage) {
  return (usage?.input ?? 0) + (usage?.cacheWrite ?? 0)
}

/** 缓存命中率（缓存读取 / 全部输入），无输入返回 null。 */
export function cacheHitRate(usage) {
  const denom = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0)
  return denom === 0 ? null : Math.round((usage?.cacheRead ?? 0) / denom * 100)
}

/** 预估价格（¥），费率 ¥/百万 token。 */
export function estimateCost(usage, rates = ledger.rates) {
  if (!usage) return 0
  const uncached = billedInput(usage) / 1e6
  const cacheReadM = (usage.cacheRead ?? 0) / 1e6
  const outM = (usage.output ?? 0) / 1e6
  return uncached * rates.miss + cacheReadM * rates.hit + outM * rates.output
}

/* ---------------- 峰谷 / 封顶检测 ---------------- */

/**
 * 追加一次成本采样，返回新历史（最多保留 200 点）。
 * @param {Array<{t:number, cost:number}>} history 既有历史
 * @param {number} cost 本次成本
 */
export function pushCostSample(history, cost) {
  const next = [...history, { t: Date.now(), cost }]
  return next.length > 200 ? next.slice(next.length - 200) : next
}

/**
 * 峰谷判定：与近 10 分钟平均增速相比。
 * @param {Array<{t:number, cost:number}>} history 成本历史
 * @returns {'peak'|'valley'|'normal'}
 */
export function detectTrend(history) {
  if (history.length < 3) return 'normal'
  const prev = history[history.length - 2]
  const latest = history[history.length - 1]
  const delta = latest.cost - prev.cost
  const now = Date.now()
  const recent = history.filter(entry => now - entry.t < 10 * 60 * 1000)
  let avg = 0
  for (let index = 1; index < recent.length; index += 1) avg += recent[index].cost - recent[index - 1].cost
  avg = recent.length > 1 ? avg / (recent.length - 1) : 0
  if (delta > Math.max(avg * 2.5, 0.5)) return 'peak'
  if (avg > 0 && delta < avg * 0.25) return 'valley'
  return 'normal'
}

/** 是否超过预算封顶。 */
export function overBudget(cost, budget) {
  return cost >= budget
}

/** 把大数字格式化成可读字符串（12,345）。 */
export function formatTokens(value) {
  return Math.round(value).toLocaleString('en-US')
}
