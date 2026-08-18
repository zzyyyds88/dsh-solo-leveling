/**
 * dsh-defaults — 默认值设置插件（宿主半）
 *
 * 统一承载「默认工作目录」与「默认重试次数」两个可配置参数：
 *
 *   dsh-defaults.defaultWorkingDirectory  目录选择器打开的默认目录（空 = 官方行为：主目录）
 *   dsh-defaults.defaultRetryCount        未声明 retryPolicy 的第三方供应商默认重试次数（0 = 不重试）
 *
 * 命名空间由本插件注册（installSettingsSection），持久化于 $DSH_HOME/settings.yaml；
 * 消费方：
 *   - dsh-host-directory-picker-browse：list() 无路径时读取 defaultWorkingDirectory；
 *   - dsh-llm / dsh-llm-pi-ai：供应商未声明 retryPolicy 时用 defaultRetryCount 兜底。
 * 前端设置卡片由 dsh-client-ui-defaults 提供（设置 → 插件 → 插件配置）。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Stable Cordis plugin name. */
export const name = 'defaults'

/** Settings namespace holding the GUI-configured defaults. */
const NS = settingsNamespace('dsh-defaults')

export interface DefaultsConfig {
  /** 目录选择器打开的默认目录；空字符串 = 官方行为（host 主目录）。 */
  defaultWorkingDirectory: string
  /** 未声明 retryPolicy 的第三方供应商的默认重试次数；0 = 不重试。 */
  defaultRetryCount: number
}

export const Config: z<DefaultsConfig> = z.object({
  defaultWorkingDirectory: z.string().default(''),
  defaultRetryCount: z.natural().default(10),
})

/**
 * Mount the defaults namespace. Consumers read `settings.get('dsh-defaults')`
 * directly, so the host half only owns the registration (schema defaults +
 * settings.yaml persistence).
 * @param ctx - plugin context (settings service injected on mount).
 * @param config - validated {@link Config} (composition base layer).
 */
export function apply(ctx: Context, config: DefaultsConfig): void {
  installSettingsSection(ctx, NS, Config, config, {
    setSource: () => {},
    onChange: () => {
      ctx.logger.info('defaults: defaults changed; picker and llm adapters pick them up on next use')
    },
  })
}
