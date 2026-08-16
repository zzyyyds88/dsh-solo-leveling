import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as ReactModule from 'react'
import * as JsxRuntime from 'react/jsx-runtime'

test('declares an installable dsh bundle for the web profile', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const patch = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')

  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  assert.ok(manifest.files.includes('docs/deepseek-pet-preview.png'))
  assert.match(patch, /id: deepseek-pet/)
  assert.match(patch, /name: deepseek-pet/)
})

test('built dsh.client bundle registers an embedded shell overlay', async () => {
  let moduleRecord
  let registered
  const styles = []
  const cleanups = []

  globalThis.window = {
    __ModuleLoader__: {
      load(record) { moduleRecord = record },
    },
  }
  globalThis.document = {
    querySelector() { return null },
    createElement() {
      return { dataset: {}, textContent: '', remove() {} }
    },
    head: { append(style) { styles.push(style) } },
  }

  await import(`../../lib/client.js?test=${Date.now()}`)
  assert.equal(moduleRecord.id, 'deepseek-pet')

  const plugin = moduleRecord.factory((specifier) => {
    if (specifier === 'react') return ReactModule
    if (specifier === 'react/jsx-runtime') return JsxRuntime
    throw new Error(`unexpected client external: ${specifier}`)
  })

  const registrations = []
  const ctx = {
    effect(callback) {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => cleanup?.()
    },
    sessions: { binding() { return undefined }, open() {} },
    slots: {
      inject(name, callback) {
        assert.ok(['shell.overlay', 'settings.plugin.item'].includes(name), `unexpected slot: ${name}`)
        return callback()
      },
      register(options, Component) {
        registrations.push({ options, Component, business: options.inject?.() ?? {} })
        return () => {}
      },
    },
  }

  plugin.apply(ctx)
  const pet = registrations.find(entry => entry.options.id === 'deepseek-pet')
  const settingsCard = registrations.find(entry => entry.options.name === 'settings.plugin.item')
  assert.ok(pet, 'shell.overlay 桌宠未注册')
  assert.ok(settingsCard, 'settings.plugin.item 设置卡片未注册')
  assert.equal(styles.length, 2)

  const listSnapshot = {
    current: 'focus',
    ids: ['focus', 'one', 'two', 'three', 'four'],
    byId: {
      focus: { id: 'focus', displayTitle: '当前任务', running: false, updatedAt: 5 },
      one: { id: 'one', displayTitle: '任务一', running: true, updatedAt: 4 },
      two: { id: 'two', displayTitle: '任务二', running: true, updatedAt: 3 },
      three: { id: 'three', displayTitle: '任务三', running: true, updatedAt: 2 },
      four: { id: 'four', displayTitle: '任务四', running: true, updatedAt: 1 },
    },
  }
  const sessionSnapshot = {
    openState: 'open', running: false, runningCalls: [], partial: null, queue: [], nodes: [],
    pending: [{ kind: 'question', key: 'question-1', payload: { questions: [{ id: 'choice', question: '请选择下一步' }] } }],
    views: {
      get(target) {
        if (target !== 'trajectory') return undefined
        return {
          requests: [
            { usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 } },
          ],
        }
      },
    },
  }
  ctx.sessions.binding = () => ({
    session: {
      subscribe() { return () => {} },
      getSnapshot() { return sessionSnapshot },
      projections: { faceOf() { return undefined } },
    },
  })
  const html = renderToStaticMarkup(React.createElement(pet.Component, {
    useSessions: selector => selector(listSnapshot),
    ...pet.business,
  }))
  assert.match(html, /DeepSeek 任务状态助手/)
  assert.match(html, /data-current="true"/)
  assert.doesNotMatch(html, /查看上下文/)
  assert.match(html, /最小化 Pet/)
  assert.doesNotMatch(html, /查看今日消耗/)
  assert.match(html, /data-stacked="true"/)
  assert.doesNotMatch(html, /聚焦会话/)
  assert.doesNotMatch(html, /dsh-live2d-rig|dsh-live2d-part/)
  assert.match(html, /等待你的回答/)
  assert.doesNotMatch(html, /dsh-live2d-pending|<fieldset|请选择下一步|>提交</)
  // 账房面板默认显示（数据来自轨迹视图 usage）
  assert.match(html, /dsh-live2d-ledger/)
  assert.match(html, /账房 · 实时/)
  assert.match(html, /缓存命中率/)
  assert.match(html, /预算剩/)
  assert.match(html, /状态/)
  assert.match(html, /1,800/) // 1000+200+100 输入相关 + 500 输出 = 1800 总 token

  const cardHtml = renderToStaticMarkup(React.createElement(settingsCard.Component, { ...settingsCard.business, defaultOpen: true }))
  // 官方 PluginCard 版式：li 卡片 → 头部按钮（名称+描述+箭头）→ 底部 放弃/保存
  assert.match(cardHtml, /<li[^>]*dshp-card/)
  assert.match(cardHtml, /dshp-head/)
  assert.match(cardHtml, /DeepSeek 桌宠/)
  assert.match(cardHtml, /dshp-description/)
  assert.match(cardHtml, /dshp-chevron/)
  assert.match(cardHtml, /role="switch"/)
  assert.match(cardHtml, /桌宠开关/)
  assert.match(cardHtml, /任务完成提醒/)
  assert.match(cardHtml, /提问/)
  assert.match(cardHtml, /dshp-save/)
  assert.match(cardHtml, />保存</)
  assert.match(cardHtml, />放弃</)
  // 账房字段：面板开关 / 预算封顶 / 费率
  assert.match(cardHtml, /账房面板/)
  assert.match(cardHtml, /预算封顶/)
  assert.match(cardHtml, /费率/)
  assert.match(cardHtml, /输入未命中/)
  assert.match(cardHtml, /缓存命中/)
  assert.match(cardHtml, /缓存写入/)
  assert.match(cardHtml, /输出/)
  // 官方 ValueField 版式：每个字段 label 行 → control 独占行
  const fieldCount = (cardHtml.match(/class="dshp-field"/g) ?? []).length
  assert.ok(fieldCount >= 12, `字段数不足: ${fieldCount}`)
  assert.match(cardHtml, /dshp-control/)
  assert.doesNotMatch(cardHtml, /rateGrid/)

  for (const cleanup of cleanups.reverse()) cleanup()
  delete globalThis.window
  delete globalThis.document
})

