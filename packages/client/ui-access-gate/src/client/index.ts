/**
 * dsh-client-ui-access-gate — 访问门禁设置卡片（浏览器半）。
 *
 * 在「设置 → 插件 → 插件配置」区注册一张卡片，绑定 `access-gate` 设置
 * 命名空间（由 `dsh-host-access-gate` 宿主插件注册、`dsh-host-apiproxy`
 * 动态暴露）。字段：访问口令（可留空不修改）+ 证书方式（auto 自签 /
 * custom 上传自有证书）。保存口令后 host 轮换 HMAC key，旧会话立即失效；
 * 自有证书保存后写入 `$DSH_HOME/https/custom.{crt,key}`，重启后生效。
 * @module @deepseek-ai/dsh-client-ui-access-gate
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { AccessGateCard } from './card.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-client-ui-access-gate':
      | 'title' | 'description'
      | 'passwordSection' | 'passwordLabel' | 'passwordPlaceholder' | 'passwordHint'
      | 'confirmLabel' | 'confirmPlaceholder' | 'confirmHint'
      | 'certSection' | 'certModeLabel' | 'certModeAuto' | 'certModeCustom' | 'certModeHint'
      | 'certFileLabel' | 'keyFileLabel' | 'certFileHint' | 'keyFileHint' | 'customConfigured'
      | 'certMissing' | 'certRestartHint'
      | 'saveLabel' | 'discard' | 'restart'
      | 'restartConfirm' | 'restartDialogTitle' | 'restartDialogTodo'
      | 'restartCancel' | 'restartConfirmLabel'
      | 'restartSent' | 'restartHelpIntro' | 'restartFailed'
      | 'unsaved' | 'readOnly'
      | 'tooShort' | 'mismatch' | 'saved' | 'savedWithPassword' | 'saveFailed'
  }
}

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'dsh-client-ui-access-gate'

/** The `access-gate` fields this card edits. */
interface AccessGateSettings {
  password?: string
  certMode?: 'auto' | 'custom'
  customCert?: string
  customKey?: string
}

/** What the card renders, projected from the bound scope. */
export interface AccessGateCardState {
  /** Whether the namespace resolved and the card should render. */
  available: boolean
  /** Whether the Host accepts writes; false disables the controls. */
  writable: boolean
  /** Certificate mode: `auto` = pure-JS self-signed, `custom` = uploaded cert. */
  certMode: 'auto' | 'custom'
  /** Whether a custom cert/key pair is stored (PEM content itself is never surfaced). */
  customConfigured: boolean
}

/** The registration-side face the card's slot entry injects. */
export interface AccessGateCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as `useAccessGateCard`. */
    accessGateCard: SnapshotStore<AccessGateCardState>
  }
  /** Write the editable fields; resolves true only when the store confirms them. */
  save: (fields: {
    password: string
    certMode: 'auto' | 'custom'
    customCert: string
    customKey: string
  }) => Promise<boolean>
}

/** Props the renderer binds for the access-gate card. */
export type AccessGateCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<typeof NS>
  & InjectFace<AccessGateCardFace>

/** Bridges the `access-gate` scope onto the card's snapshot store. */
export class AccessGateCardController {
  private readonly store: SnapshotStore<AccessGateCardState>
  private readonly unsub: () => void

  /**
   * @param scope - the bound settings scope for the `access-gate` namespace.
   */
  constructor(private readonly scope: SettingsScope<AccessGateSettings>) {
    this.store = createSnapshotStore<AccessGateCardState>(this.projection())
    this.unsub = scope.subscribe(() => { this.store.set(this.projection()) })
  }

  private projection(): AccessGateCardState {
    const snapshot = this.scope.getSnapshot()
    const ready = snapshot.status === 'ready'
    const value = snapshot.value
    return {
      available: ready,
      writable: snapshot.writable,
      certMode: ready && value !== undefined && value.certMode === 'custom' ? 'custom' : 'auto',
      customConfigured: ready && value !== undefined
        && typeof value.customCert === 'string' && value.customCert.length > 0
        && typeof value.customKey === 'string' && value.customKey.length > 0,
    }
  }

