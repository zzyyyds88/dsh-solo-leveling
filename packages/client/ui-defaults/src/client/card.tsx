/**
 * The defaults card component: default working directory + default retry
 * count. Self-contained card chrome (inline styles + theme variables) styled
 * after the official plugin card; the card is a separate package, so it does
 * not import ui-settings-plugins' internal PluginCard.
 */

import { useEffect, useState } from 'react'
import type { DefaultsCardProps } from './index.ts'

/**
 * Render the defaults card.
 * @param props - locale copy, the card snapshot, and its save action.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function DefaultsCard(props: DefaultsCardProps) {
  const { t } = props
  const state = props.useDefaultsCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [dirDraft, setDirDraft] = useState('')
  const [retryDraft, setRetryDraft] = useState('10')
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<'ok' | 'err'>('ok')
  const [saving, setSaving] = useState(false)
  const disabled = !state.available || !state.writable
  const storedDir = state.available ? state.defaultWorkingDirectory : undefined
  const storedRetry = state.available ? state.defaultRetryCount : undefined
  // Drafts follow the stored values; typing wins until a store update lands.
  useEffect(() => {
    if (storedDir !== undefined) setDirDraft(storedDir)
  }, [storedDir])
  useEffect(() => {
    if (storedRetry !== undefined) setRetryDraft(String(storedRetry))
  }, [storedRetry])
  const dirty = state.available
    && (dirDraft.trim() !== state.defaultWorkingDirectory
      || retryDraft.trim() !== String(state.defaultRetryCount))
  if (!state.available) return null
  const save = async (): Promise<void> => {
    const dir = dirDraft.trim()
    const retry = Number.parseInt(retryDraft.trim(), 10)
    if (!Number.isInteger(retry) || retry < 0) {
      setKind('err')
      setMessage(t('retryInvalid'))
      return
    }
    setSaving(true)
    const ok = await props.save({ defaultWorkingDirectory: dir, defaultRetryCount: retry })
    setSaving(false)
    if (ok) {
      setKind('ok')
      setMessage(t('saved'))
    } else {
      setKind('err')
      setMessage(t('saveFailed'))
    }
  }
  const discard = (): void => {
    if (storedDir !== undefined) setDirDraft(storedDir)
    if (storedRetry !== undefined) setRetryDraft(String(storedRetry))
    setMessage('')
  }
  const cardStyle = { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '10px', overflow: 'hidden' }
  const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', width: '100%', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' } as const
  const titleStyle = { fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary)' } as const
  const descStyle = { fontSize: '12px', lineHeight: '1.6', margin: '2px 0 0', color: 'var(--dsw-alias-label-tertiary)' } as const
  const pendingStyle = { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: '5px', padding: '1px 6px', whiteSpace: 'nowrap' } as const
  const bodyStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-module-platform)', padding: '10px 14px 12px' } as const
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' } as const
  const labelStyle = { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } as const
  const inputStyle = { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', height: '34px', font: 'inherit', color: 'var(--dsw-alias-label-primary)', borderRadius: '8px', padding: '0 12px', fontSize: '13px', lineHeight: '1.5', width: '100%', boxSizing: 'border-box' } as const
  const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', margin: 0, fontSize: '12px', lineHeight: '1.6' } as const
  const buttonStyle = { border: 0, borderRadius: '8px', background: 'var(--dsw-alias-brand-primary)', color: '#fff', height: '32px', padding: '0 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as const
  const ghostButtonStyle = { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', height: '32px', padding: '0 18px', fontSize: '13px', cursor: 'pointer' } as const
  const messageStyle = { margin: '10px 0 0', fontSize: '12px', lineHeight: '1.6', color: kind === 'ok' ? 'var(--dsw-alias-label-success, #4ade80)' : 'var(--dsw-alias-label-error)' } as const
  const readOnlyStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', margin: '8px 0 0' } as const
  return (
    <li style={cardStyle}>
      <button type="button" style={headerStyle} aria-expanded={open} onClick={() => { setOpen(!open) }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' }}>
          <h3 style={titleStyle}>{t('title')}</h3>
          <p style={descStyle}>{t('description')}</p>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }}>
          {dirty ? <span style={pendingStyle}>{t('unsaved')}</span> : null}
          <span style={{ color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' }}>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open
        ? (
          <div style={bodyStyle}>
            {!state.writable ? <p role="status" style={readOnlyStyle}>{t('readOnly')}</p> : null}
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('dirLabel')}</label>
              <input type="text" value={dirDraft} disabled={disabled} style={inputStyle} placeholder={t('dirPlaceholder')} onChange={(event) =>{  setDirDraft(event.target.value) }} />
              <p style={hintStyle}>{t('dirHint')}</p>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>{t('retryLabel')}</label>
              <input type="number" inputMode="numeric" min={0} step={1} value={retryDraft} disabled={disabled} style={inputStyle} onChange={(event) => { setRetryDraft(event.target.value) }} />
              <p style={hintStyle}>{t('retryHint')}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button type="button" onClick={() => { void save() }} disabled={disabled || saving} style={buttonStyle}>{t('saveLabel')}</button>
              <button type="button" onClick={discard} disabled={disabled || saving || !dirty} style={ghostButtonStyle}>{t('discard')}</button>
            </div>
            {message === '' ? null : <p role="status" style={messageStyle}>{message}</p>}
          </div>
        )
        : null}
    </li>
  )
}
