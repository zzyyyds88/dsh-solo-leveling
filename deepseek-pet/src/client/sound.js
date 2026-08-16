/**
 * deepseek-pet 音效层 —— 移植自 dsh-whale-pet 的 WebAudio 合成方案
 * （思路参考 aceice01/dsh-whale-pet，非商业个人使用；纯本地合成，零素材依赖）
 *
 * 全部音效用 WebAudio 振荡器实时合成（三角波/正弦波 + 包络衰减），
 * 不加载任何音频文件：完成琶音、出错低音、戳音、撒娇音、提示音。
 * 音量：总音量 + 语音/音效/庆祝分动作音量，localStorage 持久保存。
 */

const VOLUME_KEY = 'deepseek-pet:sound'

/** 各类提醒音效的开关（true = 开启）。用户可在诊断面板配置。 */
const ALERT_TOGGLES = Object.freeze({
  celebrate: true, // 任务完成庆祝（琶音+语音+纸屑）
  error: true,     // 出错安慰（低音+语音）
  prompt: true,    // 提问/审批提示（等待批准时）
  poke: true,      // 戳一戳音效
  headpat: true,   // 摸头庆祝
})

/** 音量配置（总音量 + 分动作 + 提醒开关），localStorage 持久化。 */
function loadSettings() {
  try {
    const raw = window.localStorage?.getItem(VOLUME_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return {
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

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
}

/** 单例音量状态（模块级，避免多实例重复读盘）。 */
const settings = loadSettings()

function persist() {
  try { window.localStorage?.setItem(VOLUME_KEY, JSON.stringify(settings)) } catch {}
}

/** 某类提醒音效是否开启（celebrate/error/prompt/poke/headpat）。 */
export function alertEnabled(name) {
  return settings.alerts?.[name] !== false
}

/** 设置某类提醒音效开关。 */
export function setAlertEnabled(name, enabled) {
  settings.alerts = { ...settings.alerts, [name]: enabled === true }
  persist()
}

/** 读取全部提醒开关（诊断面板用）。 */
export function alertToggles() {
  return { ...settings.alerts }
}

/** 是否静音（双击桌宠切换）。 */
export function isMuted() { return settings.muted }

/** 切换静音，返回新状态。 */
export function toggleMuted() {
  settings.muted = !settings.muted
  persist()
  if (!settings.muted) beep()
  return settings.muted
}

/** 读取分动作音量（voice/sfx/celebrate）。 */
export function actionVolume(action) {
  return clampVolume(settings[action] ?? settings.sfx)
}

/** 设置分动作音量（0~1）。 */
export function setActionVolume(action, value) {
  settings[action] = clampVolume(value)
  persist()
}

/** 读取总音量（0~1）。 */
export function getVolume() { return settings.total }

/** 设置总音量（0~1）。 */
export function setVolume(value) {
  settings.total = clampVolume(value)
  persist()
}

let audioCtx = null
let lastAudioError = null

/** 诊断：最近一次音频错误（供三击诊断面板展示）。 */
export function audioError() {
  return lastAudioError
}

/** 创建（不 resume）AudioContext。若已存在则原样返回。 */
function createAudioContext() {
  if (audioCtx) return audioCtx
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)() } catch (error) {
    lastAudioError = `create: ${String(error?.message ?? error)}`
  }
  return audioCtx
}

function ensureAudio() {
  createAudioContext()
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume() } catch (error) {
      lastAudioError = `resume: ${String(error?.message ?? error)}`
    }
  }
  return audioCtx
}

/** 诊断：当前音频状态（供三击诊断面板展示）。 */
export function audioState() {
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
 * @param {number} freq 起始频率 Hz
 * @param {number} dur 时长秒
 * @param {number} vol 基础音量 0~1
 * @param {number} when 延迟秒
 * @param {number|null} slideTo 滑音目标频率（无则平直）
 * @param {'voice'|'sfx'|'celebrate'} action 音量档
 */
export function bell(freq, dur, vol, when = 0, slideTo = null, action = 'sfx') {
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
function shimmer(freq, dur, vol, when = 0, action = 'sfx') {
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
export function playCelebrate() {
  bell(523.25, 0.5, 0.16, 0, null, 'celebrate')
  bell(659.25, 0.5, 0.16, 0.16, null, 'celebrate')
  bell(783.99, 0.5, 0.16, 0.32, null, 'celebrate')
  bell(1046.5, 0.9, 0.18, 0.5, null, 'celebrate')
  shimmer(1046.5, 0.8, 0.05, 0.5, 'celebrate')
}

/** 撒娇音：上扬 chirp。 */
export function playCoquetry() {
  bell(660, 0.25, 0.13, 0, 880, 'sfx')
  shimmer(880, 0.2, 0.04, 0.1, 'sfx')
  bell(990, 0.3, 0.1, 0.3, 1180, 'sfx')
}

/** 戳一戳小音效。 */
export function playPoke() {
  bell(520, 0.1, 0.09, 0, 700, 'sfx')
}

/** 出错安慰低音。 */
export function playSad() {
  bell(392, 0.5, 0.12, 0, 330, 'sfx')
  shimmer(330, 0.4, 0.03, 0.2, 'sfx')
}

/** 提示音（取消静音 / 通用反馈）。 */
export function beep() {
  bell(880, 0.12, 0.1, 0, null, 'sfx')
}

/** 提问/审批提示音：两声轻快上行提示（区别于戳音）。 */
export function playPrompt() {
  bell(660, 0.18, 0.12, 0, 740, 'sfx')
  bell(880, 0.22, 0.12, 0.16, 990, 'sfx')
}

/** 需要用户手势解锁 AudioContext（浏览器自动播放策略）。 */
export function unlockAudio() {
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
export function armAutoplayUnlock() {
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

import { VOICES } from './voice.generated.js'

const voiceCache = new Map()

/** 语音是否可用（已加载合成台词且未静音）。 */
export function hasVoice() {
  return Object.keys(VOICES).length > 0 && !settings.muted
}

/**
 * 播放一条预合成台词。key 不存在时静默跳过（不报错）。
 * 用 AudioContext.decodeAudioData 解码，音量走 voice 档。
 */
export async function speakVoice(key) {
  if (settings.muted) return false
  const entry = VOICES[key]
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
    lastAudioError = `speak: ${String(error?.message ?? error)}`
    return false
  }
}

/** 停止正在播放的语音（卸载时调用，避免悬空 source）。 */
export function stopVoice() {
  voiceCache.clear()
}
