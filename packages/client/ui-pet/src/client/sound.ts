/**
 * deepseek-pet 音效层 —— 移植自 dsh-whale-pet 的 WebAudio 合成方案
 * （思路参考 aceice01/dsh-whale-pet，非商业个人使用；纯本地合成，零素材依赖）
 *
 * 全部音效用 WebAudio 振荡器实时合成（三角波/正弦波 + 包络衰减），
 * 不加载任何音频文件：完成琶音、出错低音、戳音、撒娇音、提示音。
 * 音量：总音量 + 语音/音效/庆祝分动作音量，localStorage 持久保存。
 */

const VOLUME_KEY = 'deepseek-pet:sound'

/** Alert sound keys. */
export type AlertName = 'celebrate' | 'error' | 'prompt' | 'state' | 'tool' | 'poke' | 'headpat' | 'feedback' | 'greeting' | 'ledger'

/** Per-action volume group. */
export type ActionVolume = 'voice' | 'sfx' | 'celebrate'

/** The sound settings snapshot. */
export interface SoundSettings {
  muted: boolean
  total: number
  voice: number
  sfx: number
  celebrate: number
  alerts: Record<AlertName, boolean>
}

/** 各类提醒音效的开关显示标签（诊断面板 / 设置卡片共用）。 */
export const ALERT_LABELS = Object.freeze({
  celebrate: '任务完成提醒',
  error: '出错安慰',
  prompt: '提问/审批提示',
  state: '状态语音（思考/忙碌）',
  tool: '工具调用语音',
  poke: '戳一戳音效',
  headpat: '摸头音效',
  feedback: '静音/取消静音反馈',
  greeting: '问候语音',
  ledger: '账房提醒音',
})

/** 诊断面板的音效开关分组：基础音效在前，附加音效在后。 */
export const ALERT_GROUPS = Object.freeze([
  { title: '基础音效', keys: ['celebrate', 'error', 'prompt'] as readonly AlertName[] },
  { title: '附加音效', keys: ['poke', 'headpat', 'state', 'tool', 'feedback', 'greeting', 'ledger'] as readonly AlertName[] },
])

/** 各类提醒音效的开关（true = 开启）。用户可在诊断面板/设置卡片配置。 */
const ALERT_TOGGLES = Object.freeze({
  celebrate: true, // 任务完成庆祝（琶音+语音+纸屑）
  error: true,     // 出错安慰（低音+语音）
  prompt: true,    // 提问/审批提示（等待批准/回答时，提示音+语音）
  state: true,     // 状态语音：进入思考/忙碌时播「让我想一想」「这个问题有点意思」等
  tool: true,      // 工具调用语音：进入 working（调用工具）时播短促音效
  poke: true,      // 戳一戳音效
  headpat: true,   // 摸头庆祝
  feedback: true,  // 静音/取消静音反馈（静音时播「声音已关闭」，取消静音播「声音已开启」）
  greeting: true,  // 问候语音：空闲时按时间段播「早上好/中午好/下午好/晚上好」
  ledger: true,    // 账房提醒音：价格峰谷 / 预算封顶提醒
})

/** 音量配置（总音量 + 分动作 + 提醒开关），localStorage 持久化。 */
function loadSettings(): SoundSettings {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundSettings> & { alerts?: Partial<Record<AlertName, boolean>> }
      return {
        muted: parsed.muted === true,
        total: clampVolume(parsed.total),
        voice: clampVolume(parsed.voice),
        sfx: clampVolume(parsed.sfx),
        celebrate: clampVolume(parsed.celebrate),
        alerts: { ...ALERT_TOGGLES, ...(parsed.alerts && typeof parsed.alerts === 'object' ? parsed.alerts : {}) },
      }
    }
  } catch {}
  return { muted: false, total: 1, voice: 1, sfx: 1, celebrate: 1, alerts: { ...ALERT_TOGGLES } }
}

function clampVolume(value: unknown): number {
  return Math.max(0, Math.min(1, typeof value === 'number' && Number.isFinite(value) ? value : 1))
}

/** 单例音量状态（模块级，避免多实例重复读盘）。 */
const settings = loadSettings()

function persist(): void {
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify(settings))
    window.dispatchEvent(new Event('deepseek-pet:sound-changed'))
  } catch {}
}

/** 某类提醒音效是否开启（celebrate/error/prompt/poke/headpat）。
 * @param name - the alert key to query.
 * @returns true when that alert sound is enabled.
 */
export function alertEnabled(name: AlertName): boolean {
  return settings.alerts[name]
}

/** 设置某类提醒音效开关。
 * @param name - the alert key to configure.
 * @param enabled - whether the alert should play.
 */
export function setAlertEnabled(name: AlertName, enabled: boolean): void {
  settings.alerts = { ...settings.alerts, [name]:  enabled }
  persist()
}

/** 读取全部提醒开关（诊断面板用）。
 * @returns a copy of every alert toggle.
 */
export function alertToggles(): Record<AlertName, boolean> {
  return { ...settings.alerts }
}

/** 是否静音（工具条按钮切换）。
 * @returns true when sound is muted.
 */
