import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { REACTIONS, REACTION_FRAMES } from './assets.generated.js'
import { clampPetScale, latestOutput, presentationForState, rotatingActivityLabel } from './pet-presentation.js'
import {
  completionState, hasRecentCorrection, hasRecentImage, reasoningQuestionCount,
  stateFromSnapshot, streamFromSnapshot,
} from './pet-state.js'
import {
  ALERT_LABELS, alertEnabled, alertToggles, armAutoplayUnlock, audioError, audioState, beep, getVolume,
  isMuted, playCelebrate, playPoke, playPrompt, playSad, setAlertEnabled,
  setVolume, speakVoice, toggleMuted, unlockAudio,
} from './sound.js'
import { isPetEnabled, subscribeAppSettings } from './app-settings.js'
import {
  billedInput, cacheHitRate, detectTrend, estimateCost, formatTokens, isLedgerEnabled,
  ledgerBudget, ledgerRates, ledgerRevisionOf, overBudget, pushCostSample,
  subscribeLedgerSettings, usageFromSnapshot,
} from './ledger.js'

const EMPTY_SNAPSHOT = Object.freeze({
  openState: 'open', running: false, runningCalls: [], partial: null,
  pending: [], queue: [], nodes: [], lastAgentError: null,
})
const EMPTY_PRESSURE = Object.freeze({})
const POSITION_KEY = 'deepseek-pet:position'
const SCALE_KEY = 'deepseek-pet:scale'
const LAST_ACTIVITY_KEY = 'deepseek-pet:last-activity'
const TEN_MINUTES = 10 * 60_000
const THIRTY_MINUTES = 30 * 60_000
const ONE_HOUR = 60 * 60_000
const CELEBRATE_DURATION_MS = 4200
const CONFETTI_COUNT = 18
const CONFETTI_COLORS = ['#5594f1', '#75ddff', '#f1bd5b', '#7ed6a5', '#ff9eaa', '#c8a2ff']
const FRAME_FOR_REACTION = Object.freeze({
  idle: 'idle-blink',
  'desk-coding': 'desk-coding-hands-up',
  thinking: 'thinking-keypress',
})
const WHIP_EVENT = 'deepseek-pet:whip'
const WHIP_REACTION_DURATION_MS = 3600
const WHIP_VARIANTS = Object.freeze([
  Object.freeze({ reaction: 'whip-defense', text: '抱头蹲防！！！' }),
  Object.freeze({ reaction: 'whip-frightened', text: '卧槽，用户怒了' }),
  Object.freeze({ reaction: 'whip-giggle', text: '打不着，嘿嘿❤️' }),
])
const CELEBRATE_LINES = Object.freeze([
  '搞定啦！٩(◕‿◕)۶',
  '任务完成，快夸我！',
  '耶～又完成一个！',
  '干得漂亮，收工！',
])
const COMFORT_LINES = Object.freeze([
  '出错了也没关系，我重新来',
  '别担心，我收拾一下残局',
  '这个工具不听话，我换个方式',
])
/**
 * 语音台词 key 候选（voice.generated.js）。
 * 分两套，避免同一事件被播两次：
 *  - VOICE_FOR_EVENT：由事件驱动的一次性函数播（celebrateCompletion / comfortError）
 *  - VOICE_FOR_STATE：由状态 effect 播（进入 approval/waiting/busy/thinking 时，30s 冷却）
 * success/error/tool-error 只属于 EVENT，不属于 STATE——否则完成任务/出错时
 * 事件函数和状态 effect 各播一次，语音叠加。
 */
const VOICE_FOR_EVENT = Object.freeze({
  success: ['done1', 'done2', 'done3', 'done4', 'done5', 'done6'],
  error: ['error1', 'error2', 'error3', 'error4', 'error5'],
  'tool-error': ['error1', 'error2', 'error3', 'error4', 'error5'],
})
const VOICE_FOR_STATE = Object.freeze({
  approval: ['approval1', 'approval2', 'approval3'],
  question: ['question1', 'question2', 'question3'],
  busy: ['busy1', 'busy2', 'busy3'],
  thinking: ['thinking', 'thinking2', 'thinking3'],
})
let lastWhipReaction = ''

/** 从候选里随机选一条（尽力避免刚说过的那条）。 */
function pickVoiceKey(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return ''
  if (candidates.length === 1) return candidates[0]
  const pool = candidates.filter(key => key !== lastWhipReaction)
  const picked = pool.length > 0 ? pool : candidates
  const key = picked[Math.floor(Math.random() * picked.length)]
  lastWhipReaction = key
  return key
}

function nextWhipVisual() {
  const pool = WHIP_VARIANTS.filter(variant => variant.reaction !== lastWhipReaction)
  const candidates = pool.length > 0 ? pool : WHIP_VARIANTS
  const variant = candidates[Math.floor(Math.random() * candidates.length)] ?? WHIP_VARIANTS[0]
  lastWhipReaction = variant.reaction
  return {
    kind: 'whip',
    label: variant.text,
    detail: '',
    reaction: variant.reaction,
    text: variant.text,
  }
}

