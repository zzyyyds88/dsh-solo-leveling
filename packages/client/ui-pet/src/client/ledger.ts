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

/** Billing rates in ¥ per million tokens. */
export interface LedgerRates {
  miss: number
  hit: number
  write: number
  output: number
}

/** The ledger's persisted settings. */
export interface LedgerSettings {
  enabled: boolean
  budget: number
  rates: LedgerRates
}

/** Aggregated per-session token usage. */
export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

/** Raw per-request usage as recorded on the trajectory view. */
export interface RawUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

/** One cost sample in the trend history. */
export interface CostSample {
  t: number
  cost: number
}

/** 默认账房设置（费率 ¥/百万 token；预算为会话封顶，元）。 */
const DEFAULT_LEDGER = Object.freeze({
  enabled: true,
  budget: 30,
  rates: Object.freeze({ miss: 2, hit: 0.5, write: 2, output: 8 }),
})

function clampNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function loadLedger(): LedgerSettings {
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { enabled?: unknown; budget?: unknown; rates?: Partial<LedgerRates> }
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
  } catch {}
  return { enabled: true, budget: 30, rates: { ...DEFAULT_LEDGER.rates } }
}

/** 单例账房设置（模块级，避免多实例重复读盘）。 */
const ledger = loadLedger()

/** 设置修订号：每次持久化自增，供 useSyncExternalStore 订阅（费率/预算变化触发重渲染）。 */
let ledgerRevision = 0

function persist(): void {
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
    ledgerRevision += 1
    window.dispatchEvent(new Event('deepseek-pet:ledger-changed'))
  } catch {}
}

/** 账房设置修订号（费率/预算/enabled 变化时自增；订阅用，避免整快照比较）。
 * @returns the current revision, incremented on every persisted settings change.
 */
export function ledgerRevisionOf(): number {
  return ledgerRevision
}

/** 账房面板是否开启。
 * @returns true when the ledger panel is enabled.
 */
export function isLedgerEnabled(): boolean {
  return ledger.enabled
}

/** 会话预算封顶（元）。
 * @returns the per-session budget cap in yuan.
 */
export function ledgerBudget(): number {
  return ledger.budget
}

/** 当前费率（¥/百万 token）。
 * @returns a copy of the current billing rates in ¥ per million tokens.
 */
export function ledgerRates(): LedgerRates {
  return { ...ledger.rates }
}

/** 读取全量账房设置快照（设置卡片用）。
 * @returns a copy of the full ledger settings.
 */
export function ledgerSettingsSnapshot(): LedgerSettings {
  return {
    enabled: ledger.enabled,
    budget: ledger.budget,
    rates: { ...ledger.rates },
  }
}

/** 设置卡片批量保存：一次写入多个字段（enabled/budget/rates），返回新快照。
 * @param patch - partial settings to apply; only defined fields are written.
 * @returns the new settings snapshot after the patch is applied.
 */
export function applyLedgerSettings(patch: Partial<LedgerSettings>): LedgerSettings {
  if (typeof patch.enabled === 'boolean') ledger.enabled = patch.enabled
  if (typeof patch.budget === 'number' && Number.isFinite(patch.budget) && patch.budget >= 0) ledger.budget = patch.budget
  if (patch.rates && typeof patch.rates === 'object') {
    ledger.rates = {
      miss: clampNonNegative(patch.rates.miss, ledger.rates.miss),
      hit: clampNonNegative(patch.rates.hit, ledger.rates.hit),
      write: clampNonNegative(patch.rates.write, ledger.rates.write),
      output: clampNonNegative(patch.rates.output, ledger.rates.output),
    }
  }
  persist()
  return ledgerSettingsSnapshot()
}

/** 订阅账房设置变化（桌宠本体 / 设置卡片共用）。
 * @param listener - invoked on every ledger-settings change, locally and across tabs.
 * @returns an unsubscribe function that removes both listeners.
 */
export function subscribeLedgerSettings(listener: () => void): () => void {
  window.addEventListener('deepseek-pet:ledger-changed', listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener('deepseek-pet:ledger-changed', listener)
    window.removeEventListener('storage', listener)
  }
}

/* ---------------- 用量聚合（来自轨迹会话视图） ---------------- */

/** 从 session snapshot 读会话累计用量。无数据返回 null。
 * @param snapshot - the conversation session snapshot; its trajectory view carries per-request usage.
 * @returns aggregated per-session token usage, or null when no request carried numeric usage.
 */
