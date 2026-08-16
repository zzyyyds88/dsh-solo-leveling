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

  const cardHtml = renderToStaticMarkup(React.createElement(settingsCard.Component, settingsCard.business))
  assert.match(cardHtml, /DeepSeek 桌宠/)
  assert.match(cardHtml, /任务完成提醒/)
  assert.match(cardHtml, /提问/)
  assert.match(cardHtml, /保存/)

  for (const cleanup of cleanups.reverse()) cleanup()
  delete globalThis.window
  delete globalThis.document
})
