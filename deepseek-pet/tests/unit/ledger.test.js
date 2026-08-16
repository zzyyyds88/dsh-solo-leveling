import test from 'node:test'
import assert from 'node:assert/strict'
import {
  billedInput, cacheHitRate, detectTrend, estimateCost, formatTokens,
  overBudget, pushCostSample, usageFromSnapshot,
} from '../../src/client/ledger.js'

test('usageFromSnapshot 从轨迹视图聚合累计用量', () => {
  const snapshot = {
    views: {
      get(target) {
        assert.equal(target, 'trajectory')
        return {
          requests: [
            { usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10 } },
            { usage: { inputTokens: 200, outputTokens: 80, cacheReadTokens: 40, cacheWriteTokens: 30, reasoningTokens: 5 } },
            { usage: undefined },
          ],
        }
      },
    },
  }
  const usage = usageFromSnapshot(snapshot)
  assert.deepEqual(usage, { input: 300, output: 130, cacheRead: 60, cacheWrite: 40, reasoning: 5 })
})

test('usageFromSnapshot 无轨迹视图 / 无用量时返回 null', () => {
  assert.equal(usageFromSnapshot({}), null)
  assert.equal(usageFromSnapshot({ views: { get() { return undefined } } }), null)
  assert.equal(usageFromSnapshot({ views: { get() { return { requests: [] } } } }), null)
  assert.equal(usageFromSnapshot({ views: { get() { return { requests: [{ usage: {} }] } } } }), null)
})

test('billedInput / cacheHitRate / estimateCost 计价正确', () => {
  const usage = { input: 100, output: 50, cacheRead: 20, cacheWrite: 10 }
  assert.equal(billedInput(usage), 110)
  assert.equal(cacheHitRate(usage), 15) // 20 / (100+20+10) = 15.3% → 15
  assert.equal(cacheHitRate({ input: 0, cacheRead: 0, cacheWrite: 0 }), null)
  // (100+10)/1e6*2 + 20/1e6*0.5 + 50/1e6*8
  const cost = estimateCost(usage)
  assert.ok(Math.abs(cost - (110 / 1e6 * 2 + 20 / 1e6 * 0.5 + 50 / 1e6 * 8)) < 1e-9)
})

test('estimateCost 支持自定义费率', () => {
  const usage = { input: 1_000_000, output: 500_000, cacheRead: 0, cacheWrite: 0 }
  const cost = estimateCost(usage, { miss: 4, hit: 1, write: 2, output: 16 })
  assert.ok(Math.abs(cost - (4 + 8)) < 1e-9)
})

test('overBudget / formatTokens', () => {
  assert.equal(overBudget(30, 30), true)
  assert.equal(overBudget(29.99, 30), false)
  assert.equal(formatTokens(12345), '12,345')
})

test('pushCostSample 保留上限且追加时间戳', () => {
  let history = []
  for (let index = 0; index < 210; index += 1) history = pushCostSample(history, index)
  assert.equal(history.length, 200)
  assert.equal(history[history.length - 1].cost, 209)
  assert.ok(Number.isFinite(history[0].t))
})

test('detectTrend 峰谷判定', () => {
  const minutesAgo = mins => Date.now() - mins * 60_000
  // 平缓增长（每 2 分钟 +0.1）→ normal
  const gentle = [
    { t: minutesAgo(10), cost: 1.0 },
    { t: minutesAgo(8), cost: 1.1 },
    { t: minutesAgo(6), cost: 1.2 },
    { t: minutesAgo(4), cost: 1.3 },
    { t: minutesAgo(2), cost: 1.4 },
    { t: minutesAgo(0), cost: 1.5 },
  ]
  assert.equal(detectTrend(gentle), 'normal')
  // 末尾陡增（+3.0，远超 avg*2.5 与 0.5 下限）→ peak
  const spike = [...gentle.slice(0, 5), { t: minutesAgo(0), cost: 4.5 }]
  assert.equal(detectTrend(spike), 'peak')
  // 末尾骤降（几乎不烧）→ valley
  const drop = [...gentle.slice(0, 5), { t: minutesAgo(0), cost: 1.41 }]
  assert.equal(detectTrend(drop), 'valley')
  // 历史不足 3 点 → normal
  assert.equal(detectTrend([{ t: minutesAgo(1), cost: 1 }]), 'normal')
})
