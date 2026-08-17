// dsh-defaults — 默认值设置插件（宿主半）
//
// 统一承载原「修改默认工作目录」与「思考强度与重试默认值」两个项目的
// 可配置参数（思考强度菜单保持 fork 内建默认档位，不进设置页）：
//
//   dsh-defaults.defaultWorkingDirectory  默认工作目录（空 = 官方行为：打开主目录）
//   dsh-defaults.defaultRetryCount        默认重试次数（对未声明 retryPolicy 的第三方供应商）
//
// 命名空间由本插件注册（installSettingsSection），持久化于
// $DSH_HOME/settings.yaml；消费方：
//   - dsh-host-directory-picker-browse fork：list() 无路径时读取
//     defaultWorkingDirectory（每次打开对话框实时读，改设置即生效）；
//   - dsh-llm-pi-ai fork：供应商未声明 retryPolicy 时用 defaultRetryCount 兜底
//     （改设置触发 settings/document-updated → 重新注册路由）。
// 前端设置标签页由 dsh-client-ui-defaults 提供（设置 → 插件 → 默认值）。
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Stable Cordis plugin name. */
const name = 'dsh-defaults'
/** Settings namespace holding the GUI-configured defaults. */
const NS = settingsNamespace('dsh-defaults')

const Config = z.object({
  /** 目录选择器打开的默认目录；空字符串 = 官方行为（host 主目录）。 */
  defaultWorkingDirectory: z.string().default(''),
  /** 未声明 retryPolicy 的第三方供应商的默认重试次数；0 = 不重试。 */
  defaultRetryCount: z.natural().min(0).default(10),
})

/**
 * Mount the defaults namespace. Consumers read `settings.get('dsh-defaults')`
 * directly, so the host half only owns the registration (schema defaults +
 * settings.yaml persistence).
 * @param ctx - plugin context (settings service injected on mount).
 * @param config - validated {@link Config} (composition base layer).
 */
function apply(ctx, config) {
  installSettingsSection(ctx, NS, Config, config, {
    setSource: () => {},
    onChange: () => {
      ctx.logger.info('dsh-defaults: defaults changed; picker and pi-ai adapter pick them up on next use')
    },
  })
}

export { Config, apply, name }
