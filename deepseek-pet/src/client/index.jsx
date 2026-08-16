import { DeepSeekPet } from './DeepSeekPet.jsx'
import { installStyles } from './styles.js'
import { registerSettingsCard } from './settings-card.jsx'

export const inject = ['slots', 'sessions']

/** Register the pet as an additive, frame-wide Harness Web overlay. */
export function apply(ctx) {
  ctx.effect(installStyles, 'ui-live2d: styles')
  const resolveSession = sessionId => ctx.sessions.binding(sessionId)?.session
  const openSession = sessionId => ctx.sessions.open(sessionId)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'deepseek-pet',
    order: 90,
    label: 'DeepSeek Pet 插件',
    inject: () => ({ resolveSession, openSession }),
  }, DeepSeekPet))

  // 设置 → 插件 → 插件配置 →「DeepSeek 桌宠」卡片（开发规范 §2.5）
  registerSettingsCard(ctx)
}