export function usageFromSnapshot(snapshot: unknown): TokenUsage | null {
  const requests = (snapshot as { views?: Map<string, { requests?: Array<{ usage?: RawUsage }> }> }).views?.get('trajectory')?.requests
  if (!Array.isArray(requests) || requests.length === 0) return null
  const acc = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
  let found = false
  for (const request of requests) {
    const usage = request.usage
    if (!usage || typeof usage !== 'object') continue
    const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens } = usage
    if (typeof inputTokens === 'number' && Number.isFinite(inputTokens)) { acc.input += inputTokens; found = true }
    if (typeof outputTokens === 'number' && Number.isFinite(outputTokens)) { acc.output += outputTokens; found = true }
    if (typeof cacheReadTokens === 'number' && Number.isFinite(cacheReadTokens)) { acc.cacheRead += cacheReadTokens; found = true }
    if (typeof cacheWriteTokens === 'number' && Number.isFinite(cacheWriteTokens)) { acc.cacheWrite += cacheWriteTokens; found = true }
    if (typeof reasoningTokens === 'number' && Number.isFinite(reasoningTokens)) { acc.reasoning += reasoningTokens; found = true }
  }
  return found ? acc : null
}

/** 计入计费的输入 token = 未命中输入 + 缓存写入（缓存读取按命中价单算）。
 * @param usage - aggregated token usage, or a partial/nullable view of it.
 * @returns billable input tokens: uncached input plus cache writes.
 */
export function billedInput(usage: Partial<TokenUsage> | null | undefined): number {
  return (usage?.input ?? 0) + (usage?.cacheWrite ?? 0)
}

/** 缓存命中率（缓存读取 / 全部输入），无输入返回 null。
 * @param usage - aggregated token usage, or a partial/nullable view of it.
 * @returns cache hit rate as a rounded percentage, or null when there is no input to measure.
 */
export function cacheHitRate(usage: Partial<TokenUsage> | null | undefined): number | null {
  const denom = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0)
  return denom === 0 ? null : Math.round((usage?.cacheRead ?? 0) / denom * 100)
}

/** 预估价格（¥），费率 ¥/百万 token。
 * @param usage - aggregated token usage; null yields zero cost.
 * @param rates - billing rates in ¥ per million tokens; defaults to the current ledger rates.
 * @returns the estimated cost in yuan.
 */
export function estimateCost(usage: Partial<TokenUsage> | null, rates: LedgerRates = ledger.rates): number {
  if (!usage) return 0
  const uncached = billedInput(usage) / 1e6
  const cacheReadM = (usage.cacheRead ?? 0) / 1e6
  const outM = (usage.output ?? 0) / 1e6
  return uncached * rates.miss + cacheReadM * rates.hit + outM * rates.output
}

/* ---------------- 峰谷 / 封顶检测 ---------------- */

/**
 * 追加一次成本采样，返回新历史（最多保留 200 点）。
 * @param history - the existing cost history to append to.
 * @param cost - the cost of the current sample, in yuan.
 * @returns the new history with the sample appended, capped at 200 points.
 */
export function pushCostSample(history: CostSample[], cost: number): CostSample[] {
  const next = [...history, { t: Date.now(), cost }]
  return next.length > 200 ? next.slice(next.length - 200) : next
}

/**
 * 峰谷判定：与近 10 分钟平均增速相比。
 * @param history - the cost history to analyze.
 * @returns {'peak'|'valley'|'normal'}
 */
export function detectTrend(history: CostSample[]): 'peak' | 'valley' | 'normal' {
  if (history.length < 3) return 'normal'
  const prev = history[history.length - 2]
  const latest = history[history.length - 1]
  if (prev === undefined || latest === undefined) return 'normal'
  const delta = latest.cost - prev.cost
  const now = Date.now()
  const recent = history.filter(entry => now - entry.t < 10 * 60 * 1000)
  let avg = 0
  for (let index = 1; index < recent.length; index += 1) {
    const cur = recent[index]
    const before = recent[index - 1]
    if (cur !== undefined && before !== undefined) avg += cur.cost - before.cost
  }
  avg = recent.length > 1 ? avg / (recent.length - 1) : 0
  if (delta > Math.max(avg * 2.5, 0.5)) return 'peak'
  if (avg > 0 && delta < avg * 0.25) return 'valley'
  return 'normal'
}

/** 是否超过预算封顶。
 * @param cost - the accumulated session cost in yuan.
 * @param budget - the budget cap in yuan.
 * @returns true when the cost has reached the budget cap.
 */
export function overBudget(cost: number, budget: number): boolean {
  return cost >= budget
}

/** 把大数字格式化成可读字符串（12,345）。
 * @param value - the token count to format.
 * @returns the number formatted with thousands separators, e.g. "12,345".
 */
export function formatTokens(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}