export function isMuted(): boolean { return settings.muted }

/** 切换静音，返回新状态。反馈音（静音/取消静音语音）由调用方在切换前后播放，
 * 以便「声音已关闭」在静音生效前出声、取消静音后播「声音已开启」。 */
export function toggleMuted(): boolean {
  settings.muted = !settings.muted
  persist()
  return settings.muted
}

/** 读取分动作音量（voice/sfx/celebrate）。
 * @param action - the volume group to read.
 * @returns the clamped volume (0–1) for that group.
 */
export function actionVolume(action: ActionVolume): number {
  return clampVolume(settings[action])
}

/** 设置分动作音量（0~1）。
 * @param action - the volume group to write.
 * @param value - the new volume in the 0–1 range.
 */
export function setActionVolume(action: ActionVolume, value: number): void {
  settings[action] = clampVolume(value)
  persist()
}

/** 读取总音量（0~1）。
 * @returns the overall volume in the 0–1 range.
 */
export function getVolume(): number { return settings.total }

/** 设置总音量（0~1）。
 * @param value - the new overall volume in the 0–1 range.
 */
export function setVolume(value: number): void {
  settings.total = clampVolume(value)
  persist()
}

/** 读取全量设置快照（设置卡片用）。
 * @returns a copy of the full sound settings.
 */
export function soundSettingsSnapshot(): SoundSettings {
  return {
    muted: settings.muted,
    total: settings.total,
    voice: settings.voice,
    sfx: settings.sfx,
    celebrate: settings.celebrate,
    alerts: { ...settings.alerts },
  }
}

/** 设置卡片批量保存：一次写入多个字段（total/alerts/muted 等），返回新快照。
 * @param patch - partial settings to apply; only defined fields are written.
 * @returns the new settings snapshot after the patch is applied.
 */
export function applySoundSettings(patch: Partial<SoundSettings>): SoundSettings {
  if (Number.isFinite(patch.total)) settings.total = clampVolume(patch.total)
  if (Number.isFinite(patch.voice)) settings.voice = clampVolume(patch.voice)
  if (Number.isFinite(patch.sfx)) settings.sfx = clampVolume(patch.sfx)
  if (Number.isFinite(patch.celebrate)) settings.celebrate = clampVolume(patch.celebrate)
  if (typeof patch.muted === 'boolean') settings.muted = patch.muted
  if (patch.alerts && typeof patch.alerts === 'object') {
    settings.alerts = { ...settings.alerts, ...patch.alerts }
  }
  persist()
  return soundSettingsSnapshot()
}

let audioCtx: AudioContext | null = null
let lastAudioError: string | null = null

/** 诊断：最近一次音频错误（供三击诊断面板展示）。
 * @returns the last audio error message, or null when none occurred.
 */
export function audioError(): string | null {
  return lastAudioError
}

/** 创建（不 resume）AudioContext。若已存在则原样返回。 */
function createAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx
  try {
    audioCtx = new window.AudioContext()
  } catch (error) {
    lastAudioError = `create: ${error instanceof Error ? error.message : String(error)}`
  }
  return audioCtx
}