export function DeepSeekPet({ useSessions, resolveSession, openSession }) {
  const list = useSessions(value => value)
  const sessionId = list.current
  const focusedSession = sessionId ? list.byId[sessionId] : undefined
  const runningSessions = useMemo(() => (list.ids ?? [])
      .map(id => list.byId[id])
      .filter(item => item && item.id !== sessionId && (item.running || item.pendingInteraction))
      .sort((a, b) => Number(b.running) - Number(a.running) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)), [list, sessionId])
  const busySessions = runningSessions.filter(item => item.running).length + Number(Boolean(focusedSession?.running))
  const session = useMemo(() => sessionId ? resolveSession(sessionId) : undefined, [resolveSession, sessionId])
  const subscribe = useCallback(listener => session?.subscribe(listener) ?? (() => {}), [session])
  const getSnapshot = useCallback(() => session?.getSnapshot() ?? EMPTY_SNAPSHOT, [session])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const pressureFace = useMemo(() => session?.projections?.faceOf?.('contextPressure'), [session])
  const subscribePressure = useCallback(listener => pressureFace?.subscribe(listener) ?? (() => {}), [pressureFace])
  const getPressure = useCallback(() => pressureFace?.getSnapshot() ?? EMPTY_PRESSURE, [pressureFace])
  const pressure = useSyncExternalStore(subscribePressure, getPressure, getPressure)
  const petEnabled = useSyncExternalStore(subscribeAppSettings, isPetEnabled, isPetEnabled)
  const ledgerEnabled = useSyncExternalStore(subscribeLedgerSettings, isLedgerEnabled, isLedgerEnabled)
  // 订阅修订号：费率/预算变化（即使 enabled 不变）也触发重渲染，账房数字即时刷新
  const ledgerRevision = useSyncExternalStore(subscribeLedgerSettings, ledgerRevisionOf, ledgerRevisionOf)
  void ledgerRevision
  const immediate = stateFromSnapshot(session ? snapshot : null)
  const taskActive = Boolean(snapshot.running || snapshot.runningCalls?.length || snapshot.partial || snapshot.pending?.length || snapshot.queue?.length)
  const contextRatio = Number.isFinite(pressure?.projectedTokens) && Number.isFinite(pressure?.contextWindow)
    ? pressure.projectedTokens / pressure.contextWindow : 0
  const hasImage = hasRecentImage(snapshot)
  const userCorrection = hasRecentCorrection(snapshot)
  const questionCount = reasoningQuestionCount(snapshot)
  const initialIdleMsRef = useRef(null)
  if (initialIdleMsRef.current === null) initialIdleMsRef.current = taskActive ? 0 : inactiveDuration()
  const initialEffective = deriveVisual(immediate, {
    busySessions, contextRatio, hasImage, idleMs: initialIdleMsRef.current,
    questionCount, taskActive, userCorrection, waitingMs: 0,
  })
  const [visual, setVisual] = useState(immediate)
  const [collapsed, setCollapsed] = useState(false)
  const [phase, setPhase] = useState(0)
  const [thinkingMs, setThinkingMs] = useState(0)
  const [visualMs, setVisualMs] = useState(0)
  const [waitingMs, setWaitingMs] = useState(0)
  const [idleMs, setIdleMs] = useState(initialIdleMsRef.current)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [tapText, setTapText] = useState('')
  const [tapDetail, setTapDetail] = useState('')
  const [whipVisual, setWhipVisual] = useState(null)
  const [bubbleVisible, setBubbleVisible] = useState(true)
  const [bubblePage, setBubblePage] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const [confetti, setConfetti] = useState([])
  const [muted, setMuted] = useState(() => isMuted())
  const [diagOpen, setDiagOpen] = useState(false)
  const [ledgerOpen, setLedgerOpen] = useState(true)
  const [alertVer, setAlertVer] = useState(0)
  const [activeReaction, setActiveReaction] = useState(() => presentationForState(initialEffective, 0, {
    idleMs: initialIdleMsRef.current, visualMs: 0, waitingMs: 0,
  }).reaction)
  const [activeFrame, setActiveFrame] = useState('')
  const [reactionPending, setReactionPending] = useState(false)
  const wasRunning = useRef(false)
  const wasTaskActive = useRef(taskActive)
  const idleStarted = useRef(Date.now() - initialIdleMsRef.current)
  const waitingStarted = useRef(0)
  const humanTurnKey = useRef('')
  const drag = useRef(null)
  const dragged = useRef(false)
  const speechTimer = useRef(null)
  const whipTimer = useRef(null)
  const streamLineRef = useRef(null)
  const typedStreamRef = useRef('')
  const streamTargetRef = useRef('')
  const reactionChangedAt = useRef(0)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const clickCountRef = useRef(0)
  const lastClickAtRef = useRef(0)
  const clickTimerRef = useRef(null)
  const celebrateTimer = useRef(null)
  const lastCelebrateAtRef = useRef(0)
  const wasPartialRef = useRef(false)

  useEffect(() => {
    let transitionTimer
    let completionTimer
    const commit = next => setVisual(current => sameVisual(current, next) ? current : next)
    if (snapshot.running) {
      wasRunning.current = true
      transitionTimer = window.setTimeout(() => commit(immediate), immediate.kind === 'error' ? 100 : 720)
    } else if (wasRunning.current) {
      wasRunning.current = false
      if (immediate.kind !== 'idle') commit(immediate)
      else {
        commit(completionState())
        if (petEnabled) fireCompletionCelebration()
        completionTimer = window.setTimeout(() => commit(immediate), 8000)
      }
    } else transitionTimer = window.setTimeout(() => commit(immediate), immediate.kind === 'error' ? 100 : 720)
    return () => { window.clearTimeout(transitionTimer); window.clearTimeout(completionTimer) }
  }, [immediate.kind, immediate.label, immediate.detail, snapshot.running, petEnabled])

  useEffect(() => {
    setPhase(0)
    const interval = window.setInterval(() => setPhase(value => value + 1), 12_000)
    return () => window.clearInterval(interval)
  }, [visual.kind, visual.detail])

  useEffect(() => {
    const started = Date.now()
    setVisualMs(0)
    const interval = window.setInterval(() => setVisualMs(Date.now() - started), 250)
    return () => window.clearInterval(interval)
  }, [visual.kind, visual.detail])

  useEffect(() => {
    if (visual.kind !== 'thinking') { setThinkingMs(0); return () => {} }
    const started = Date.now()
    const interval = window.setInterval(() => setThinkingMs(Date.now() - started), 1000)
    return () => window.clearInterval(interval)
  }, [visual.kind])

  const waiting = Boolean(snapshot.pending?.length)
  useEffect(() => {
    if (!waiting) { waitingStarted.current = 0; setWaitingMs(0); return () => {} }
    waitingStarted.current = Date.now()
    const update = () => setWaitingMs(Date.now() - waitingStarted.current)
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [waiting, sessionId])

  const latestHuman = latestHumanTurnKey(snapshot)
  useEffect(() => {
    if (latestHuman && latestHuman !== humanTurnKey.current) {
      humanTurnKey.current = latestHuman
      idleStarted.current = Date.now()
      setIdleMs(0)
      rememberActivity()
    }
  }, [latestHuman])

  useEffect(() => {
    if (taskActive || wasTaskActive.current) {
      idleStarted.current = Date.now()
      setIdleMs(0)
      rememberActivity()
    }
    wasTaskActive.current = taskActive
    if (taskActive) {
      const interval = window.setInterval(rememberActivity, 30_000)
      return () => window.clearInterval(interval)
    }
    const update = () => setIdleMs(Date.now() - idleStarted.current)
    update()
    const interval = window.setInterval(update, 15_000)
    return () => window.clearInterval(interval)
  }, [taskActive, sessionId])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage?.getItem(POSITION_KEY) ?? 'null')
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) setOffset(saved)
      const savedScale = Number(window.localStorage?.getItem(SCALE_KEY))
      if (Number.isFinite(savedScale) && savedScale >= .65 && savedScale <= 1.4) setScale(savedScale)
    } catch {}
  }, [])

  // 页面任意一次用户交互即解锁音频（自动播放策略；完成庆祝在后台触发，不能依赖点桌宠）
  useEffect(() => { armAutoplayUnlock() }, [])

  const stream = streamFromSnapshot(snapshot)
  const streamText = stream.reply || stream.reasoning
  const streamMode = stream.reply ? '回复' : '思考'
  const hasStream = Boolean(streamText)
  const streamTarget = useMemo(() => latestOutput(streamText), [streamText])
  const [typedStream, setTypedStream] = useState('')

  useEffect(() => {
    streamTargetRef.current = streamTarget
    if (!streamTarget) {
      typedStreamRef.current = ''
      setTypedStream('')
    } else if (!streamTarget.startsWith(typedStreamRef.current)) {
      const cursor = sharedPrefixLength(typedStreamRef.current, streamTarget)
      typedStreamRef.current = streamTarget.slice(0, cursor)
      setTypedStream(typedStreamRef.current)
    }
  }, [streamTarget])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const target = streamTargetRef.current
      const current = typedStreamRef.current
      if (!target || current === target) return
      if (!target.startsWith(current)) {
        typedStreamRef.current = target.slice(0, sharedPrefixLength(current, target))
      }
      typedStreamRef.current = target.slice(0, Math.min(target.length, typedStreamRef.current.length + 2))
      setTypedStream(typedStreamRef.current)
    }, 28)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (streamLineRef.current) streamLineRef.current.scrollLeft = streamLineRef.current.scrollWidth
  }, [typedStream])

  const effectiveVisual = whipVisual ?? deriveVisual(visual, {
    busySessions, contextRatio, hasImage, idleMs, questionCount, taskActive, userCorrection, waitingMs,
  })
  const presentation = useMemo(() => presentationForState(effectiveVisual, phase, {
    busySessions, contextRatio, hasImage, idleMs, questionCount, thinkingMs, userCorrection, visualMs, waitingMs,
  }), [effectiveVisual.kind, effectiveVisual.detail, effectiveVisual.reaction, phase, busySessions, contextRatio, hasImage, idleMs, questionCount, thinkingMs, userCorrection, visualMs, waitingMs])

  useEffect(() => {
    setBubbleVisible(true)
    if (taskActive) return () => {}
    const timer = window.setTimeout(() => setBubbleVisible(false), 10_000)
    return () => window.clearTimeout(timer)
  }, [sessionId, taskActive, effectiveVisual.kind, effectiveVisual.label, tapText])

  useEffect(() => {
    setBubblePage(0)
    if (!hasStream) return () => {}
    const timer = window.setInterval(() => setBubblePage(value => value + 1), 4500)
    return () => window.clearInterval(timer)
  }, [hasStream])

  useEffect(() => {
    let prepareTimer
    let swapTimer
    if (presentation.reaction !== activeReaction) {
      const elapsed = Date.now() - reactionChangedAt.current
      const urgent = effectiveVisual.kind === 'success' || effectiveVisual.kind === 'tool-error'
        || effectiveVisual.kind === 'whip' || activeReaction.startsWith('whip-')
      const wait = urgent || !reactionChangedAt.current ? 0 : Math.max(0, 4_800 - elapsed)
      prepareTimer = window.setTimeout(() => {
        setReactionPending(true)
        swapTimer = window.setTimeout(() => {
          reactionChangedAt.current = Date.now()
          setActiveReaction(presentation.reaction)
          setReactionPending(false)
        }, 520)
      }, wait)
    }
    return () => { window.clearTimeout(prepareTimer); window.clearTimeout(swapTimer) }
  }, [presentation.reaction, activeReaction, effectiveVisual.kind])

  useEffect(() => {
    setActiveFrame('')
    const frame = FRAME_FOR_REACTION[activeReaction]
    if (!frame || collapsed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}

    if (activeReaction === 'idle') {
      let stopped = false
      let showTimer
      let hideTimer
      const scheduleBlink = () => {
        showTimer = window.setTimeout(() => {
          if (stopped) return
          setActiveFrame(frame)
          hideTimer = window.setTimeout(() => {
            setActiveFrame('')
            if (!stopped) scheduleBlink()
          }, 170)
        }, 4200)
      }
      scheduleBlink()
      return () => {
        stopped = true
        window.clearTimeout(showTimer)
        window.clearTimeout(hideTimer)
      }
    }

    const intervalMs = activeReaction === 'desk-coding' ? 520 : 1400
    const interval = window.setInterval(() => {
      setActiveFrame(current => current === frame ? '' : frame)
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [activeReaction, collapsed])

  const updateLook = useCallback(event => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--look-x', Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1)).toFixed(3))
  }, [])
  const pointerDown = useCallback(event => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const root = event.currentTarget.closest('[data-dsh-live2d-root]')
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: offset, rect: root?.getBoundingClientRect() }
    dragged.current = false
  }, [offset])
  const pointerMove = useCallback(event => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) { updateLook(event); return }
    const dx = event.clientX - active.x
    const dy = event.clientY - active.y
    if (Math.hypot(dx, dy) > 4) dragged.current = true
    if (dragged.current) setOffset({ x: active.origin.x + dx, y: active.origin.y + dy })
  }, [updateLook])
  const pointerUp = useCallback(event => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = null
    if (dragged.current) { try { window.localStorage?.setItem(POSITION_KEY, JSON.stringify(offset)) } catch {} }
  }, [offset])
  const wheelScale = useCallback(event => {
    if (collapsed) return
    event.preventDefault()
    event.stopPropagation()
    setScale(current => {
      const next = clampPetScale(current, event.deltaY)
      try { window.localStorage?.setItem(SCALE_KEY, String(next)) } catch {}
      return next
    })
  }, [collapsed])
  const speak = useCallback((text, detail = '') => {
    window.clearTimeout(speechTimer.current)
    setBubbleVisible(true)
    setTapText(text)
    setTapDetail(detail)
    speechTimer.current = window.setTimeout(() => { setTapText(''); setTapDetail('') }, 3600)
  }, [])
  useEffect(() => () => window.clearTimeout(speechTimer.current), [])

  const showWhipVisual = useCallback((visual) => {
    window.clearTimeout(whipTimer.current)
    setCollapsed(false)
    setWhipVisual(visual)
    speak(visual?.text ?? '', '')
    if (visual) {
      whipTimer.current = window.setTimeout(() => setWhipVisual(null), WHIP_REACTION_DURATION_MS)
    }
  }, [speak])

  /** 任务完成庆祝：琶音 + 跳跃 + 纸屑 + 台词 + 语音。 */
  const celebrateCompletion = useCallback(() => {
    unlockAudio()
    if (alertEnabled('celebrate')) {
      playCelebrate()
      speakVoice(pickVoiceKey(VOICE_FOR_EVENT.success))
    }
    setCollapsed(false)
    setCelebrating(true)
    setConfetti(Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
      id: index,
      x: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.2 + Math.random() * 0.9,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 40,
    })))
    speak(CELEBRATE_LINES[Math.floor(Math.random() * CELEBRATE_LINES.length)], '')
    window.clearTimeout(celebrateTimer.current)
    celebrateTimer.current = window.setTimeout(() => {
      setCelebrating(false)
      setConfetti([])
    }, CELEBRATE_DURATION_MS)
  }, [speak])

  /** 完成庆祝去重：running→idle 与流式结束两条路径可能先后触发，3 秒内只庆祝一次。 */
  const fireCompletionCelebration = useCallback(() => {
    const now = Date.now()
    if (now - lastCelebrateAtRef.current < 3000) return
    lastCelebrateAtRef.current = now
    celebrateCompletion()
  }, [celebrateCompletion])

  const lastCompletionDiagRef = useRef('')
  const [completionDiag, setCompletionDiag] = useState('')
  const updateCompletionDiag = useCallback((message) => {
    lastCompletionDiagRef.current = message
    setCompletionDiag(message)
  }, [])

  // 普通对话完成检测：流式回答（partial 有文本内容）从有到无，且非错误/非 agent 任务 → 庆祝。
  // 注意不能只判断 Boolean(snapshot.partial)：DSH 里 partial 结束时可能是空对象 {}，
  // Boolean({}) 恒为 true，检测永不触发。必须看 blocks 里是否有实际文本。
  // 普通对话里 snapshot.running 恒为 false（那是 agent 任务循环的标志），完成时只有
  // partial 清空这一信号；agent 任务的 running→idle 已由上面 effect 处理（3 秒去重兜底）。
  useEffect(() => {
    if (!petEnabled) return
    const hasStreamContent = partialHasText(snapshot.partial)
    const wasStreamContent = wasPartialRef.current
    wasPartialRef.current = hasStreamContent
    updateCompletionDiag(`partial文本:${hasStreamContent ? '有' : '无'} → ${wasStreamContent ? '有' : '无'} | running:${snapshot.running ? '是' : '否'} | 状态:${effectiveVisual.kind}`)
    if (!wasStreamContent || hasStreamContent) return
    if (snapshot.running) return // agent 任务路径已处理
    const kind = effectiveVisual.kind
    if (kind === 'error' || kind === 'tool-error') return // 出错走安慰
    fireCompletionCelebration()
  }, [snapshot.partial, snapshot.running, effectiveVisual.kind, fireCompletionCelebration, updateCompletionDiag, petEnabled])

  /** 出错安慰音（工具失败 / 任务报错）+ 语音。 */
  const comfortError = useCallback(() => {
    unlockAudio()
    if (!alertEnabled('error')) return
    playSad()
    speakVoice(pickVoiceKey(VOICE_FOR_EVENT.error))
    speak(COMFORT_LINES[Math.floor(Math.random() * COMFORT_LINES.length)], '')
  }, [speak])

  // 出错 / 工具失败时播放安慰音（仅状态真实切换时，不重复打扰）
  const prevKindRef = useRef(effectiveVisual.kind)
  useEffect(() => {
    if (!petEnabled) return
    const prev = prevKindRef.current
    prevKindRef.current = effectiveVisual.kind
    if (prev !== effectiveVisual.kind && (effectiveVisual.kind === 'error' || effectiveVisual.kind === 'tool-error')) {
      comfortError()
    }
  }, [effectiveVisual.kind, comfortError, petEnabled])

  // 进入等待批准/提问/忙碌/思考等状态时播提示音+语音（无冷却，每次都提示）。
  // waiting 用 effectiveVisual.promptKind 区分「审批」与「提问」，播不同台词。
  useEffect(() => {
    if (!petEnabled) return
    const kind = effectiveVisual.kind
    if (kind !== 'waiting' && kind !== 'approval' && kind !== 'busy' && kind !== 'thinking') return
    if (!alertEnabled('prompt')) return
    const voiceKey = kind === 'waiting'
      ? (effectiveVisual.promptKind === 'approval' ? 'approval' : 'question')
      : kind
    const keys = VOICE_FOR_STATE[voiceKey]
    if (!keys?.length) return
    unlockAudio()
    playPrompt()
    speakVoice(pickVoiceKey(keys))
  }, [effectiveVisual.kind, effectiveVisual.promptKind, petEnabled])

  /* ---------- 账房：token 用量 / 缓存命中率 / 预估价格 / 预算封顶 ---------- */
  const usage = useMemo(() => (petEnabled && ledgerEnabled ? usageFromSnapshot(snapshot) : null), [snapshot, petEnabled, ledgerEnabled])
  // 费率/预算每次渲染直读（修订号订阅保证费率变化后重渲染，这里拿到新值）
  const ledgerCost = usage ? estimateCost(usage, ledgerRates()) : 0
  const ledgerHit = usage ? cacheHitRate(usage) : null
  const ledgerBudgetNow = ledgerBudget()
  const ledgerLeft = Math.max(0, ledgerBudgetNow - ledgerCost)
  const ledgerOver = overBudget(ledgerCost, ledgerBudgetNow)
  const costHistoryRef = useRef([])
  const peakFlagRef = useRef(false)
  const valleyFlagRef = useRef(false)
  const capAlertedAtRef = useRef(0)
  const lastSampledCostRef = useRef(null)
  const [ledgerTrend, setLedgerTrend] = useState('normal')

  // 峰谷/封顶提醒：成本相比上次采样有实质变化（≥1 分）才采样一次，避免流式快照
  // 每帧重算时把相同成本重复入历史、稀释峰谷判定；封顶提醒 30 分钟内只响一次。
  useEffect(() => {
    if (!petEnabled || !ledgerEnabled || !ledgerOpen || !usage) return
    if (lastSampledCostRef.current !== null && Math.abs(ledgerCost - lastSampledCostRef.current) < 0.01) return
    lastSampledCostRef.current = ledgerCost
    const history = pushCostSample(costHistoryRef.current, ledgerCost)
    costHistoryRef.current = history
    const delta = history.length >= 2 ? history[history.length - 1].cost - history[history.length - 2].cost : 0
    const trend = detectTrend(history)
    if (trend === 'peak' && !peakFlagRef.current) {
      peakFlagRef.current = true
      valleyFlagRef.current = false
      setLedgerTrend('peak')
      speak(`💸 价格高峰！这一阵子烧得飞快（约 +¥${delta.toFixed(2)}），悠着点～`, '')
    } else if (trend === 'valley' && !valleyFlagRef.current) {
      valleyFlagRef.current = true
      peakFlagRef.current = false
      setLedgerTrend('valley')
      speak('🕊️ 价格低谷！这会儿几乎没烧钱，安心摸鱼～', '')
    } else if (trend === 'normal') {
      peakFlagRef.current = false
      valleyFlagRef.current = false
      setLedgerTrend('normal')
    }
    if (ledgerOver && Date.now() - capAlertedAtRef.current > 30 * 60_000) {
      capAlertedAtRef.current = Date.now()
      speak(`🚨 预算封顶提醒！本会话预计已花 ¥${ledgerCost.toFixed(2)}，超了 ¥${ledgerBudgetNow} 的封顶线！`, '')
    }
  }, [usage, ledgerCost, ledgerOver, ledgerOpen, petEnabled, ledgerEnabled, ledgerBudgetNow, speak])

  /** 账房面板行数据（供渲染）。 */
  const ledgerRows = useMemo(() => {
    if (!usage) return []
    const rows = [
      ['预计花费', `¥${ledgerCost.toFixed(2)}`],
    ]
    if (ledgerHit !== null) rows.push(['缓存命中率', `${ledgerHit}%`])
    rows.push(['总 token', formatTokens((usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0) + (usage.output ?? 0))])
    rows.push(['输入', formatTokens(billedInput(usage))])
    if (usage.output) rows.push(['输出', formatTokens(usage.output)])
    if (usage.cacheRead) rows.push(['缓存命中', formatTokens(usage.cacheRead)])
    rows.push(['预算剩', `¥${ledgerLeft.toFixed(2)} / ${ledgerBudgetNow}`])
    const status = ledgerOver ? '🚨 已超封顶！' : (ledgerTrend === 'peak' ? '📈 高峰中' : (ledgerTrend === 'valley' ? '📉 低谷中' : '峰谷正常'))
    rows.push(['状态', status])
    return rows
  }, [usage, ledgerCost, ledgerHit, ledgerLeft, ledgerOver, ledgerBudgetNow, ledgerTrend])

  useEffect(() => () => {
    window.clearTimeout(celebrateTimer.current)
    window.clearTimeout(longPressTimer.current)
    window.clearTimeout(clickTimerRef.current)
  }, [])

  useEffect(() => {
    const onWhip = () => showWhipVisual(nextWhipVisual())
    window.addEventListener(WHIP_EVENT, onWhip)
    return () => window.removeEventListener(WHIP_EVENT, onWhip)
  }, [showWhipVisual])
  useEffect(() => () => window.clearTimeout(whipTimer.current), [])

  const tap = useCallback(() => {
    if (dragged.current) { dragged.current = false; return }
    unlockAudio()
    if (alertEnabled('poke')) {
      playPoke()
      speakVoice(pickVoiceKey(['poke1', 'poke2', 'poke3', 'poke4', 'poke5']))
    }
    const words = tapTextFor(effectiveVisual.kind)
    speak(words[Math.floor(Math.random() * words.length)], '')
  }, [effectiveVisual.kind, speak])

  /** 切换静音（工具条按钮）。双击不再触发。 */
  const handleToggleMute = useCallback(() => {
    unlockAudio()
    const nextMuted = toggleMuted()
    setMuted(nextMuted)
    if (alertEnabled('prompt')) speakVoice(nextMuted ? 'muted' : 'unmuted')
    speak(nextMuted ? '声音已关闭 🔇（工具条可恢复）' : '声音已开启 🔊', '')
  }, [speak])

  /** 单击计数：三连击触发诊断；双击折叠态展开；其余单击戳一戳（不再双击切静音）。 */
  const handleClick = useCallback(() => {
    if (dragged.current) { dragged.current = false; return }
    const now = Date.now()
    clickCountRef.current = (now - lastClickAtRef.current < 450) ? clickCountRef.current + 1 : 1
    lastClickAtRef.current = now
    window.clearTimeout(clickTimerRef.current)
    if (clickCountRef.current >= 3) {
      // 三连击：清掉可能排队的双击动作，直接开诊断
      clickCountRef.current = 0
      setDiagOpen(current => !current)
      return
    }
    clickTimerRef.current = window.setTimeout(() => {
      if (longPressFired.current) { longPressFired.current = false; return }
      const count = clickCountRef.current
      clickCountRef.current = 0
      if (count >= 2 && collapsed) {
        // 折叠态双击：展开
        setCollapsed(false)
        return
      }
      tap()
    }, 450)
  }, [tap, collapsed])

  /** 长按摸头（700ms）：跳跃庆祝 + 台词 + 音效。 */
  const handlePointerDownForInteraction = useCallback((event) => {
    if (event.button !== 0) return
    longPressFired.current = false
    const startX = event.clientX
    const startY = event.clientY
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => {
      if (dragged.current) return
      longPressFired.current = true
      window.clearTimeout(clickTimerRef.current)
      unlockAudio()
      if (alertEnabled('headpat')) {
        playCelebrate()
        speakVoice(pickVoiceKey(['headpat1', 'headpat2', 'headpat3']))
      }
      setCelebrating(true)
      setCollapsed(false)
      speak('嘿嘿，被主人摸头啦～好开心！', '')
      window.clearTimeout(celebrateTimer.current)
      celebrateTimer.current = window.setTimeout(() => {
        setCelebrating(false)
        setConfetti([])
      }, CELEBRATE_DURATION_MS)
    }, 700)
    // 松手 / 移动即取消未触发的摸头（单击只触发戳一戳，不会叠加摸头）
    const cancel = () => {
      window.clearTimeout(longPressTimer.current)
      window.removeEventListener('pointermove', cancelOnMove)
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
    const cancelOnMove = event => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) cancel()
    }
    window.addEventListener('pointermove', cancelOnMove)
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    // 兜底：监听不泄漏
    window.setTimeout(() => {
      window.removeEventListener('pointermove', cancelOnMove)
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
    }, 1500)
  }, [speak])

  /** 诊断面板内容。 */
  const diagLines = useMemo(() => {
    const running = runningSessions.length + (focusedSession?.running ? 1 : 0)
    const audio = audioState()
    const audioErr = audioError()
    return [
      ['会话', `${(list.ids ?? []).length} 个`],
      ['运行中', `${running} 个`],
      ['上下文', `${Math.round(contextRatio * 100)}%`],
      ['状态', effectiveVisual.kind],
      ['音频', audio.state === 'running' ? 'running ✓' : audio.state === 'suspended' ? 'suspended（点一下解锁）' : '未创建'],
      ['静音', muted ? '是' : '否'],
      ['音量', `${Math.round((audio.total ?? 1) * 100)}%`],
      ...(completionDiag ? [['完成检测', completionDiag]] : []),
      ...(audioErr ? [['音频错误', audioErr]] : []),
    ]
  }, [runningSessions.length, focusedSession?.running, list.ids, contextRatio, effectiveVisual.kind, muted, completionDiag])

  const showStream = Boolean(streamText && !tapText && bubblePage % 2 === 0)
  const activityLabel = rotatingActivityLabel(streamMode, phase, questionCount, thinkingMs)
  const bubbleTitle = tapText || (showStream ? activityLabel : effectiveVisual.label)
  const bubbleDetail = tapDetail || (showStream ? typedStream : effectiveVisual.detail)
  const visibleFrame = !collapsed && FRAME_FOR_REACTION[activeReaction] === activeFrame ? activeFrame : ''
  if (!petEnabled) return null
  return (
    <aside data-dsh-live2d-root data-collapsed={collapsed ? 'true' : 'false'} data-pet-state={effectiveVisual.kind}
      data-reaction-pending={reactionPending ? 'true' : 'false'} data-tapped={tapText ? 'true' : 'false'}
      data-celebrating={celebrating ? 'true' : 'false'} data-muted={muted ? 'true' : 'false'}
      style={{ '--pet-drag-x': `${offset.x}px`, '--pet-drag-y': `${offset.y}px`, '--pet-scale': scale }} aria-label="DeepSeek 任务状态助手">
      <div className="dsh-live2d-bubble" data-visible={bubbleVisible || taskActive || tapText ? 'true' : 'false'} data-stream={showStream ? 'true' : 'false'} role="status" aria-live="polite">
        <span>{bubbleTitle}</span><small ref={streamLineRef} title={showStream ? streamTarget : bubbleDetail}>{bubbleDetail}{showStream && <i aria-hidden="true" />}</small>
      </div>
      {confetti.length > 0 && <div className="dsh-live2d-confetti" aria-hidden="true">
        {confetti.map(piece => <i key={piece.id} style={{ '--cf-x': `${piece.x}%`, '--cf-delay': `${piece.delay}s`, '--cf-dur': `${piece.duration}s`, '--cf-color': piece.color, '--cf-rot': `${piece.rotate}deg`, '--cf-drift': `${piece.drift}px` }} />)}
      </div>}
      <div className="dsh-live2d-stage">
        <button className="dsh-live2d-character" type="button" aria-label={collapsed ? '双击展开 DeepSeek 状态助手' : '拖动/单击/长按/三击 DeepSeek 状态助手'}
          onClick={handleClick} onPointerDown={event => { pointerDown(event); handlePointerDownForInteraction(event) }}
          onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheelScale}>
          <span className="dsh-live2d-sprites" aria-hidden="true">
            {Object.entries(REACTIONS).map(([name, src]) => <img key={name} src={src} alt="" draggable="false" data-active={name === (collapsed ? 'idle' : activeReaction) ? 'true' : 'false'} />)}
            {Object.entries(REACTION_FRAMES).map(([name, src]) => <img key={name} src={src} alt="" draggable="false" data-frame="true" data-active={name === visibleFrame ? 'true' : 'false'} />)}
          </span>
        </button>
        <span className="dsh-live2d-mute-hint" data-visible={tapText && (tapText.includes('声音已关闭') || tapText.includes('声音已开启')) ? 'true' : 'false'} aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      </div>
      {diagOpen && <section className="dsh-live2d-diag" aria-label="桌宠诊断">
        <header><b>DeepSeek 桌宠诊断</b><button type="button" onClick={() => setDiagOpen(false)} aria-label="关闭诊断">✕</button></header>
        <dl>{diagLines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="dsh-live2d-diag-alerts" role="group" aria-label="音效提醒设置">
          <p>音效提醒</p>
          {Object.entries(ALERT_LABELS).map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={alertToggles()[key] !== false} onChange={event => { setAlertEnabled(key, event.target.checked); setAlertVer(version => version + 1) }} />{label}</label>
          ))}
        </div>
        <footer>
          <label>音量 <input type="range" min="0" max="100" value={Math.round((getVolume() ?? 1) * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} aria-label="桌宠音量" /></label>
          <button type="button" onClick={() => { unlockAudio(); beep() }}>试音</button>
          <button type="button" onClick={() => { unlockAudio(); playCelebrate() }}>庆祝</button>
          <button type="button" onClick={() => { unlockAudio(); speakVoice('done1') }}>语音</button>
        </footer>
      </section>}
      {ledgerEnabled && ledgerOpen && <section className="dsh-live2d-ledger" aria-label="账房面板">
        <header><b>💰 账房 · 实时</b><button type="button" onClick={() => setLedgerOpen(false)} aria-label="收起账房面板">✕</button></header>
        {usage && ledgerRows.length > 0 ? <dl>
          {ledgerRows.map(([label, value], index) => {
            const isStatus = index === ledgerRows.length - 1
            return <div key={label}><dt>{label}</dt><dd data-alert={isStatus && ledgerOver ? 'true' : undefined}>{value}</dd></div>
          })}
        </dl> : <p className="dsh-live2d-ledger-empty">⏳ 暂无用量：完成一次请求后自动统计（费率按 deepseek-chat 估算，设置可调）</p>}
      </section>}
      <nav className="dsh-live2d-tools" aria-label="Pet 快捷操作">
        <button type="button" title={muted ? '声音已关闭（点击开启）' : '声音已开启（点击静音）'} aria-label={muted ? '开启声音' : '静音'} onClick={handleToggleMute}><b>{muted ? '🔇' : '🔊'}</b><span>{muted ? '静音中' : '有声'}</span></button>
        <button type="button" title="最小化 Pet" aria-label="最小化 Pet" onClick={() => setCollapsed(true)}><b>−</b><span>最小化</span></button>
        {ledgerEnabled && <button type="button" title="账房面板" aria-label="账房面板" data-ledger={ledgerOpen ? 'true' : 'false'} onClick={() => setLedgerOpen(current => !current)}><b>💰</b><span>{ledgerOpen ? '账房中' : '账房'}</span></button>}
      </nav>
      <section className="dsh-live2d-sessions" data-visible={focusedSession || runningSessions.length ? 'true' : 'false'} aria-label="活跃会话">
        {focusedSession && <button className="dsh-live2d-session-focus" type="button" data-current="true" onClick={() => openSession?.(focusedSession.id)}>
          <i data-running={focusedSession.running ? 'true' : 'false'} /><span>{focusedSession.displayTitle || focusedSession.title || focusedSession.id}</span><small>聚焦</small>
        </button>}
        <div className="dsh-live2d-session-list" data-visible={runningSessions.length ? 'true' : 'false'}>
          {runningSessions.slice(0, 7).map((item, index) => <button key={item.id} type="button" data-stacked={index >= 3 ? 'true' : 'false'} onClick={() => openSession?.(item.id)}>
            <i data-running={item.running ? 'true' : 'false'} /><span>{item.displayTitle || item.title || item.id}</span><small>{item.pendingInteraction ? '等待操作' : '执行中'}</small>
          </button>)}
          {runningSessions.length > 7 && <footer>还有 {runningSessions.length - 7} 个会话</footer>}
        </div>
      </section>
    </aside>
  )
}

