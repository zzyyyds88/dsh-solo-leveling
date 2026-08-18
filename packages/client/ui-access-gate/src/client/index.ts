/**
 * dsh-client-ui-access-gate — 访问门禁设置卡片（浏览器半）。
 *
 * 在「设置 → 插件 → 插件配置」区注册一张卡片，绑定 `access-gate` 设置
 * 命名空间（由 `dsh-host-access-gate` 宿主插件注册、`dsh-host-apiproxy`
 * 动态暴露）。字段：访问口令（可留空不修改）+ 反向代理参数 lanHost /
 * httpsPort。保存口令后 host 轮换 HMAC key，旧会话立即失效。
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
      | 'proxySection' | 'proxyToggleLabel' | 'proxyToggleHint'
      | 'lanHostLabel' | 'lanHostPlaceholder' | 'lanHostHint'
      | 'httpsPortLabel' | 'httpsPortPlaceholder' | 'httpsPortHint'
      | 'accessUrlLabel' | 'restartVisit'
      | 'saveLabel' | 'discard' | 'restart'
      | 'restartConfirm' | 'restartDialogTitle' | 'restartDialogTodo'
      | 'restartCancel' | 'restartConfirmLabel'
      | 'restartSent' | 'restartHelpIntro' | 'restartFailed'
      | 'unsaved' | 'readOnly'
      | 'tooShort' | 'mismatch' | 'saved' | 'savedWithPassword' | 'saveFailed'
      | 'hostEmpty' | 'portInvalid' | 'portInUse'
  }
}

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'dsh-client-ui-access-gate'

/** The `access-gate` fields this card edits. */
interface AccessGateSettings {
  password?: string
  proxyEnabled?: boolean
  lanHost?: string
  httpsPort?: string
}

/** What the card renders, projected from the bound scope. */
export interface AccessGateCardState {
  /** Whether the namespace resolved and the card should render. */
  available: boolean
  /** Whether the Host accepts writes; false disables the controls. */
  writable: boolean
  proxyEnabled: boolean
  lanHost: string
  httpsPort: string
}

/** The registration-side face the card's slot entry injects. */
export interface AccessGateCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as `useAccessGateCard`. */
    accessGateCard: SnapshotStore<AccessGateCardState>
  }
  /** Write the editable fields; resolves true only when the store confirms them. */
  save: (fields: { password: string; proxyEnabled: boolean; lanHost: string; httpsPort: string }) => Promise<boolean>
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
      proxyEnabled: ready && value !== undefined && value.proxyEnabled === true,
      lanHost: ready && value !== undefined ? (value.lanHost ?? '') : '',
      httpsPort: ready && value !== undefined ? (value.httpsPort ?? '') : '',
    }
  }

  /**
   * Write the editable fields. `password` may be empty to leave the current
   * password untouched. Resolves true only when the store confirms the proxy
   * fields landed.
   */
  async save(fields: { password: string; proxyEnabled: boolean; lanHost: string; httpsPort: string }): Promise<boolean> {
    try {
      if (fields.password.length > 0) await this.scope.set('password', fields.password)
      await this.scope.set('proxyEnabled', fields.proxyEnabled)
      await this.scope.set('lanHost', fields.lanHost)
      await this.scope.set('httpsPort', fields.httpsPort)
    } catch {
      return false
    }
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    return snapshot.status === 'ready'
      && value !== undefined
      && value.proxyEnabled === fields.proxyEnabled
      && value.lanHost === fields.lanHost
      && value.httpsPort === fields.httpsPort
  }

  /** Build the face the card's slot registration injects. */
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
  description: '配置 Web 界面登录口令与 HTTPS 反向代理（caddy）。口令保存后旧会话失效；填写反代参数后保存并点「重启」，dsh 与 caddy 会自动退出，由系统拉起后反代自动运行（启动命令不变）。',
  passwordSection: '访问口令',
  passwordLabel: '新访问口令（至少 6 位，留空 = 不修改）',
  passwordPlaceholder: '输入新口令',
  passwordHint: '留空则保持当前口令；设置新口令保存后旧会话全部失效，需重新登录。',
  confirmLabel: '确认新访问口令',
  confirmPlaceholder: '再次输入新口令',
  confirmHint: '两次输入需保持一致。',
  proxySection: 'HTTPS 反向代理',
  proxyToggleLabel: '启用 HTTPS 反向代理',
  proxyToggleHint: '默认关闭。开启后填写下方地址与端口，保存并点「重启」，dsh 启动时自动用内置 caddy 提供 HTTPS 反代（无需安装 caddy / 无需手动跑脚本）。',
  lanHostLabel: '局域网地址 / 域名',
  lanHostPlaceholder: '例如 192.168.1.100',
  lanHostHint: 'HTTPS 反代（caddy）绑定的地址，也是浏览器访问地址。',
  httpsPortLabel: 'HTTPS 端口',
  httpsPortPlaceholder: '例如 5700',
  httpsPortHint: 'caddy 对外 HTTPS 端口（1-65535）。改动后保存并点「重启」生效。',
  accessUrlLabel: '🔒 重启生效后请访问：',
  restartVisit: '重启生效后请访问',
  saveLabel: '保存',
  discard: '放弃',
  restart: '重启',
  restartConfirm: '将立即退出 dsh 与本实例 caddy（不做重启），由系统按各自配置拉起；确定继续？',
  restartDialogTitle: '重启确认',
  restartDialogTodo: '重启后需要做的事（把下面整段复制给你的 AI 助手即可）',
  restartCancel: '取消',
  restartConfirmLabel: '确认重启',
  restartSent: '已发出重启请求：dsh 与本实例 caddy 正在退出，系统拉起后生效。',
  restartHelpIntro: '提示：本实例已退出，需要有人把它重新拉起来。推荐配置 systemd 自动重启（进程退出自动拉起 + 开机自启）；或将下面整段复制给你的 AI 助手，让它代为配置：',
  restartFailed: '重启请求失败：可能未登录或权限不足。',
  unsaved: '未保存',
  readOnly: '当前设置不可写。',
  tooShort: '口令至少需要 6 位。',
  mismatch: '两次输入的口令不一致。',
  saved: '已保存：反代开关与参数已更新，点「重启」后生效。',
  savedWithPassword: '已保存：口令已更新，旧会话已失效，请重新登录；反代开关与参数点「重启」后生效。',
  saveFailed: '保存失败：可能已被其它修改覆盖或权限不足，请重试。',
  hostEmpty: '启用反代时「局域网地址 / 域名」不能为空。',
  portInvalid: 'HTTPS 端口必须是 1-65535 的整数。',
  portInUse: '该 HTTPS 端口已被占用（可能是其它服务或另一实例的反代），请换一个端口。',
}

