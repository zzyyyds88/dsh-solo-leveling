/**
 * dsh-client-ui-mobile-remote — 手机遥控设置卡片（浏览器半）。
 *
 * 在「设置 → 插件 → 插件配置」区注册一张「手机遥控」卡片，绑定
 * `mobile-remote` 设置命名空间（由 `dsh-host-mobile-remote` 宿主插件注册、
 * 每个请求/升级即时读取）。总开关关闭后全部 /api/mobile/* 回 404、WS 拒
 * 升级；请求体上限超限回 payload-too-large——保存立即生效，无需重启。
 * @module @deepseek-ai/dsh-client-ui-mobile-remote/client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { MobileRemoteCard } from './card.tsx'
import { CardForm, booleanField, numberField, type CardActions, type CardShell, type FieldState } from './settings-form.ts'

/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
  'settings.title': '手机遥控',
  'settings.description': 'DSH 遥控器 App 与本机 dsh 服务之间的接口开关：总开关关闭后 /api/mobile/* 全部返回 404、事件流拒绝连接。保存后立即生效，无需重启。',
  'settings.enabledLabel': '启用手机遥控',
  'settings.enabledHint': '关闭后手机 App 无法连接（登录页与既有功能不受影响）。App 通过口令登录获取会话 Cookie 后使用这些接口。',
  'settings.inherit': '继承',
  'settings.on': '开',
  'settings.off': '关',
  'settings.maxBodyLabel': '请求体上限（字节）',
  'settings.maxBodyHint': '单个请求允许的最大字节数，默认 20971520（20 MiB），超限返回 payload-too-large。图片消息较大时可调高。',
  'settings.overridden': '已覆盖',
  'settings.reset': '恢复默认',
  'settings.notExposed': '当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置。',
  'settings.readOnly': '当前部署的设置只读。',
  'settings.expand': '展开设置',
  'settings.collapse': '收起设置',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.discard': '放弃',
  'settings.unsaved': '未保存',
  'settings.saveFailed': '部署未接受这些值，已保留供你修改。',
  'settings.invalidNumber': '请输入数字，留空则使用默认值。',
} satisfies Record<string, string>

/** The mobile-remote card key union. */
type RemoteKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
const en: Record<RemoteKey, string> = {
  'settings.title': 'Mobile Remote',
  'settings.description': "Switches for the DSH Reins app's interface to this host: with the total switch off, every /api/mobile/* request answers 404 and the event stream refuses connections. Saving takes effect immediately — no restart needed.",
  'settings.enabledLabel': 'Enable mobile remote',
  'settings.enabledHint': 'When off, the phone app cannot connect (login and existing features are unaffected). The app signs in with the gate password and uses these endpoints with its session cookie.',
  'settings.inherit': 'Inherit',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.maxBodyLabel': 'Request body cap (bytes)',
  'settings.maxBodyHint': 'Maximum bytes accepted per request; default 20971520 (20 MiB), larger bodies answer payload-too-large. Raise it for large image messages.',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset to default',
  'settings.notExposed': "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly.",
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.expand': 'Show settings',
  'settings.collapse': 'Hide settings',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.discard': 'Discard',
  'settings.unsaved': 'Unsaved',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.invalidNumber': 'Enter a number, or leave blank to use the default.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-client-ui-mobile-remote': RemoteKey
  }
}

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'dsh-client-ui-mobile-remote'

/** The `mobile-remote` fields this card edits. */
interface RemoteSettings {
  enabled?: boolean
  maxRequestBytes?: number
}

/** What the card renders, projected from the staged form. */
export interface MobileRemoteCardState extends CardShell {
  enabled: FieldState
  maxRequestBytes: FieldState
}

/** The registration-side face the card's slot entry injects. */
export interface MobileRemoteCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as `useMobileRemoteCard`. */
    mobileRemoteCard: SnapshotStore<MobileRemoteCardState>
  }
}

/** Props the renderer binds for the mobile-remote card. */
export type MobileRemoteCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<typeof NS>
  & InjectFace<MobileRemoteCardFace>

/** Bridges the `mobile-remote` scope onto the card's staged form. */
export class MobileRemoteCardController {
  private readonly form: CardForm<RemoteSettings>
  private readonly store: SnapshotStore<MobileRemoteCardState>

  /**
   * @param scope - the bound settings scope for the `mobile-remote` namespace.
   */
  constructor(scope: SettingsScope<RemoteSettings>) {
    this.form = new CardForm(scope, [
      booleanField('enabled'),
      numberField('maxRequestBytes', { integer: true, min: 1 }),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): MobileRemoteCardState {
    return {
      ...this.form.shell(),
      enabled: this.form.field('enabled'),
      maxRequestBytes: this.form.field('maxRequestBytes'),
    }
  }

  /** Build the face the card's slot registration injects.
   * @returns the card's slot-inject face.
   */
  inject(): MobileRemoteCardFace {
    return { hooks: { mobileRemoteCard: this.store }, ...this.form.actions() }
  }
}

/**
 * Mount the card into the Plugins settings section's 插件配置 area.
 * @param ctx - the browser plugin context.
 */
export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<RemoteSettings>({ namespace: 'mobile-remote' })
  const controller = new MobileRemoteCardController(scope)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-mobile-remote: card dictionaries')
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: 'mobile-remote',
      locale: NS,
      inject: () => controller.inject(),
    }, MobileRemoteCard)
  })
}