export function deriveVisual(visual, signals) {
  if (visual.kind === 'waiting' || visual.kind === 'approval') {
    const waitingMs = signals.waitingMs ?? 0
    if (waitingMs >= 4 * 60_000) return { kind: 'waiting', label: '等着等着犯困了', detail: '请在任务中回答，我还在等你', promptKind: visual.promptKind }
    if (waitingMs >= 2 * 60_000) return { kind: 'waiting', label: '等得有点生气了', detail: '任务里的问题还没有回答', promptKind: visual.promptKind }
    if (waitingMs >= 45_000) return { kind: 'waiting', label: '还在等你呢', detail: '请回到任务中完成回答', promptKind: visual.promptKind }
    return { kind: 'waiting', label: visual.label, detail: visual.detail, promptKind: visual.promptKind }
  }
  if (visual.kind === 'error' || visual.kind === 'tool-error' || visual.kind === 'success') return visual
  if (signals.hasImage) return { kind: 'vision', label: '图片暂时看不见', detail: 'DeepSeek 当前不支持视觉输入' }
  if (signals.userCorrection) return { kind: 'apology', label: '对不起，我重新检查', detail: '收到你的纠正反馈' }
  if (signals.busySessions >= 3) return { kind: 'busy', label: '好多会话，忙疯了', detail: `${signals.busySessions} 个任务同时执行` }
  if (signals.contextRatio >= .82) return { kind: 'full', label: '上下文吃饱了', detail: `${Math.round(signals.contextRatio * 100)}% context` }
  if (signals.contextRatio >= .62) return { kind: 'context-snack', label: '还可以再吃一点', detail: `${Math.round(signals.contextRatio * 100)}% context` }
  if (visual.kind === 'thinking' && signals.questionCount >= 4) return { kind: 'confused', label: '疑问有点多，让我理一理', detail: `${signals.questionCount} 个疑问线索` }
  if (!signals.taskActive) {
    const greeting = greetingForHour(new Date().getHours())
    if (greeting.kind !== 'idle') return greeting
    if (signals.idleMs >= ONE_HOUR) return { kind: 'sleeping', label: '已经睡着了', detail: '挂机超过 1 小时' }
    if (signals.idleMs >= THIRTY_MINUTES) return { kind: 'sleepy', label: '抱着枕头犯困', detail: '挂机超过 30 分钟' }
    if (signals.idleMs >= TEN_MINUTES) return { kind: 'hungry', label: '肚子饿了', detail: '挂机超过 10 分钟' }
    return { ...visual, label: greeting.label, detail: greeting.detail }
  }
  return visual
}

