/**
 * dsh-client-ui-defaults — 默认值设置卡片（浏览器半）。
 *
 * 在「设置 → 插件 → 插件配置」区注册一张卡片，绑定 `dsh-defaults` 设置
 * 命名空间（由 `dsh-defaults` 宿主插件注册、`dsh-host-apiproxy` 动态暴露）。
 * 目录选择器 fork、pi-ai fork、dsh-llm fork 在使用时读该命名空间，所以
 * 保存立即生效，无需重启。
 * @module @deepseek-ai/dsh-client-ui-defaults
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { DefaultsCard } from './card.tsx'
import { CardForm, numberField, textField, type CardActions, type CardShell, type FieldState } from './settings-form.ts'

/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
  'settings.title': '默认值',
  'settings.description': '配置目录选择器的默认工作目录与模型失败后的默认重试次数（对所有供应商生效）。保存后立即生效，无需重启。',
  'settings.dirLabel': '默认工作目录',
  'settings.dirPlaceholder': '例如 /home/user/Projects（留空 = 打开主目录）',
  'settings.dirHint': '「添加工作区 → 选择工作目录」时，选择器默认打开此目录。留空则使用官方行为（打开服务主目录）。',
  'settings.retryLabel': '默认重试次数',
  'settings.retryHint': '未单独声明重试策略的供应商（包括内置 DeepSeek 供应商），模型失败后的重试次数。0 = 不重试。',
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

/** The defaults key union. */
type DefaultsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
const en: Record<DefaultsKey, string> = {
  'settings.title': 'Defaults',
  'settings.description': "Configure the directory picker's default working directory and the default retry count (applies to every provider). Saving takes effect immediately — no restart needed.",
  'settings.dirLabel': 'Default working directory',
  'settings.dirPlaceholder': 'e.g. /home/user/Projects (empty = home directory)',
  'settings.dirHint': 'The directory picker opens at this path when adding a workspace. Leave empty for the official behavior (the host home directory).',
  'settings.retryLabel': 'Default retry count',
  'settings.retryHint': 'Retries after a failed model call for providers without their own retry policy, including the built-in DeepSeek provider. 0 = no retry.',
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
    'dsh-client-ui-defaults': DefaultsKey
  }
}

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'dsh-client-ui-defaults'

/** The `dsh-defaults` fields this card edits. */
interface DefaultsSettings {
  defaultWorkingDirectory?: string
  defaultRetryCount?: number
}

/** What the card renders, projected from the staged form. */
export interface DefaultsCardState extends CardShell {
  defaultWorkingDirectory: FieldState
  defaultRetryCount: FieldState
}

/** The registration-side face the card's slot entry injects. */
export interface DefaultsCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as `useDefaultsCard`. */
    defaultsCard: SnapshotStore<DefaultsCardState>
  }
}

/** Props the renderer binds for the defaults card. */
export type DefaultsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<typeof NS>
  & InjectFace<DefaultsCardFace>

/** Bridges the `dsh-defaults` scope onto the card's staged form. */
export class DefaultsCardController {
  private readonly form: CardForm<DefaultsSettings>
  private readonly store: SnapshotStore<DefaultsCardState>

  /**
   * @param scope - the bound settings scope for the `dsh-defaults` namespace.
   */
  constructor(scope: SettingsScope<DefaultsSettings>) {
    this.form = new CardForm(scope, [
      textField('defaultWorkingDirectory'),
      numberField('defaultRetryCount', { integer: true, min: 0 }),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private projection(): DefaultsCardState {
    return {
      ...this.form.shell(),
      defaultWorkingDirectory: this.form.field('defaultWorkingDirectory'),
      defaultRetryCount: this.form.field('defaultRetryCount'),
    }
  }

  /** Build the face the card's slot registration injects. */
  inject(): DefaultsCardFace {
    return { hooks: { defaultsCard: this.store }, ...this.form.actions() }
  }
}

/**
 * Mount the card into the Plugins settings section's 插件配置 area.
 * @param ctx - the browser plugin context.
 */
export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<DefaultsSettings>({ namespace: 'dsh-defaults' })
  const controller = new DefaultsCardController(scope)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-defaults: card dictionaries')
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: 'dsh-defaults',
      locale: NS,
      inject: () => controller.inject(),
    }, DefaultsCard)
  })
}
