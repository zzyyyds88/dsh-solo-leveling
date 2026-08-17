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
  const pet = registrations.find(entry => entry.options.name === 'shell.overlay')
  const petCard = registrations.find(entry => entry.options.name === 'settings.plugin.item' && entry.options.id === 'deepseek-pet')
  const ledgerCard = registrations.find(entry => entry.options.name === 'settings.plugin.item' && entry.options.id === 'deepseek-pet-ledger')
  assert.ok(pet, 'shell.overlay 桌宠未注册')
  assert.ok(petCard, 'settings.plugin.item「DeepSeek 桌宠」卡片未注册')
  assert.ok(ledgerCard, 'settings.plugin.item「账房面板」卡片未注册')
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

  // 卡片一：DeepSeek 桌宠 —— 仅桌宠开关（下拉框），无声音控制、无账房字段
  const petCardHtml = renderToStaticMarkup(React.createElement(petCard.Component, { ...petCard.business, defaultOpen: true }))
  assert.match(petCardHtml, /<li[^>]*dshp-card/)
  assert.match(petCardHtml, /dshp-head/)
  assert.match(petCardHtml, /DeepSeek 桌宠/)
  assert.match(petCardHtml, /dshp-description/)
  assert.match(petCardHtml, /dshp-chevron/)
  assert.match(petCardHtml, /桌宠开关/)
  assert.match(petCardHtml, /<select/)          // 下拉框（用户要求下拉窗，非可选框）
  assert.doesNotMatch(petCardHtml, /role="switch"/)
  assert.match(petCardHtml, />开启</)
  assert.match(petCardHtml, />关闭</)
  assert.match(petCardHtml, /dshp-save/)
  assert.match(petCardHtml, />保存</)
  assert.match(petCardHtml, />放弃</)
  // 声音/音效控制已移到三击诊断面板，设置卡片不再重复
  assert.doesNotMatch(petCardHtml, /任务完成提醒/)
  assert.doesNotMatch(petCardHtml, /启用声音/)
  assert.doesNotMatch(petCardHtml, /总音量/)
  assert.doesNotMatch(petCardHtml, /账房面板/)

  // 卡片二：账房面板 —— 独立开关（下拉框）+ 预算封顶 + 费率四项
  const ledgerCardHtml = renderToStaticMarkup(React.createElement(ledgerCard.Component, { ...ledgerCard.business, defaultOpen: true }))
  assert.match(ledgerCardHtml, /<li[^>]*dshp-card/)
  assert.match(ledgerCardHtml, /账房面板/)
  assert.match(ledgerCardHtml, /账房面板开关/)
  assert.match(ledgerCardHtml, /<select/)       // 独立开关也是下拉框
  assert.doesNotMatch(ledgerCardHtml, /role="switch"/)
  assert.match(ledgerCardHtml, /预算封顶/)
  assert.match(ledgerCardHtml, /费率/)
  assert.match(ledgerCardHtml, /输入未命中/)
  assert.match(ledgerCardHtml, /缓存命中/)
  assert.match(ledgerCardHtml, /缓存写入/)
  assert.match(ledgerCardHtml, /输出/)
  // 官方 ValueField 版式：每个字段 label 行 → control 独占行
  assert.match(ledgerCardHtml, /dshp-control/)
  assert.doesNotMatch(ledgerCardHtml, /rateGrid/)
  assert.doesNotMatch(ledgerCardHtml, /桌宠开关/) // 已拆分到独立卡片

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

test('账房开关关闭时桌宠不显示账房信息', async () => {
  const storage = new Map([
    ['deepseek-pet:app', JSON.stringify({ enabled: true })],
    ['deepseek-pet:ledger', JSON.stringify({ enabled: false, budget: 30, rates: { miss: 2, hit: 0.5, write: 2, output: 8 } })],
  ])
  let moduleRecord
  globalThis.window = {
    __ModuleLoader__: { load(record) { moduleRecord = record } },
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

  await import(`../../lib/client.js?ledger-off=${Date.now()}`)
  const plugin = moduleRecord.factory((specifier) => {
    if (specifier === 'react') return ReactModule
    if (specifier === 'react/jsx-runtime') return JsxRuntime
    throw new Error(`unexpected client external: ${specifier}`)
  })
  const registrations = []
  const ctx = {
    effect(callback) { const cleanup = callback(); return () => cleanup?.() },
    sessions: { binding() { return undefined }, open() {} },
    slots: {
      inject(name, callback) { return callback() },
      register(options, Component) {
        registrations.push({ options, Component, business: options.inject?.() ?? {} })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  const pet = registrations.find(entry => entry.options.name === 'shell.overlay')
  const listSnapshot = { current: 'focus', ids: [], byId: {} }
  const html = renderToStaticMarkup(React.createElement(pet.Component, {
    useSessions: selector => selector(listSnapshot),
    ...pet.business,
  }))
  assert.match(html, /DeepSeek 任务状态助手/) // 桌宠本体仍在
  assert.doesNotMatch(html, /dsh-live2d-ledger/) // 账房面板不渲染
  assert.doesNotMatch(html, /账房/) // 工具条账房按钮也不渲染
  delete globalThis.window
  delete globalThis.document
})
