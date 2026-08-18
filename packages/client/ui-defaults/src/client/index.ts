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
import { createSnapshotStore, type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { DefaultsCard } from './card.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-client-ui-defaults':
      | 'title' | 'description'
      | 'dirLabel' | 'dirPlaceholder' | 'dirHint'
      | 'retryLabel' | 'retryHint'
      | 'saveLabel' | 'discard' | 'unsaved' | 'readOnly'
      | 'saved' | 'retryInvalid' | 'saveFailed'
  }
}

/** Locale dictionary namespace owned by this plugin. */
export const NS = 'dsh-client-ui-defaults'

/** The `dsh-defaults` fields this card edits. */
interface DefaultsSettings {
  defaultWorkingDirectory?: string
  defaultRetryCount?: number
}

/** What the card renders, projected from the bound scope. */
export interface DefaultsCardState {
  /** Whether the namespace resolved and the card should render. */
  available: boolean
  /** Whether the Host accepts writes; false disables the controls. */
  writable: boolean
  defaultWorkingDirectory: string
  defaultRetryCount: number
}

/** The registration-side face the card's slot entry injects. */
export interface DefaultsCardFace {
  hooks: {
    /** Card snapshot bound by the renderer as `useDefaultsCard`. */
    defaultsCard: SnapshotStore<DefaultsCardState>
  }
  /** Write both fields; resolves true only when the store confirms them. */
  save: (fields: { defaultWorkingDirectory: string; defaultRetryCount: number }) => Promise<boolean>
}

/** Props the renderer binds for the defaults card. */
export type DefaultsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<typeof NS>
  & InjectFace<DefaultsCardFace>

/** Bridges the `dsh-defaults` scope onto the card's snapshot store. */
export class DefaultsCardController {
  private readonly store: SnapshotStore<DefaultsCardState>
  private readonly unsub: () => void

  /**
   * @param scope - the bound settings scope for the `dsh-defaults` namespace.
   */
  constructor(private readonly scope: SettingsScope<DefaultsSettings>) {
    this.store = createSnapshotStore<DefaultsCardState>(this.projection())
    this.unsub = scope.subscribe(() => { this.store.set(this.projection()) })
  }

  private projection(): DefaultsCardState {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      defaultWorkingDirectory: snapshot.status === 'ready'
        ? (snapshot.value?.defaultWorkingDirectory ?? '')
        : '',
      defaultRetryCount: snapshot.status === 'ready'
        ? (snapshot.value?.defaultRetryCount ?? 10)
        : 10,
    }
  }

  /** Write both fields; resolves true only when the store confirms the values landed. */
  async save(fields: { defaultWorkingDirectory: string; defaultRetryCount: number }): Promise<boolean> {
    try {
      await this.scope.set('defaultWorkingDirectory', fields.defaultWorkingDirectory)
      await this.scope.set('defaultRetryCount', fields.defaultRetryCount)
    } catch {
      return false
    }
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    return snapshot.status === 'ready'
      && value !== undefined
      && value.defaultWorkingDirectory === fields.defaultWorkingDirectory
      && value.defaultRetryCount === fields.defaultRetryCount
  }

  /** Build the face the card's slot registration injects. */
  inject(): DefaultsCardFace {
    return {
      hooks: { defaultsCard: this.store },
      save: fields => this.save(fields),
    }
  }

  /** Detach the scope subscription. */
  dispose(): void {
    this.unsub()
  }
}

const zh = {
  title: '默认值',
  description: '配置目录选择器的默认工作目录与模型失败后的默认重试次数（对所有供应商生效）。保存后立即生效，无需重启。',
  dirLabel: '默认工作目录',
  dirPlaceholder: '例如 /home/user/Projects（留空 = 打开主目录）',
  dirHint: '「添加工作区 → 选择工作目录」时，选择器默认打开此目录。留空则使用官方行为（打开服务主目录）。',
  retryLabel: '默认重试次数',
  retryHint: '未单独声明重试策略的供应商（包括内置 DeepSeek 供应商），模型失败后的重试次数。0 = 不重试。',
  saveLabel: '保存',
  discard: '放弃',
  unsaved: '未保存',
  readOnly: '当前设置不可写。',
  saved: '已保存：目录选择器与重试默认值已更新。',
  retryInvalid: '重试次数必须是大于等于 0 的整数。',
  saveFailed: '保存失败：可能已被其它修改覆盖或权限不足，请重试。',
}

const en = {
  title: 'Defaults',
  description: "Configure the directory picker's default working directory and the default retry count (applies to every provider). Saving takes effect immediately — no restart needed.",
  dirLabel: 'Default working directory',
  dirPlaceholder: 'e.g. /home/user/Projects (empty = home directory)',
  dirHint: 'The directory picker opens at this path when adding a workspace. Leave empty for the official behavior (the host home directory).',
  retryLabel: 'Default retry count',
  retryHint: 'Retries after a failed model call for providers without their own retry policy, including the built-in DeepSeek provider. 0 = no retry.',
  saveLabel: 'Save',
  discard: 'Discard',
  unsaved: 'Unsaved',
  readOnly: 'Settings are not writable.',
  saved: 'Saved: the directory picker and retry defaults are updated.',
  retryInvalid: 'The retry count must be a non-negative integer.',
  saveFailed: 'Save failed: possibly overwritten concurrently or not permitted. Retry.',
}

/**
 * Mount the card into the Plugins settings section's 插件配置 area.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  const scope = ctx.settingsScope.bind<DefaultsSettings>({ namespace: 'dsh-defaults' })
  const controller = new DefaultsCardController(scope)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-defaults: card dictionaries')
  ctx.effect(() => () => { controller.dispose() }, 'ui-defaults: card scope')
  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      key: 'dsh-defaults',
      locale: NS,
      inject: () => controller.inject(),
    }, DefaultsCard)
  })
}