  /**
   * Write the editable fields. `password` may be empty to leave the current
   * password untouched; `customCert`/`customKey` are only written in `custom`
   * mode with non-empty PEM drafts (existing stored cert is kept otherwise).
   * Resolves true only when the store confirms the fields landed.
   * @param fields - the editable card fields to write.
   * @returns whether the store confirmed every applicable field landed.
   */
  async save(fields: {
    password: string
    certMode: 'auto' | 'custom'
    customCert: string
    customKey: string
  }): Promise<boolean> {
    try {
      if (fields.password.length > 0) await this.scope.set('password', fields.password)
      await this.scope.set('certMode', fields.certMode)
      if (fields.certMode === 'custom') {
        if (fields.customCert.length > 0) await this.scope.set('customCert', fields.customCert)
        if (fields.customKey.length > 0) await this.scope.set('customKey', fields.customKey)
      }
    } catch {
      return false
    }
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    const modeLanded = snapshot.status === 'ready'
      && value !== undefined
      && value.certMode === fields.certMode
    if (!modeLanded) return false
    if (fields.certMode !== 'custom') return true
    // custom mode: confirm the newly uploaded PEMs landed (or the existing pair is still stored).
    const certLanded = typeof value.customCert === 'string'
      && (fields.customCert.length === 0 || value.customCert === fields.customCert)
    const keyLanded = typeof value.customKey === 'string'
      && (fields.customKey.length === 0 || value.customKey === fields.customKey)
    return certLanded && keyLanded
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's injected face.
   */
  inject(): AccessGateCardFace {
    return {
      hooks: { accessGateCard: this.store },
      save: fields => this.save(fields),
    }
  }

  /** Detach the scope subscription. */
  dispose(): void {
    this.unsub()
  }
}

const zh = {
  title: '访问门禁',
  description: '配置 Web 界面登录口令与 HTTPS 证书。默认 HTTPS（自动自签证书）开箱即用，监听 0.0.0.0，局域网内浏览器访问 https://<主机IP>:3080 即可；设置口令后旧会话失效。',
  passwordSection: '访问口令',
  passwordLabel: '新访问口令（至少 6 位，留空 = 不修改）',
  passwordPlaceholder: '输入新口令',
  passwordHint: '留空则保持当前口令；设置新口令保存后旧会话全部失效，需重新登录。',
  confirmLabel: '确认新访问口令',
  confirmPlaceholder: '再次输入新口令',
  confirmHint: '两次输入需保持一致。',
  certSection: 'HTTPS 证书',
  certModeLabel: '证书方式',
  certModeAuto: '自动生成（自签）',
  certModeCustom: '使用自有证书',
  certModeHint: '自动生成：程序用纯代码生成自签证书（免安装、免命令）。使用自有证书：上传你申请/购买的证书与私钥（SAN 需覆盖你的访问地址）。',
  certFileLabel: '证书文件（.crt / .pem）',
  keyFileLabel: '私钥文件（.key / .pem）',
  certFileHint: 'PEM 格式证书，选择文件后自动填入。',
  keyFileHint: '与证书匹配的未加密 PEM 私钥，选择文件后自动填入。',
  customConfigured: '已配置自有证书（重启后生效）',
  certMissing: '选择「使用自有证书」时，需上传证书与私钥文件。',
  certRestartHint: '自有证书在保存后写入磁盘，需要「重启」dsh 后由服务端加载生效。',
  saveLabel: '保存',
  discard: '放弃',
  restart: '重启',
  restartConfirm: '将立即退出 dsh（不做重启编排），由系统按各自配置拉起；确定继续？',
  restartDialogTitle: '重启确认',
  restartDialogTodo: '重启后需要做的事（把下面整段复制给你的 AI 助手即可）',
  restartCancel: '取消',
  restartConfirmLabel: '确认重启',
  restartSent: '已发出重启请求：dsh 正在退出，系统拉起后生效。',
  restartHelpIntro: '提示：本实例已退出，需要有人把它重新拉起来。推荐配置 systemd 自动重启（进程退出自动拉起 + 开机自启）；或将下面整段复制给你的 AI 助手，让它代为配置：',
  restartFailed: '重启请求失败：可能未登录或权限不足。',
  unsaved: '未保存',
  readOnly: '当前设置不可写。',
  tooShort: '口令至少需要 6 位。',
  mismatch: '两次输入的口令不一致。',
  saved: '已保存：口令与证书方式已更新。',
  savedWithPassword: '已保存：口令已更新，旧会话已失效，请重新登录；证书方式已同步更新。',
  saveFailed: '保存失败：可能已被其它修改覆盖或权限不足，请重试。',
}

const en = {
  title: 'Access Gate',
  description: 'Configure the web GUI login password and the HTTPS certificate. HTTPS is on by default (auto self-signed cert) listening on 0.0.0.0 — visit https://<host-ip>:3080 from the LAN. A saved password invalidates all sessions.',
  passwordSection: 'Access password',
  passwordLabel: 'New access password (6+ chars, leave empty to keep)',
  passwordPlaceholder: 'Enter new password',
  passwordHint: 'Leave empty to keep the current password; setting a new one invalidates all existing sessions.',
  confirmLabel: 'Confirm new access password',
  confirmPlaceholder: 'Enter it again',
  confirmHint: 'Both entries must match.',
  certSection: 'HTTPS certificate',
  certModeLabel: 'Certificate mode',
  certModeAuto: 'Auto-generated (self-signed)',
  certModeCustom: 'Use own certificate',
  certModeHint: 'Auto: the program generates a self-signed certificate in pure code (no tools, no commands). Own certificate: upload your certificate and key (the SAN must cover your access address).',
  certFileLabel: 'Certificate file (.crt / .pem)',
  keyFileLabel: 'Private key file (.key / .pem)',
  certFileHint: 'PEM certificate; picked up automatically when you select a file.',
  keyFileHint: 'Unencrypted PEM private key matching the certificate; picked up automatically when you select a file.',
  customConfigured: 'Own certificate configured (applies after restart)',
  certMissing: 'When using your own certificate, both the certificate and the key files are required.',
  certRestartHint: 'An uploaded certificate is written to disk on save and loaded by the server after Restart.',
  saveLabel: 'Save',
  discard: 'Discard',
  restart: 'Restart',
  restartConfirm: 'This exits dsh immediately (no restart orchestration); the system brings dsh back up per its own setup. Continue?',
  restartDialogTitle: 'Restart confirmation',
  restartDialogTodo: 'What to do after restart (copy the whole block to your AI assistant)',
  restartCancel: 'Cancel',
  restartConfirmLabel: 'Restart now',
  restartSent: 'Restart requested: dsh is exiting; the system will bring it back up.',
  restartHelpIntro: 'Note: this instance has exited and needs to be brought back up. Recommended: configure a systemd service with automatic restart (Restart=always + enable), or copy the whole block below to your AI assistant to configure it for you:',
  restartFailed: 'Restart request failed: maybe not signed in or not permitted.',
  unsaved: 'Unsaved',
  readOnly: 'Settings are not writable.',
  tooShort: 'The password needs at least 6 characters.',
  mismatch: 'The two entries do not match.',
  saved: 'Saved: the password and certificate mode are updated.',
  savedWithPassword: 'Saved: password changed and all old sessions are invalid — please sign in again; the certificate mode is updated too.',
  saveFailed: 'Save failed: possibly overwritten concurrently or not permitted. Retry.',
}

/**
 * Mount the card into the Plugins settings section's 插件配置 area.
 * @param ctx - the browser plugin context.
 */
export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<AccessGateSettings>({ namespace: 'access-gate' })
  const controller = new AccessGateCardController(scope)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-access-gate: card dictionaries')
  ctx.effect(() => () => { controller.dispose() }, 'ui-access-gate: card scope')
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: 'access-gate',
      locale: NS,
      inject: () => controller.inject(),
    }, AccessGateCard)
  })
}
