import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { DeepSeekPet } from './DeepSeekPet.tsx'
import { installStyles } from './styles.ts'
import { registerSettingsCards } from './settings-card.tsx'

export const inject = ['slots', 'sessions']

/** Register the pet as an additive, frame-wide Harness Web overlay. */
export function apply(ctx: Context): void {
  ctx.effect(installStyles, 'ui-live2d: styles')
  const resolveSession = (sessionId: SessionId) => ctx.sessions.binding(sessionId)?.session
  const openSession = (sessionId: SessionId) =>{  ctx.sessions.open(sessionId) }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'deepseek-pet',
    order: 90,
    label: 'DeepSeek Pet 插件',
    inject: () => ({ resolveSession, openSession }),
  }, DeepSeekPet as never))

  // 设置 → 插件 → 插件配置 →「DeepSeek 桌宠」+「账房面板」两张一级卡片（开发规范 §2.5）
  registerSettingsCards(ctx)
}