export function greetingForHour(hour) {
  if (hour >= 0 && hour < 6) return { kind: 'sleeping', label: '夜深了，已经睡着啦', detail: '记得早点休息' }
  if (hour >= 23) return { kind: 'sleepy', label: '夜深了，好困啊', detail: '记得早点休息' }
  if (hour < 11) return { kind: 'idle', label: '早上好，今天又是新的一天', detail: '一起把今天的任务做好吧' }
  if (hour < 14) return { kind: 'idle', label: '中午好', detail: '别忘了按时吃饭' }
  if (hour < 18) return { kind: 'idle', label: '下午好', detail: '继续加油，也记得活动一下' }
  return { kind: 'idle', label: '晚上好', detail: '今天也辛苦啦' }
}

function sharedPrefixLength(left, right) {
  let index = 0
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1
  return index
}
/** partial 是否含实际文本（reasoning 或回复）。空对象 {} 也算「无内容」。 */
function partialHasText(partial) {
  const blocks = Array.isArray(partial?.blocks) ? partial.blocks : []
  return blocks.some(block => block?.kind && block.text)
}
function latestHumanTurnKey(snapshot) {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : []
  const node = [...nodes].reverse().find(item => item?.kind === 'user' || item?.kind === 'steering')
  return node ? `${node.seq ?? ''}:${node.time ?? ''}` : ''
}
function sameVisual(left, right) { return left.kind === right.kind && left.label === right.label && left.detail === right.detail }
function tapTextFor(kind) {
  if (kind === 'sleeping') return ['嘘……睡着啦', '再睡五分钟……']
  if (kind === 'hungry') return ['可以投喂一碗白饭吗？', '肚子咕咕叫了']
  if (kind === 'waiting') return ['我会在这里等你', '请在任务里回答问题哦']
  if (kind === 'approval') return ['点一下同意我才能继续～']
  if (kind === 'tool-error' || kind === 'error') return ['我会重新收拾残局的！', '这次真的搞砸了……']
  return ['别戳啦～', '我在看当前会话呢', '可以拖我换个位置']
}

function inactiveDuration(now = Date.now()) {
  try {
    const stored = Number(window.localStorage?.getItem(LAST_ACTIVITY_KEY))
    if (Number.isFinite(stored) && stored > 0) return Math.max(0, now - stored)
    window.localStorage?.setItem(LAST_ACTIVITY_KEY, String(now))
  } catch {}
  return 0
}

function rememberActivity(now = Date.now()) {
  try { window.localStorage?.setItem(LAST_ACTIVITY_KEY, String(now)) } catch {}
}
