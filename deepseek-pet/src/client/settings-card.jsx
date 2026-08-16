import { useCallback, useEffect, useState } from 'react'
import { ALERT_LABELS, applySoundSettings, soundSettingsSnapshot } from './sound.js'

/**
 * 桌宠设置卡片 —— 挂载到「设置 → 插件 → 插件配置」区（settings.plugin.item）。
 *
 * 遵循开发规范 §2.5：可展开头部（标题+描述+未保存标记）、字段区（开关+音量）、
 * 保存/放弃按钮。deepseek-pet 是纯前端插件（无 host 半、无 settings 命名空间），
 * 卡片直接读写 localStorage（deepseek-pet:sound），不引入后端依赖。
 */

const CARD_ID = 'deepseek-pet'

/** 卡片样式（对齐官方「网页搜索」卡片观感，走 dsw 别名变量）。 */
const CARD_CSS = `
.dshp-card{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dshp-card[data-open=false] .dshp-body{display:none}
.dshp-head{width:100%;display:flex;align-items:center;gap:8px;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshp-head b{font-weight:600}
.dshp-head small{color:var(--dsw-alias-label-tertiary);font-size:12px}
.dshp-dirty{color:var(--dsw-alias-state-warn-primary);font-size:11px;margin-left:auto}
.dshp-chev{color:var(--dsw-alias-label-tertiary);transition:transform .18s ease}
.dshp-card[data-open=true] .dshp-chev{transform:rotate(90deg)}
.dshp-body{margin-top:10px;display:grid;gap:8px}
.dshp-field{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.dshp-field>label{display:flex;align-items:center;gap:8px;cursor:pointer}
.dshp-field input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dshp-field small{color:var(--dsw-alias-label-tertiary);font-size:11px;display:block;margin-left:22px}
.dshp-field input[type=range]{width:120px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dshp-actions{display:flex;gap:8px;margin-top:4px}
.dshp-actions button{padding:4px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dshp-actions button:hover{border-color:var(--dsw-alias-brand-primary)}
.dshp-actions button[data-primary]{background:var(--dsw-alias-button-primary-fill);color:#fff;border-color:transparent}
.dshp-hint{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dshp-hint b{color:var(--dsw-alias-label-secondary)}
`

function installCardCss() {
  const tagId = 'deepseek-pet-settings/styles'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'deepseek-pet'
  tag.dataset.pluginCss = tagId
  tag.textContent = CARD_CSS
  document.head.append(tag)
  return () => tag.remove()
}

/** 设置卡片组件。props 由槽位注册注入（hooks 为空——直接读 localStorage）。 */
export function DeepSeekPetSettingsCard() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => soundSettingsSnapshot())
  const [stored, setStored] = useState(() => soundSettingsSnapshot())
  const [message, setMessage] = useState('')

  // 外部变化（诊断面板改开关）同步进 stored 与 draft
  useEffect(() => {
    const sync = () => {
      const next = soundSettingsSnapshot()
      setStored(next)
      setDraft(next)
    }
    window.addEventListener('storage', sync)
    window.addEventListener('deepseek-pet:sound-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('deepseek-pet:sound-changed', sync)
    }
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const toggleAlert = useCallback((key) => {
    setDraft(prev => ({ ...prev, alerts: { ...prev.alerts, [key]: !(prev.alerts[key] !== false) } }))
  }, [])
  const setTotal = useCallback((value) => {
    setDraft(prev => ({ ...prev, total: Number(value) / 100 }))
  }, [])
  const toggleMuted = useCallback(() => {
    setDraft(prev => ({ ...prev, muted: !prev.muted }))
  }, [])

  const save = useCallback(() => {
    applySoundSettings(draft)
    setStored(soundSettingsSnapshot())
    window.dispatchEvent(new Event('deepseek-pet:sound-changed'))
    setMessage('已保存')
    window.setTimeout(() => setMessage(''), 1600)
  }, [draft])

  const discard = useCallback(() => {
    setDraft(soundSettingsSnapshot())
    setMessage('')
  }, [])

  const alerts = draft.alerts ?? ALERT_LABELS

  return (
    <div className="dshp-card" data-open={open ? 'true' : 'false'} data-plugin-card={CARD_ID}>
      <button type="button" className="dshp-head" onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <b>🐋 DeepSeek 桌宠</b>
        <small>音效与语音提醒设置</small>
        {dirty && <span className="dshp-dirty">● 未保存</span>}
        <span className="dshp-chev" aria-hidden="true">▶</span>
      </button>
      <div className="dshp-body">
        <div className="dshp-field">
          <label><input type="checkbox" checked={alerts.celebrate !== false} onChange={() => toggleAlert('celebrate')} />任务完成提醒</label>
          <small className="dshp-hint">完成琶音 + 语音 + 纸屑</small>
        </div>
        <div className="dshp-field">
          <label><input type="checkbox" checked={alerts.error !== false} onChange={() => toggleAlert('error')} />出错安慰</label>
          <small className="dshp-hint">出错低音 + 安慰语音</small>
        </div>
        <div className="dshp-field">
          <label><input type="checkbox" checked={alerts.prompt !== false} onChange={() => toggleAlert('prompt')} />提问 / 审批提示</label>
          <small className="dshp-hint">反问 / 等批准时提示音 + 语音</small>
        </div>
        <div className="dshp-field">
          <label><input type="checkbox" checked={alerts.poke !== false} onChange={() => toggleAlert('poke')} />戳一戳音效</label>
          <small className="dshp-hint">单击桌宠的音效 + 语音</small>
        </div>
        <div className="dshp-field">
          <label><input type="checkbox" checked={alerts.headpat !== false} onChange={() => toggleAlert('headpat')} />摸头音效</label>
          <small className="dshp-hint">长按摸头的庆祝琶音 + 语音</small>
        </div>
        <div className="dshp-field">
          <label><input type="checkbox" checked={!draft.muted} onChange={toggleMuted} />启用声音</label>
          <small className="dshp-hint">总静音开关（与双击桌宠联动）</small>
        </div>
        <div className="dshp-field">
          <label>总音量 <input type="range" min="0" max="100" value={Math.round((draft.total ?? 1) * 100)} onChange={event => setTotal(event.target.value)} /></label>
          <small className="dshp-hint">{Math.round((draft.total ?? 1) * 100)}%</small>
        </div>
        <div className="dshp-actions">
          <button type="button" data-primary="true" onClick={save} disabled={!dirty}>保存</button>
          <button type="button" onClick={discard} disabled={!dirty}>放弃</button>
          {message && <span className="dshp-hint"><b>{message}</b></span>}
        </div>
      </div>
    </div>
  )
}

/** 注册设置卡片到「设置 → 插件 → 插件配置」。 */
export function registerSettingsCard(ctx) {
  ctx.effect(installCardCss, 'deepseek-pet: settings card styles')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: CARD_ID,
    order: 40,
    label: 'DeepSeek 桌宠',
    inject: () => ({ hooks: {} }),
  }, DeepSeekPetSettingsCard))
}
