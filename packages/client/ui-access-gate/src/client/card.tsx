/**
 * The access-gate card component: the login password (optional) plus the HTTPS
 * certificate mode (auto self-signed / uploaded own cert), with a restart
 * confirmation dialog. Self-contained card chrome (inline styles + theme
 * variables) styled after the official plugin card; the card is a separate
 * package, so it does not import ui-settings-plugins' internal PluginCard.
 */

import { useEffect, useState } from 'react'
import type { AccessGateCardProps } from './index.ts'

/** Minimum password length, kept in sync with the host plugin. */
const MIN_PASSWORD_LENGTH = 6

/**
 * Render the access-gate card.
 * @param props - locale copy, the card snapshot, and its save action.
 * @returns the card, or nothing when the namespace is unavailable.
 */
export function AccessGateCard(props: AccessGateCardProps) {
  const { t } = props
  const state = props.useAccessGateCard(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [certMode, setCertMode] = useState<'auto' | 'custom'>('auto')
  const [certDraft, setCertDraft] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<'ok' | 'err'>('ok')
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [restartHelp, setRestartHelp] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const disabled = !state.available || !state.writable
  const storedCertMode = state.available ? state.certMode : 'auto'
  const storedCustomConfigured = state.available ? state.customConfigured : false
  // Drafts follow the stored values; typing wins until a store update lands.
  useEffect(() => { setCertMode(storedCertMode) }, [storedCertMode])
  // The stored password is secret and never surfaced; any typed password
  // counts as an unsaved draft. PEM content is never projected back either.
  const dirty = state.available
    && (password.length > 0 || confirm.length > 0
      || certMode !== storedCertMode
      || (certMode === 'custom' && (certDraft.length > 0 || keyDraft.length > 0)))
  /** Read one uploaded file as trimmed text into the given draft setter. */
  const readFileInto = (event: { target: { files?: FileList | null } }, set: (text: string) => void): void => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      set(text.trim())
    }
    reader.readAsText(file)
  }
  if (!state.available) return null
  /** 重启后提示：systemd 自动重启说明 + 可复制给 AI 的配置提示词。 */
  const buildRestartHelp = (): string => {
    const cmd = 'node /usr/bin/dsh web'
    return [
      t('restartHelpIntro'),
      '',
      '【请为我的 DeepSeek Harness（DSH）配置 systemd 自动重启】',
      '- 服务名：dsh-web',
      `- 启动命令：${cmd}`,
      '- 要求：进程退出（包括被 kill）后自动重启（Restart=always）、开机自启',
      '- DSH_HOME：$HOME/.dsh',
      '请生成 /etc/systemd/system/dsh-web.service 单元文件，并给出 systemctl enable --now 命令。',
    ].join('\n')
  }
  const save = async (): Promise<void> => {
    if (password.length > 0) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setKind('err')
        setMessage(t('tooShort'))
        return
      }
      if (password !== confirm) {
        setKind('err')
        setMessage(t('mismatch'))
        return
      }
    }
    if (certMode === 'custom' && !storedCustomConfigured && (certDraft.length === 0 || keyDraft.length === 0)) {
      setKind('err')
      setMessage(t('certMissing'))
      return
    }
    setSaving(true)
    const ok = await props.save({
      password,
      certMode,
      customCert: certDraft,
      customKey: keyDraft,
    })
    setSaving(false)
    if (ok) {
      setKind('ok')
      setMessage(password.length > 0 ? t('savedWithPassword') : t('saved'))
      setPassword('')
      setConfirm('')
      setCertDraft('')
      setKeyDraft('')
      if (certMode === 'custom' && (certDraft.length > 0 || keyDraft.length > 0)) {
        // 新上传了自有证书：提示重启生效
        setKind('ok')
        setMessage(password.length > 0 ? `${t('savedWithPassword')} ${t('certRestartHint')}` : `${t('saved')} ${t('certRestartHint')}`)
      }
    } else {
      setKind('err')
      setMessage(t('saveFailed'))
    }
  }
  const restart = (): void => { setDialogOpen(true) }
  const cancelRestart = (): void => { setDialogOpen(false) }
  const confirmRestart = async (): Promise<void> => {
    setDialogOpen(false)
    setRestarting(true)
    try {
      const res = await fetch('/access-gate/restart', { method: 'POST' })
      if (res.ok) {
        setKind('ok')
        setMessage(t('restartSent'))
        setRestartHelp(buildRestartHelp())
      } else {
        setKind('err')
        setMessage(t('restartFailed'))
        setRestartHelp('')
      }
    } catch {
      setKind('err')
      setMessage(t('restartFailed'))
      setRestartHelp('')
    }
    setRestarting(false)
  }
  const discard = (): void => {
    setCertMode(storedCertMode)
    setCertDraft('')
    setKeyDraft('')
    setPassword('')
    setConfirm('')
    setMessage('')
    setRestartHelp('')
    setDialogOpen(false)
  }
  const cardStyle = { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: '10px', overflow: 'hidden' } as const
  const headerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 16px', width: '100%', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' } as const
  const titleStyle = { fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary)' } as const
  const descStyle = { fontSize: '12px', lineHeight: '1.6', margin: '2px 0 0', color: 'var(--dsw-alias-label-tertiary)' } as const
  const pendingStyle = { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: '5px', padding: '1px 6px', whiteSpace: 'nowrap' } as const
  const bodyStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-module-platform)', padding: '12px 16px 14px' } as const
  const sectionStyle = { padding: '6px 0 4px', display: 'flex', flexDirection: 'column', gap: '4px' } as const
  const sectionTitleStyle = { fontSize: '12px', fontWeight: 600, margin: '8px 0 0', color: 'var(--dsw-alias-label-secondary)' } as const
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 0' } as const
  const labelStyle = { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } as const
  const inputStyle = { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', height: '34px', font: 'inherit', color: 'var(--dsw-alias-label-primary)', borderRadius: '8px', padding: '0 12px', fontSize: '13px', lineHeight: '1.5', width: '100%', boxSizing: 'border-box' } as const
  const hintStyle = { color: 'var(--dsw-alias-label-tertiary)', margin: 0, fontSize: '12px', lineHeight: '1.6' } as const
  const buttonStyle = { border: 0, borderRadius: '8px', background: 'var(--dsw-alias-brand-primary)', color: '#fff', height: '32px', padding: '0 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as const
  const ghostButtonStyle = { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px', background: 'transparent', color: 'var(--dsw-alias-label-primary)', height: '32px', padding: '0 18px', fontSize: '13px', cursor: 'pointer' } as const
  const dangerButtonStyle = { border: '1px solid var(--dsw-alias-label-error, #f87171)', borderRadius: '8px', background: 'transparent', color: 'var(--dsw-alias-label-error, #f87171)', height: '32px', padding: '0 18px', fontSize: '13px', cursor: 'pointer' } as const
  const messageStyle = { margin: '10px 0 0', fontSize: '12px', lineHeight: '1.6', color: kind === 'ok' ? 'var(--dsw-alias-label-success, #4ade80)' : 'var(--dsw-alias-label-error)' } as const
  const readOnlyStyle = { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', margin: '8px 0 0' } as const
  const restartHelpStyle = { margin: '10px 0 0', padding: '10px 12px', background: 'var(--dsw-alias-bg-layer-1)', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: '8px', fontSize: '12px', lineHeight: '1.7', color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as const
  const overlayStyle = { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' } as const
  const dialogStyle = { background: 'var(--dsw-alias-bg-layer-3)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', padding: '18px 20px', maxWidth: '580px', width: '100%', maxHeight: '82vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' } as const
  const dialogTitleStyle = { fontSize: '15px', fontWeight: 600, margin: '0 0 6px', color: 'var(--dsw-alias-label-primary)' } as const
  const dialogTodoStyle = { fontSize: '12px', fontWeight: 600, margin: '12px 0 0', color: 'var(--dsw-alias-label-secondary)' } as const
  const messageLines = message.split('\n')
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
            <div style={sectionStyle}>
              <p style={sectionTitleStyle}>{t('passwordSection')}</p>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('passwordLabel')}</label>
                <input type="password" value={password} disabled={disabled} style={inputStyle} placeholder={t('passwordPlaceholder')} autoComplete="new-password" onChange={(event) =>{  setPassword(event.target.value) }} />
                <p style={hintStyle}>{t('passwordHint')}</p>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>{t('confirmLabel')}</label>
                <input type="password" value={confirm} disabled={disabled} style={inputStyle} placeholder={t('confirmPlaceholder')} autoComplete="new-password" onChange={(event) =>{  setConfirm(event.target.value) }} />
                <p style={hintStyle}>{t('confirmHint')}</p>
              </div>
            </div>
            <div style={sectionStyle}>
              <p style={sectionTitleStyle}>{t('certSection')}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 0', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer' }}>
                  <input type="radio" name="access-gate-cert-mode" checked={certMode === 'auto'} disabled={disabled} style={{ accentColor: 'var(--dsw-alias-brand-primary)' }} onChange={() =>{  setCertMode('auto') }} />
                  {t('certModeAuto')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer' }}>
                  <input type="radio" name="access-gate-cert-mode" checked={certMode === 'custom'} disabled={disabled} style={{ accentColor: 'var(--dsw-alias-brand-primary)' }} onChange={() =>{  setCertMode('custom') }} />
                  {t('certModeCustom')}
                </label>
              </div>
              <p style={hintStyle}>{t('certModeHint')}</p>
              {certMode === 'custom'
                ? (
                  <>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>{t('certFileLabel')}</label>
                      <input type="file" accept=".crt,.cer,.pem,text/plain" disabled={disabled} style={inputStyle} onChange={(event) =>{  readFileInto(event, setCertDraft) }} />
                      {storedCustomConfigured && certDraft.length === 0
                        ? <p style={hintStyle}>{t('customConfigured')}</p>
                        : <p style={hintStyle}>{t('certFileHint')}</p>}
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>{t('keyFileLabel')}</label>
                      <input type="file" accept=".key,.pem,text/plain" disabled={disabled} style={inputStyle} onChange={(event) =>{  readFileInto(event, setKeyDraft) }} />
                      <p style={hintStyle}>{t('keyFileHint')}</p>
                    </div>
                  </>
                )
                : null}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { void save() }} disabled={disabled || saving} style={buttonStyle}>{t('saveLabel')}</button>
              <button type="button" onClick={discard} disabled={disabled || saving || !dirty} style={ghostButtonStyle}>{t('discard')}</button>
              <button type="button" onClick={restart} disabled={disabled || saving || restarting} style={dangerButtonStyle}>{t('restart')}</button>
            </div>
            {message === ''
              ? null
              : (
                <p role="status" style={messageStyle}>
                  {messageLines.map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < messageLines.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </p>
              )}
            {restartHelp === '' ? null : <pre style={restartHelpStyle}>{restartHelp}</pre>}
          </div>
        )
        : null}
      {dialogOpen
        ? (
          <div style={overlayStyle} onClick={cancelRestart}>
            <div role="dialog" aria-modal="true" style={dialogStyle} onClick={(event) => { event.stopPropagation() }}>
              <h3 style={dialogTitleStyle}>{t('restartDialogTitle')}</h3>
              <p style={hintStyle}>{t('restartConfirm')}</p>
              <p style={dialogTodoStyle}>{t('restartDialogTodo')}</p>
              <pre style={restartHelpStyle}>{buildRestartHelp()}</pre>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px' }}>
                <button type="button" onClick={cancelRestart} style={ghostButtonStyle}>{t('restartCancel')}</button>
                <button type="button" onClick={() => { void confirmRestart() }} style={dangerButtonStyle}>{t('restartConfirmLabel')}</button>
              </div>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