function ensureAudio(): AudioContext | null {
  createAudioContext()
  if (audioCtx && audioCtx.state === 'suspended') {
    try { void audioCtx.resume() } catch (error) {
      lastAudioError = `resume: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return audioCtx
}

/** 诊断：当前音频状态（供三击诊断面板展示）。
 * @returns the current audio context state, volume, and mute facts for the diagnostic panel.
 */
export function audioState(): { state: string; muted: boolean; total: number; voice: number; sfx: number; celebrate: number } {
  return {
    state: audioCtx ? audioCtx.state : 'uncreated',
    muted: settings.muted,
    total: settings.total,
    voice: settings.voice,
    sfx: settings.sfx,
    celebrate: settings.celebrate,
  }
}

/**
 * 一次合成的音（三角波主音 + 可选滑音），音量 = 总音量 × 分动作音量。
 * @param freq - starting frequency in Hz.
 * @param dur - duration in seconds.
 * @param vol - base volume in the 0–1 range.
 * @param when - delay in seconds before the note starts.
 * @param slideTo - target frequency to glide to, or null for a flat pitch.
 * @param action - the volume group that scales this note.
 */
export function bell(freq: number, dur: number, vol: number, when = 0, slideTo: number | null = null, action: ActionVolume = 'sfx'): void {
  if (settings.muted) return
  const ctx = ensureAudio()
  if (!ctx) return
  const t0 = ctx.currentTime + when
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(freq, t0)
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  const scaled = (vol || 0.14) * actionVolume(action) * settings.total
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(scaled, t0 + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(t0)
  oscillator.stop(t0 + dur + 0.05)
}

/** 高八度柔和小泛音（叠加在主音上的 shimmer）。 */
function shimmer(freq: number, dur: number, vol: number, when = 0, action: ActionVolume = 'sfx'): void {
  if (settings.muted) return
  const ctx = ensureAudio()
  if (!ctx) return
  const t0 = ctx.currentTime + when
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(freq * 2, t0)
  const scaled = (vol || 0.05) * actionVolume(action) * settings.total
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(scaled, t0 + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.8)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(t0)
  oscillator.stop(t0 + dur)
}

/** 任务完成庆祝琶音：C5 E5 G5 C6 + 高音 shimmer。 */
export function playCelebrate(): void {
  bell(523.25, 0.5, 0.16, 0, null, 'celebrate')
  bell(659.25, 0.5, 0.16, 0.16, null, 'celebrate')
  bell(783.99, 0.5, 0.16, 0.32, null, 'celebrate')
  bell(1046.5, 0.9, 0.18, 0.5, null, 'celebrate')
  shimmer(1046.5, 0.8, 0.05, 0.5, 'celebrate')
}

/** 账房提醒音：柔和双音上行（区别于提问/审批提示的两声轻快提示）。 */
export function playLedger(): void {
  bell(587.33, 0.2, 0.09, 0, null, 'sfx')
  bell(880, 0.26, 0.09, 0.18, null, 'sfx')
}

/** 戳一戳小音效。 */
export function playPoke(): void {
  bell(520, 0.1, 0.09, 0, 700, 'sfx')
}

/** 出错安慰低音。 */
export function playSad(): void {
  bell(392, 0.5, 0.12, 0, 330, 'sfx')
  shimmer(330, 0.4, 0.03, 0.2, 'sfx')
}

/** 提示音（取消静音 / 通用反馈）。 */
export function beep(): void {
  bell(880, 0.12, 0.1, 0, null, 'sfx')
}

/** 提问/审批提示音：两声轻快上行提示（区别于戳音）。 */
export function playPrompt(): void {
  bell(660, 0.18, 0.12, 0, 740, 'sfx')
  bell(880, 0.22, 0.12, 0.16, 990, 'sfx')
}

/** 工具调用音效：短促咔哒双音（提示「正在调用工具」）。 */
export function playTool(): void {
  bell(392, 0.07, 0.07, 0, null, 'sfx')
  bell(494, 0.07, 0.07, 0.08, null, 'sfx')
}

/** 需要用户手势解锁 AudioContext（浏览器自动播放策略）。 */
export function unlockAudio(): void {
  ensureAudio()
}

let unlockArmed = false

/**
 * 全局手势解锁：挂载时**立即预热创建** AudioContext（即使无手势也存在，
 * 避免任务完成瞬间在非手势上下文首次创建而被浏览器强制 suspended）；
 * 页面任意一次用户交互（pointerdown/keydown/touchstart）再 resume 解锁。
 * 浏览器要求音频上下文必须经用户手势 resume 才能出声，而完成庆祝发生在
 * 后台（非手势上下文）——若用户只是旁观、没点过页面，预热创建 + 手势
 * resume 是唯一可靠路径。挂载时调用一次，幂等。
 */
export function armAutoplayUnlock(): void {
  createAudioContext() // 预热：页面加载即有 ctx（可能 suspended）
  if (unlockArmed) return
  unlockArmed = true
  const unlock = () => {
    ensureAudio()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock)
}

/* ---------------- 离线语音（edge-tts 预合成，base64 内嵌） ---------------- */

import { VOICES } from './voice.generated.ts'

const voiceCache = new Map<string, AudioBuffer>()

/** 语音是否可用（已加载合成台词且未静音）。
 * @returns true when synthesized lines are loaded and sound is not muted.
 */
export function hasVoice(): boolean {
  return Object.keys(VOICES).length > 0 && !settings.muted
}

/**
 * 播放一条预合成台词。key 不存在时静默跳过（不报错）。
 * 用 AudioContext.decodeAudioData 解码，音量走 voice 档。
 * @param key - the voice line key to play.
 * @returns true when the line was scheduled, false when muted, missing, or a decode/playback error occurred.
 */
export async function speakVoice(key: string): Promise<boolean> {
  if (settings.muted) return false
  const entry = (VOICES as Record<string, { text: string; b64: string }>)[key]
  if (!entry?.b64) return false
  const ctx = ensureAudio()
  if (!ctx) return false
  try {
    let buffer = voiceCache.get(key)
    if (!buffer) {
      const bytes = atob(entry.b64)
      const data = new Uint8Array(bytes.length)
      for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index)
      buffer = await ctx.decodeAudioData(data.buffer)
      voiceCache.set(key, buffer)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    const scaled = actionVolume('voice') * settings.total
    const t0 = ctx.currentTime
    const end = t0 + buffer.duration
    // 包络：0.02s 淡入 → 整句恒定音量 → 末尾 0.08s 淡出。
    // 注意不能对整句做指数衰减（会越说越小），只在末尾淡出防爆音。
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(scaled, t0 + 0.02)
    gain.gain.setValueAtTime(scaled, Math.max(t0 + 0.02, end - 0.08))
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    source.connect(gain).connect(ctx.destination)
    source.start()
    return true
  } catch (error) {
    lastAudioError = `speak: ${error instanceof Error ? error.message : String(error)}`
    return false
  }
}

/** 停止正在播放的语音（卸载时调用，避免悬空 source）。 */
export function stopVoice(): void {
  voiceCache.clear()
}
