/**
 * Node-half mobile-adapt settings: the validated namespace id and the
 * plugin `Config` schema the loader checks. The browser half must not
 * import this module (it reaches into Host packages) — it uses the
 * client-safe spellings from `shared.ts` instead.
 */

import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { MOBILE_ADAPT_NS } from './shared.ts'
import type { Config as MobileAdaptConfigShape } from './shared.ts'

export { MOBILE_ADAPT_DEFAULTS, MOBILE_ADAPT_NS, resolveMobileAdaptConfig } from './shared.ts'

/**
 * Settings namespace of the mobile adaptation — the section the web
 * settings surface edits.
 */
export const MOBILE_ADAPT_SETTINGS_NAMESPACE = settingsNamespace(MOBILE_ADAPT_NS)

/** Runtime schema for the configuration (shape declared in shared.ts). */
export const Config: z<MobileAdaptConfigShape> = z.object({
  enabled: z.boolean().default(true),
  breakpoint: z.number().step(1).min(320).max(1280).default(768),
  sidebarWidth: z.number().step(1).min(200).max(500).default(300),
  detailsWidth: z.number().step(1).min(280).max(640).default(480),
  drawerWidth: z.number().step(1).min(240).max(640).default(360),
  petScale: z.number().step(0.05).min(0.1).max(2).default(0.75),
})
