import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { LedgerSettings, LedgerRates } from './ledger.ts'
import { applyAppSettings, appSettingsSnapshot } from './app-settings.ts'
import { applyLedgerSettings, ledgerSettingsSnapshot } from './ledger.ts'

/**
 * 桌宠设置卡片 —— 挂载到「设置 → 插件 → 插件配置」区（settings.plugin.item）。
 *
 * 按需求拆成两张**一级**卡片（不再把声音/账房塞进同一张卡片）：
 *   1. 「DeepSeek 桌宠」—— 仅桌宠开关（下拉框，开启/关闭）。
 *   2. 「账房面板」—— 账房开关（下拉框）+ 预算封顶 + 费率四项。
 * 声音 / 各类音效提醒 / 总音量 控制在**三击桌宠后的诊断面板**里，设置页不再重复。
 *
 * 样式严格对齐官方插件卡片（PluginCard：li 圆角卡片 → 头部按钮（名称+描述+
 * 未保存药丸+箭头）→ 字段区 → 底部 放弃/保存）；开关控件改为 <select> 下拉框
 * （用户要求「下拉窗形式」，不再用 role="switch" 可选框）。deepseek-pet 是纯前端
 * 插件（无 host 半、无 settings 命名空间），卡片直接读写 localStorage
 * （deepseek-pet:app + deepseek-pet:ledger），不引入后端依赖。
 */

const CARD_ID = 'deepseek-pet'
const LEDGER_CARD_ID = 'deepseek-pet-ledger'

/** 卡片样式：逐条复制官方 PluginCard / fields 的样式值，另加下拉框样式。 */
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
.dshp-control{display:flex;align-items:center}
.dshp-badges{align-items:center;gap:8px;display:inline-flex}
.dshp-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshp-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.dshp-number{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%}
.dshp-number:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dshp-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;width:100%;cursor:pointer}
.dshp-select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}
.dshp-message{min-width:0;color:var(--dsw-alias-state-success-primary);flex:1;margin:0;font-size:12px;line-height:1.5}

