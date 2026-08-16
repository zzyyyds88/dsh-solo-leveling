import { useCallback, useEffect, useState } from 'react'
import { ALERT_LABELS, applySoundSettings, soundSettingsSnapshot } from './sound.js'
import { applyAppSettings, appSettingsSnapshot } from './app-settings.js'
import { applyLedgerSettings, ledgerSettingsSnapshot } from './ledger.js'

/**
 * 桌宠设置卡片 —— 挂载到「设置 → 插件 → 插件配置」区（settings.plugin.item）。
 *
 * 样式严格对齐官方插件卡片（PluginCard：li 圆角卡片 → 头部按钮（名称+描述+
 * 未保存药丸+箭头）→ 字段区 → 底部 放弃/保存），开关控件采用官方
 * role="switch" 轨道/滑块模式。deepseek-pet 是纯前端插件（无 host 半、
 * 无 settings 命名空间），卡片直接读写 localStorage（deepseek-pet:sound +
 * deepseek-pet:app），不引入后端依赖。
 */

const CARD_ID = 'deepseek-pet'

/** 卡片样式：逐条复制官方 PluginCard / fields / trajectory switch 的样式值。 */
const CARD_CSS = `
.dshp-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dshp-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dshp-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dshp-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dshp-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshp-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dshp-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dshp-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshp-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dshp-chevronOpen{transform:rotate(180deg)}
.dshp-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshp-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.dshp-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.dshp-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.dshp-discard,.dshp-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dshp-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.dshp-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dshp-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dshp-discard:disabled,.dshp-save:disabled{opacity:.4;cursor:default}
.dshp-discard:focus-visible,.dshp-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshp-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}
.dshp-field+.dshp-field{border-top:1px solid var(--dsw-alias-border-l2)}
.dshp-head{align-items:center;gap:8px;display:flex}
.dshp-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.dshp-badges{align-items:center;gap:8px;display:inline-flex}
.dshp-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshp-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dshp-range{width:100%;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;margin:2px 0}
.dshp-switch{appearance:none;background:0 0;border:0;padding:0;cursor:pointer;font:inherit;color:inherit;display:inline-flex}
.dshp-switchTrack{background:var(--dsw-alias-border-l2);width:20px;height:10px;transition:background-color .12s var(--ds-ease-in-out);border-radius:5px;flex:none;display:inline-block;position:relative}
.dshp-switchThumb{background:var(--dsw-alias-bg-layer-1);width:6px;height:6px;transition:transform .12s var(--ds-ease-in-out);border-radius:50%;position:absolute;top:2px;left:2px}
.dshp-switchTrack[data-on=true]{background:var(--dsw-alias-state-business-primary)}
.dshp-switchTrack[data-on=true] .dshp-switchThumb{transform:translate(10px)}
.dshp-switch:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dshp-number{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:96px}
.dshp-number:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dshp-rateGrid{grid-template-columns:1fr 1fr;gap:0 14px;display:grid}
.dshp-rateItem{flex-direction:column;gap:4px;min-width:0;display:flex}
.dshp-rateLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;white-space:nowrap}

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

/** 官方 role="switch" 轨道/滑块开关（同 trajectory 工具栏样式）。 */
function PetSwitch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className="dshp-switch" onClick={() => onChange(!checked)}>
      <span className="dshp-switchTrack" data-on={checked || undefined} aria-hidden="true">
        <span className="dshp-switchThumb" />
      </span>
    </button>
  )
}

/** 一条字段：head（标签 + 右侧控件）+ 提示。开关/滑块统一走这个版式。 */
function PetField({ label, hint, children }) {
  return (
    <div className="dshp-field">
      <div className="dshp-head">
        <span className="dshp-label">{label}</span>
        {children}
      </div>
      {hint && <p className="dshp-hint">{hint}</p>}
    </div>
  )
}

/** 设置卡片组件。props 由槽位注册注入（hooks 为空——直接读 localStorage）。 */
export function DeepSeekPetSettingsCard({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState(() => combinedSnapshot())
  const [stored, setStored] = useState(() => combinedSnapshot())
  const [message, setMessage] = useState('')

  // 外部变化（诊断面板改开关 / 其它标签页）同步进 stored 与 draft
  useEffect(() => {
    const sync = () => {
      const next = combinedSnapshot()
      setStored(next)
      setDraft(next)
    }
    window.addEventListener('storage', sync)
    window.addEventListener('deepseek-pet:sound-changed', sync)
    window.addEventListener('deepseek-pet:app-changed', sync)
    window.addEventListener('deepseek-pet:ledger-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('deepseek-pet:sound-changed', sync)
      window.removeEventListener('deepseek-pet:app-changed', sync)
      window.removeEventListener('deepseek-pet:ledger-changed', sync)
    }
  }, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const setEnabled = useCallback(value => {
    setDraft(prev => ({ ...prev, enabled: value === true }))
  }, [])
  const toggleAlert = useCallback(key => {
    setDraft(prev => ({ ...prev, alerts: { ...prev.alerts, [key]: !(prev.alerts[key] !== false) } }))
  }, [])
  const setMuted = useCallback(value => {
    setDraft(prev => ({ ...prev, muted: value === true }))
  }, [])
  const setTotal = useCallback(value => {
    setDraft(prev => ({ ...prev, total: Number(value) / 100 }))
  }, [])
  const setLedgerEnabled = useCallback(value => {
    setDraft(prev => ({ ...prev, ledger: { ...prev.ledger, enabled: value === true } }))
  }, [])
  const setLedgerBudget = useCallback(value => {
    const parsed = Number(value)
    setDraft(prev => ({ ...prev, ledger: { ...prev.ledger, budget: Number.isFinite(parsed) && parsed >= 0 ? parsed : prev.ledger.budget } }))
  }, [])
  const setLedgerRate = useCallback((key, value) => {
    const parsed = Number(value)
    setDraft(prev => ({ ...prev, ledger: { ...prev.ledger, rates: { ...prev.ledger.rates, [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : prev.ledger.rates[key] } } }))
  }, [])

  const save = useCallback(() => {
    applyAppSettings({ enabled: draft.enabled })
    applySoundSettings(draft)
    applyLedgerSettings(draft.ledger)
    setStored(combinedSnapshot())
    window.dispatchEvent(new Event('deepseek-pet:sound-changed'))
    window.dispatchEvent(new Event('deepseek-pet:app-changed'))
    window.dispatchEvent(new Event('deepseek-pet:ledger-changed'))
    setMessage('已保存')
    window.setTimeout(() => setMessage(''), 1600)
  }, [draft])

  const discard = useCallback(() => {
    setDraft(combinedSnapshot())
    setMessage('')
  }, [])

  const alerts = draft.alerts ?? ALERT_LABELS
  const totalPercent = Math.round((draft.total ?? 1) * 100)

  return (
    <li className={`dshp-card${open ? ' dshp-cardOpen' : ''}`} data-plugin-card={CARD_ID}>
      <button type="button" className="dshp-head" onClick={() => setOpen(current => !current)}
        aria-expanded={open} aria-label={`${open ? '收起' : '展开'}: DeepSeek 桌宠`}>
        <span className="dshp-headText">
          <span className="dshp-name">DeepSeek 桌宠</span>
          <span className="dshp-description">显示、音效与语音提醒设置</span>
        </span>
        {dirty && <span className="dshp-pending">未保存</span>}
        <svg className={`dshp-chevron${open ? ' dshp-chevronOpen' : ''}`} width="14" height="14"
          viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="currentColor" d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" />
        </svg>
      </button>
      {open && (
        <div className="dshp-body">
          <PetField label="桌宠开关" hint="关闭后桌宠不再显示，也不再发声">
            <PetSwitch checked={draft.enabled !== false} onChange={setEnabled} label="桌宠开关" />
          </PetField>
          <PetField label="启用声音" hint="总静音开关（工具条按钮切换）">
            <PetSwitch checked={draft.muted !== true} onChange={value => setMuted(!value)} label="启用声音" />
          </PetField>
          {Object.entries(ALERT_LABELS).map(([key, label]) => (
            <PetField key={key} label={label}>
              <PetSwitch checked={alerts[key] !== false} onChange={() => toggleAlert(key)} label={label} />
            </PetField>
          ))}
          <PetField label="总音量" hint={`${totalPercent}%`}>
            <span className="dshp-badge">{totalPercent}%</span>
          </PetField>
          <div className="dshp-field">
            <input className="dshp-range" type="range" min="0" max="100" value={totalPercent}
              onChange={event => setTotal(event.target.value)} aria-label="总音量" />
          </div>
          <PetField label="账房面板" hint="吉祥物旁实时显示 token 用量 / 缓存命中率 / 预估价格 / 预算，峰谷与封顶提醒">
            <PetSwitch checked={draft.ledger?.enabled !== false} onChange={setLedgerEnabled} label="账房面板" />
          </PetField>
          <PetField label="预算封顶（元）" hint="本会话预估花费达到该值后提醒">
            <input className="dshp-number" type="number" min="0" step="1" value={draft.ledger?.budget ?? 30}
              onChange={event => setLedgerBudget(event.target.value)} aria-label="预算封顶" />
          </PetField>
          <PetField label="费率（¥ / 百万 token）" hint="按 deepseek-chat 官方价估算，可自行覆盖">
            <span className="dshp-badge">deepseek-chat</span>
          </PetField>
          <div className="dshp-field">
            <div className="dshp-rateGrid">
              {[['miss', '输入未命中'], ['hit', '缓存命中'], ['write', '缓存写入'], ['output', '输出']].map(([key, label]) => (
                <label key={key} className="dshp-rateItem">
                  <span className="dshp-rateLabel">{label}</span>
                  <input className="dshp-number" type="number" min="0" step="0.1" value={draft.ledger?.rates?.[key] ?? 0}
                    onChange={event => setLedgerRate(key, event.target.value)} aria-label={label} />
                </label>
              ))}
            </div>
          </div>
          {message && <p className="dshp-failed">{message}</p>}
          <div className="dshp-footer">
            <button type="button" className="dshp-discard" disabled={!dirty} onClick={discard}>放弃</button>
            <button type="button" className="dshp-save" disabled={!dirty} onClick={save}>保存</button>
          </div>
        </div>
      )}
    </li>
  )
}

/** 卡片草稿 = 应用设置（桌宠开关）+ 音效设置 + 账房设置 合并快照。 */
function combinedSnapshot() {
  return { ...appSettingsSnapshot(), ...soundSettingsSnapshot(), ledger: ledgerSettingsSnapshot() }
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