const en = {
  title: 'Access Gate',
  description: 'Configure the web GUI login password and the HTTPS reverse proxy (caddy). A saved password invalidates all sessions; after filling in proxy parameters, save and press Restart — dsh and caddy exit and the system brings dsh back up with the proxy running automatically (start command unchanged).',
  passwordSection: 'Access password',
  passwordLabel: 'New access password (6+ chars, leave empty to keep)',
  passwordPlaceholder: 'Enter new password',
  passwordHint: 'Leave empty to keep the current password; setting a new one invalidates all existing sessions.',
  confirmLabel: 'Confirm new access password',
  confirmPlaceholder: 'Enter it again',
  confirmHint: 'Both entries must match.',
  proxySection: 'HTTPS reverse proxy',
  proxyToggleLabel: 'Enable HTTPS reverse proxy',
  proxyToggleHint: 'Disabled by default. Turn it on, fill in the address and port below, save and press Restart — dsh starts its embedded caddy automatically (no caddy install, no script).',
  lanHostLabel: 'LAN host / domain',
  lanHostPlaceholder: 'e.g. 192.168.1.100',
  lanHostHint: 'The address the HTTPS reverse proxy (caddy) binds and the browser visits.',
  httpsPortLabel: 'HTTPS port',
  httpsPortPlaceholder: 'e.g. 5700',
  httpsPortHint: 'The caddy external HTTPS port (1-65535). Save and press Restart after changing.',
  accessUrlLabel: '🔒 Visit after restart:',
  restartVisit: 'after restart visit',
  saveLabel: 'Save',
  discard: 'Discard',
  restart: 'Restart',
  restartConfirm: "This exits dsh and this instance's caddy immediately (no restart orchestration); the system brings dsh back up per its own setup. Continue?",
  restartDialogTitle: 'Restart confirmation',
  restartDialogTodo: 'What to do after restart (copy the whole block to your AI assistant)',
  restartCancel: 'Cancel',
  restartConfirmLabel: 'Restart now',
  restartSent: "Restart requested: dsh and this instance's caddy are exiting; the system will bring dsh back up.",
  restartHelpIntro: 'Note: this instance has exited and needs to be brought back up. Recommended: configure a systemd service with automatic restart (Restart=always + enable), or copy the whole block below to your AI assistant to configure it for you:',
  restartFailed: 'Restart request failed: maybe not signed in or not permitted.',
  unsaved: 'Unsaved',
  readOnly: 'Settings are not writable.',
  tooShort: 'The password needs at least 6 characters.',
  mismatch: 'The two entries do not match.',
  saved: 'Saved: proxy toggle and parameters updated; press Restart to apply.',
  savedWithPassword: 'Saved: password changed and all old sessions are invalid — please sign in again; proxy toggle and parameters apply after Restart.',
  saveFailed: 'Save failed: possibly overwritten concurrently or not permitted. Retry.',
  hostEmpty: 'The LAN host must not be empty when the proxy is enabled.',
  portInvalid: 'The HTTPS port must be an integer between 1 and 65535.',
  portInUse: "This HTTPS port is already in use (another service or another instance's proxy). Pick a different port.",
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
