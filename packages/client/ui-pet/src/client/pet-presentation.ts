/** The pet's visual mode, chosen by the state machine. */
export type PetVisualKind =
  | 'whip' | 'waiting' | 'vision' | 'apology' | 'tool-error' | 'approval'
  | 'busy' | 'full' | 'context-snack' | 'sleeping' | 'sleepy' | 'hungry'
  | 'thinking' | 'success' | 'error' | 'working' | 'listening' | 'speaking'
  | 'confused' | 'idle'

/** What the state machine hands the presentation layer. */
export interface PetVisual {
  kind: PetVisualKind
  reaction?: string | undefined
  detail?: unknown
}

/** Ambient signals the presentation layer reads to pick a sprite. */
export interface PetSignals {
  waitingMs?: number | undefined
  hasImage?: boolean | undefined
  userCorrection?: boolean | undefined
  visualMs?: number | undefined
  busySessions?: number | undefined
  contextRatio?: number | undefined
  idleMs?: number | undefined
  questionCount?: number | undefined
  thinkingMs?: number | undefined
}

/** Select one complete emoji sprite. Motion is applied to the whole sprite in CSS. */
export function presentationForState(visual: PetVisual, phase = 0, signals: PetSignals = {}): { expression: string; reaction: string } {
  if (visual.kind === 'whip') return result(visual.reaction ?? 'idle')
  if (visual.kind === 'waiting') return waitingReaction(phase, signals.waitingMs ?? 0)
  if (signals.hasImage || visual.kind === 'vision') return result('blindfold')
  if (signals.userCorrection || visual.kind === 'apology') return result('apologetic')
  if (visual.kind === 'tool-error') return result((signals.visualMs ?? 0) < 3000 ? 'shocked' : 'desk-facepalm')
  if (visual.kind === 'approval') return waitingReaction(phase, signals.waitingMs ?? 0)
  if ((signals.busySessions ?? 0) >= 3 || visual.kind === 'busy') return result('desk-coding')
  if ((signals.contextRatio ?? 0) >= 0.82 || visual.kind === 'full') return result('satiated')
  if ((signals.contextRatio ?? 0) >= 0.62 || visual.kind === 'context-snack') return result('deepseek-rice')
  if (visual.kind === 'sleeping' || (signals.idleMs ?? 0) >= 60 * 60_000) return result('sleeping')
  if (visual.kind === 'sleepy' || (signals.idleMs ?? 0) >= 30 * 60_000) return result('pillow')
  if (visual.kind === 'hungry' || (signals.idleMs ?? 0) >= 10 * 60_000) return result('hungry')
  if (visual.kind === 'thinking' && (signals.questionCount ?? 0) >= 4) {
    return result((signals.questionCount ?? 0) >= 7 ? 'deepseek-pressure' : (['desk-confused', 'thinking'] as const)[phase % 2] ?? 'idle')
  }
  if (visual.kind === 'thinking') {
    if ((signals.thinkingMs ?? 0) < 12_000) return result('thinking')
    if ((signals.thinkingMs ?? 0) < 45_000) return result((['desk-coding', 'relaxed', 'thinking'] as const)[(Math.max(1, phase) - 1) % 3] ?? 'idle')
    return result(['desk-confused', 'desk-coding', 'deepseek-pressure'][phase % 3] ?? 'idle')
  }

  if (visual.kind === 'success') {
    const elapsed = signals.visualMs ?? 0
    return result(elapsed < 2500 ? 'desk-done' : elapsed < 5200 ? 'cheerful' : 'proud')
  }
  if (visual.kind === 'error') return result(['apologetic', 'crying', 'desk-facepalm'][phase % 3] ?? 'idle')
  if (visual.kind === 'working') return result(reactionForTool(String(visual.detail)))
  if (visual.kind === 'listening') return result('skeptical')
  if (visual.kind === 'speaking') return result(['desk-coding', 'thinking', 'skeptical'][phase % 3] ?? 'idle')
  if (visual.kind === 'confused') return result('desk-confused')
  if ((signals.idleMs ?? 0) >= 2 * 60_000) return result(['relaxed', 'skeptical', 'thinking'][phase % 3] ?? 'idle')
  // 待机变体轮换：idle 占多数（加权），偶尔活泼一下——待机大多数时候应是 idle
  return result(['idle', 'idle', 'idle', 'cheerful', 'idle', 'relaxed', 'proud'][phase % 7] ?? 'idle')
}

function waitingReaction(phase: number, waitingMs: number): { expression: string; reaction: string } {
  if (waitingMs >= 4 * 60_000) return result('sleepy')
  if (waitingMs >= 2 * 60_000) return result('angry')
  if (waitingMs >= 45_000) return result('skeptical')
  return result(['relaxed', 'skeptical', 'thinking'][phase % 3] ?? 'idle')
}

function reactionForTool(detail: string): string {
  const tool = detail.toLowerCase()
  if (tool.includes('subagent') || tool.includes('spawn_agent') || tool.includes('create_thread')) return 'desk-coding'
  if (tool.includes('web') || tool.includes('search') || tool.includes('browser')) return 'skeptical'
  if (tool === 'read' || tool.includes('fetch')) return 'thinking'
  if (tool.includes('image') || tool.includes('draw')) return 'thinking'
  if (tool.includes('patch') || tool.includes('edit') || tool.includes('write') || tool.includes('bash') || tool.includes('exec')) {
    return 'desk-coding'
  }
  return 'desk-coding'
}

function result(reaction: string): { expression: string; reaction: string } {
  return { expression: reaction, reaction }
}

export function latestOutput(text: string, limit = 180): string {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= limit) return normalized
  const tail = normalized.slice(-limit)
  const boundary = tail.search(/[。！？.!?；;]\s*/u)
  return (boundary >= 0 ? tail.slice(boundary + 1) : tail).trimStart()
}

export function clampPetScale(current: number, deltaY: number): number {
  return Math.max(.65, Math.min(1.4, Math.round((current - deltaY * .0012) * 100) / 100))
}

export function rotatingActivityLabel(mode: string, phase: number, questionCount = 0, thinkingMs = 0): string {
  if (mode === '回复') return (['正在敲字', '整理回复', '组织答案'] as const)[phase % 3] ?? '分析中'
  if (questionCount >= 4) return (['梳理疑问', '逐项排查', '验证线索'] as const)[phase % 3] ?? '分析中'
  if (thinkingMs >= 12_000) return (['深度思考', '消化上下文', '继续推演'] as const)[phase % 3] ?? '分析中'
  return (['分析中', '梳理上下文', '验证思路'] as const)[phase % 3] ?? '分析中'
}
