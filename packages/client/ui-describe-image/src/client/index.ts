/**
 * Browser half of the describe-image plugin: no composer chrome of its own.
 * The shell's input box has no image entry for text-only models, so image
 * sends are rewritten at submit time (installSendHook) into describe-image
 * references before they reach the model — the way a text-only model gets an
 * image to analyze without the shell's vision pipeline. The shell renders
 * user messages as plain text, so a sent reference is then upgraded in place
 * into an inline thumbnail (installConversationImagePreview) unless the
 * deployment turns previews off. The settings card is rendered by the web
 * GUI's built-in plugin config page from the host-side `describe-image`
 * section.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 * @module @zzyyyds88/dsh-tool-describe-image/client
 */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: declares the keyed `settings.plugin.item` slot (plugin-config section).
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { installSendHook } from './send-hook.ts'
import { installConversationImagePreview, type ConversationImagePreview } from './preview.ts'
import { DescribeImageSettingsCard, DescribeImageSettingsCardController, type DescribeImageSettings } from './DescribeImageSettingsCard.tsx'
import { dictionaries, setLanguage, type DescribeImageClientKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The describe-image attach button copy. */
    'describe-image': DescribeImageClientKey
  }
}

/** Locale namespace of the browser half. */
export const NS = 'describe-image' as const

/** Required services: slots for the settings card, conversation for the send hook, settings scope and locale for the card copy. */
export const inject = ['slots', 'conversation', 'settingsScope', 'locale']

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-tool-describe-image: dictionaries')
  ctx.effect(() => {
    // Mirror the shell language into the module-level dictionary switch.
    const sync = (): void => {
      const lang = document.documentElement.lang
      setLanguage(lang === 'zh' || lang.startsWith('zh-') ? 'zh' : 'en')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () =>{  observer.disconnect() }
  }, 'dsh-tool-describe-image: language mirror')

  ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
    const conversation = scope.conversation
    const slots = scope.slots

    // Bound once the settings scope inject fires; the preview enhancer reads
    // it per scan, so an unbound scope (or a missing service) keeps the default.
    let settingsScopeRef: SettingsScope<DescribeImageSettings> | undefined
    // The settings subscription installed by the scope inject below; kept so
    // dispose (or a re-inject) never leaves a stale listener behind.
    let unsubscribeSettings: (() => void) | undefined

    // Text-only models reject image blocks at submit: rewrite image-bearing
    // sends into describe-image references before they reach the model.
    installSendHook(conversation)

    // The shell renders user messages as plain text, so a sent reference sits
    // in the transcript as raw markdown; upgrade it in place into an inline
    // thumbnail unless the deployment turns previews off.
    let previewRef: ConversationImagePreview | undefined
    ctx.effect(() => {
      const handle = installConversationImagePreview(() => settingsScopeRef?.getSnapshot().value?.renderImagePreview !== false)
      previewRef = handle
      return () => {
        previewRef = undefined
        unsubscribeSettings?.()
        unsubscribeSettings = undefined
        settingsScopeRef = undefined
        handle.dispose()
      }
    }, 'dsh-tool-describe-image: conversation image preview')

    // The settings card: bound to the describe-image namespace through the
    // family bridge when the official scope does not expose it.
    ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
      const settingsScope = settingsCtx.settingsScope.bind<DescribeImageSettings>({ namespace: NS })
      unsubscribeSettings?.()
      settingsScopeRef = settingsScope
      // Live toggle: re-scan (or restore) the moment a settings save settles.
      unsubscribeSettings = settingsScope.subscribe(() => previewRef?.refresh())
      const settingsCard = new DescribeImageSettingsCardController(settingsScope)
      slots.inject('settings.plugin.item', () =>
        slots.register({
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => settingsCard.inject(),
        }, DescribeImageSettingsCard))
    })
  })
}