`

function installCardCss() {
  const tagId = 'deepseek-pet-settings/styles'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'deepseek-pet'
  tag.dataset.pluginCss = tagId
  tag.textContent = CARD_CSS
  document.head.append(tag)
  return () =>{  tag.remove() }
}

/** 开启/关闭下拉框（用户要求「下拉窗形式」，不用可选框）。 */
function PetSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <select className="dshp-select" value={value} onChange={(event) =>{  onChange(event.target.value) }} aria-label={label}>
      <option value="on">开启</option>
      <option value="off">关闭</option>
    </select>
  )
}

/**
 * 官方 ValueField 版式：head 行（label + badges）→ 控件独占一行 → hint。
 * 与官方 BashCard/WebSearchCard 字段形态一致（fields.module.css）。
 */
function PetField({ label, hint, control, badge }: { label: string; hint?: string; control?: ReactNode; badge?: string }) {
  return (
    <div className="dshp-field">
      <div className="dshp-head">
        <span className="dshp-label">{label}</span>
        {badge && <span className="dshp-badge">{badge}</span>}
      </div>
      {control && <div className="dshp-control">{control}</div>}
      {hint && <p className="dshp-hint">{hint}</p>}
    </div>
  )
}

/** 通用卡片外壳：头部（名称+描述+未保存药丸+箭头）→ 字段区 → 底部 放弃/保存。 */
function CardShell({ cardId, name, description, open, setOpen, dirty, message, save, discard, children }: {
  cardId: string
  name: string
  description: string
  open: boolean
  setOpen: (updater: (current: boolean) => boolean) => void
  dirty: boolean
  message: string
  save: () => void
  discard: () => void
  children: ReactNode
}) {
  return (
    <li className={`dshp-card${open ? ' dshp-cardOpen' : ''}`} data-plugin-card={cardId}>
      <button type="button" className="dshp-head" onClick={() =>{  setOpen(current => !current) }}
        aria-expanded={open} aria-label={`${open ? '收起' : '展开'}: ${name}`}>
        <span className="dshp-headText">
          <span className="dshp-name">{name}</span>
          <span className="dshp-description">{description}</span>
        </span>
        {dirty && <span className="dshp-pending">未保存</span>}
        <svg className={`dshp-chevron${open ? ' dshp-chevronOpen' : ''}`} width="14" height="14"
          viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="currentColor" d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" />
        </svg>
      </button>
      {open && (
        <div className="dshp-body">
          {children}
          <div className="dshp-footer">
            {message && <p className="dshp-message">{message}</p>}
            <button type="button" className="dshp-discard" disabled={!dirty} onClick={discard}>放弃</button>
            <button type="button" className="dshp-save" disabled={!dirty} onClick={save}>保存</button>
          </div>
        </div>
      )}
    </li>
  )
}

/** 卡片一：DeepSeek 桌宠 —— 仅桌宠开关（下拉框）。props 由槽位注册注入。 */
export function DeepSeekPetSettingsCard() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => appSettingsSnapshot())
  const [stored, setStored] = useState(() => appSettingsSnapshot())
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => {
      const next = appSettingsSnapshot()
      setStored(next)
      setDraft(next)
    }
    window.addEventListener('storage', sync)
    window.addEventListener('deepseek-pet:app-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('deepseek-pet:app-changed', sync)
    }
  }, [])

  const dirty = draft.enabled !== stored.enabled

  const save = useCallback(() => {
    applyAppSettings({ enabled: draft.enabled })
    setStored(appSettingsSnapshot())
    setMessage('已保存')
    window.setTimeout(() =>{  setMessage('') }, 1600)
  }, [draft])

  const discard = useCallback(() => {
    setDraft(appSettingsSnapshot())
    setMessage('')
  }, [])

  return (
    <CardShell cardId={CARD_ID} name="DeepSeek 桌宠" description="桌宠显示开关"
      open={open} setOpen={setOpen} dirty={dirty} message={message} save={save} discard={discard}>
      <PetField label="桌宠开关" hint="关闭后桌宠不再显示，也不再发声"
        control={<PetSelect value={draft.enabled ? 'on' : 'off'} onChange={(value) =>{  setDraft({ enabled: value === 'on' }) }} label="桌宠开关" />} />
    </CardShell>
  )
}

/** 卡片二：账房面板 —— 独立开关（下拉框）+ 预算封顶 + 费率四项。 */
export function LedgerSettingsCard() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => ledgerDraftFromSnapshot(ledgerSettingsSnapshot()))
  const [stored, setStored] = useState(() => ledgerSettingsSnapshot())
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => {
      const next = ledgerSettingsSnapshot()
      setStored(next)
      setDraft(ledgerDraftFromSnapshot(next))
    }
    window.addEventListener('storage', sync)
    window.addEventListener('deepseek-pet:ledger-changed', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('deepseek-pet:ledger-changed', sync)
    }
  }, [])

  const dirty = JSON.stringify(ledgerStoredOf(draft)) !== JSON.stringify(stored)

  const setEnabled = useCallback((value: string) => {
    setDraft(prev => ({ ...prev, enabled: value === 'on' }))
  }, [])
  const setBudget = useCallback((value: string) => {
    // 数字输入以字符串暂存草稿（允许 "0." 等中间态），保存时再解析
    setDraft(prev => ({ ...prev, budgetText: value }))
  }, [])
  const setRate = useCallback((key: string, value: string) => {
    setDraft(prev => ({ ...prev, rateText: { ...prev.rateText, [key]: value } }))
  }, [])

  const save = useCallback(() => {
    applyLedgerSettings(ledgerStoredOf(draft))
    setStored(ledgerSettingsSnapshot())
    setMessage('已保存')
    window.setTimeout(() =>{  setMessage('') }, 1600)
  }, [draft])

  const discard = useCallback(() => {
    setDraft(ledgerDraftFromSnapshot(ledgerSettingsSnapshot()))
    setMessage('')
  }, [])

  const budgetText = draft.budgetText
  const rateTextOf = (key: string): string => draft.rateText[key] ?? '0'

  return (
    <CardShell cardId={LEDGER_CARD_ID} name="账房面板" description="吉祥物旁实时显示 token 用量 / 缓存命中率 / 预估价格 / 预算"
      open={open} setOpen={setOpen} dirty={dirty} message={message} save={save} discard={discard}>
      <PetField label="账房面板开关" hint="关闭后桌宠旁不再显示账房信息（token / 花费 / 预算）"
        control={<PetSelect value={draft.enabled ? 'on' : 'off'} onChange={setEnabled} label="账房面板开关" />} />
      <PetField label="预算封顶（元）" hint="本会话预估花费达到该值后提醒"
        control={<input className="dshp-number" type="number" min="0" step="1" value={budgetText}
          onChange={(event) =>{  setBudget(event.target.value) }} aria-label="预算封顶" />} />
      <PetField label="费率（¥ / 百万 token）" badge="deepseek-chat" hint="按 deepseek-chat 官方价估算，可自行覆盖" />
      {([['miss', '输入未命中'], ['hit', '缓存命中'], ['write', '缓存写入'], ['output', '输出']] as const).map(([key, label]) => (
        <PetField key={key} label={label}
          control={<input className="dshp-number" type="number" min="0" step="0.1" value={rateTextOf(key)}
            onChange={(event) =>{  setRate(key, event.target.value) }} aria-label={label} />} />
      ))}
    </CardShell>
  )
}

/** 账房草稿视图：数字字段以字符串暂存（允许 "0." 等中间态输入）。 */
function ledgerDraftFromSnapshot(snapshot: LedgerSettings): { enabled: boolean; budgetText: string; rateText: Record<string, string> } {
  const rates = snapshot.rates
  return {
    enabled:  snapshot.enabled,
    budgetText: String(snapshot.budget),
    rateText: Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, String(value)])),
  }
}

/** 账房草稿归一化：字符串暂存解析回数值，供 dirty 比较与保存。非法输入回退原值。 */
function ledgerStoredOf(
  draft: { enabled: boolean; budgetText: string; rateText: Record<string, string> },
): { enabled: boolean; budget: number; rates: LedgerRates } {
  const parsedBudget = Number(draft.budgetText)
  const rates: Partial<LedgerRates> = {}
  for (const [key, text] of Object.entries(draft.rateText)) {
    const parsed = Number(text)
    if (Number.isFinite(parsed) && parsed >= 0) (rates as Record<string, number>)[key] = parsed
  }
  return {
    enabled:  draft.enabled,
    budget: Number.isFinite(parsedBudget) && parsedBudget >= 0 ? parsedBudget : 30,
    rates: rates as LedgerRates,
  }
}

/** 注册两张设置卡片到「设置 → 插件 → 插件配置」（一级并列）。 */
export function registerSettingsCards(ctx: Context): void {
  ctx.effect(installCardCss, 'deepseek-pet: settings card styles')
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: CARD_ID,
    inject: () => ({ hooks: {} }),
  }, DeepSeekPetSettingsCard))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: LEDGER_CARD_ID,
    inject: () => ({ hooks: {} }),
  }, LedgerSettingsCard))
}