test('桌宠开关关闭时组件不渲染', async () => {
  const storage = new Map([['deepseek-pet:app', JSON.stringify({ enabled: false })]])
  let moduleRecord
  globalThis.window = {
    __ModuleLoader__: {
      load(record) { moduleRecord = record },
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null },
      setItem(key, value) { storage.set(key, String(value)) },
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  }
  globalThis.document = {
    querySelector() { return null },
    createElement() { return { dataset: {}, textContent: '', remove() {} } },
    head: { append() {} },
  }

  await import(`../../lib/client.js?disabled=${Date.now()}`)
  const plugin = moduleRecord.factory((specifier) => {
    if (specifier === 'react') return ReactModule
    if (specifier === 'react/jsx-runtime') return JsxRuntime
    throw new Error(`unexpected client external: ${specifier}`)
  })
  const registrations = []
  const ctx = {
    effect(callback) { const cleanup = callback(); return () => cleanup?.() },
    sessions: {
      binding() { return undefined },
      open() {},
    },
    slots: {
      inject(name, callback) { return callback() },
      register(options, Component) {
        registrations.push({ options, Component, business: options.inject?.() ?? {} })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  const pet = registrations.find(entry => entry.options.id === 'deepseek-pet')
  const listSnapshot = { current: 'focus', ids: [], byId: {} }
  const html = renderToStaticMarkup(React.createElement(pet.Component, {
    useSessions: selector => selector(listSnapshot),
    ...pet.business,
  }))
  assert.equal(html, '')
  delete globalThis.window
  delete globalThis.document
})
