import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { REACTIONS, REACTION_FRAMES } from './assets.generated.js'
import { clampPetScale, latestOutput, presentationForState, rotatingActivityLabel } from './pet-presentation.js'
import {
  completionState, hasRecentCorrection, hasRecentImage, reasoningQuestionCount,
  stateFromSnapshot, streamFromSnapshot,
} from './pet-state.js'
import {
  beep, getVolume, isMuted, playCelebrate, playPoke, playSad,
  setVolume, speakVoice, toggleMuted, unlockAudio,
} from './sound.js'

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
/** 状态 → 语音台词 key 候选（voice.generated.js）。 */
const VOICE_FOR_STATE = Object.freeze({
  success: ['done1', 'done2', 'done3', 'done4'],
  error: ['error1', 'error2', 'error3'],
  'tool-error': ['error1', 'error2', 'error3'],
  approval: ['approval1', 'approval2'],
  waiting: ['approval1', 'approval2'],
  busy: ['busy1', 'busy2'],
  thinking: ['thinking'],
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
        celebrateCompletion()
        completionTimer = window.setTimeout(() => commit(immediate), 8000)
      }
    } else transitionTimer = window.setTimeout(() => commit(immediate), immediate.kind === 'error' ? 100 : 720)
    return () => { window.clearTimeout(transitionTimer); window.clearTimeout(completionTimer) }
  }, [immediate.kind, immediate.label, immediate.detail, snapshot.running])

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
    playCelebrate()
    speakVoice(pickVoiceKey(VOICE_FOR_STATE.success))
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

  /** 出错安慰音（工具失败 / 任务报错）+ 语音。 */
  const comfortError = useCallback(() => {
    unlockAudio()
    playSad()
    speakVoice(pickVoiceKey(VOICE_FOR_STATE.error))
    speak(COMFORT_LINES[Math.floor(Math.random() * COMFORT_LINES.length)], '')
  }, [speak])

  // 出错 / 工具失败时播放安慰音（仅状态真实切换时，不重复打扰）
  const prevKindRef = useRef(effectiveVisual.kind)
  useEffect(() => {
    const prev = prevKindRef.current
    prevKindRef.current = effectiveVisual.kind
    if (prev !== effectiveVisual.kind && (effectiveVisual.kind === 'error' || effectiveVisual.kind === 'tool-error')) {
      comfortError()
    }
  }, [effectiveVisual.kind, comfortError])

  // 进入等待批准/忙碌/思考等状态时播一句语音（30 秒冷却，避免话痨）
  const stateVoiceAtRef = useRef(0)
  useEffect(() => {
    const keys = VOICE_FOR_STATE[effectiveVisual.kind]
    if (!keys?.length) return
    const now = Date.now()
    if (now - stateVoiceAtRef.current < 30_000) return
    stateVoiceAtRef.current = now
    unlockAudio()
    speakVoice(pickVoiceKey(keys))
  }, [effectiveVisual.kind])

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
    playPoke()
    speakVoice(pickVoiceKey(['poke1', 'poke2', 'poke3']))
    const words = tapTextFor(effectiveVisual.kind)
    speak(words[Math.floor(Math.random() * words.length)], '')
  }, [effectiveVisual.kind, speak])

  /** 单击计数：三连击触发诊断，否则 280ms 后正常反应。 */
  const handleClick = useCallback(() => {
    if (dragged.current) { dragged.current = false; return }
    const now = Date.now()
    clickCountRef.current = (now - lastClickAtRef.current < 450) ? clickCountRef.current + 1 : 1
    lastClickAtRef.current = now
    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0
      setDiagOpen(current => !current)
      return
    }
    window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      if (longPressFired.current) { longPressFired.current = false; return }
      tap()
    }, 280)
  }, [tap])

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
      playCelebrate()
      speakVoice(pickVoiceKey(['headpat1', 'headpat2']))
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

  /** 双击：折叠态展开，否则切换静音。 */
  const handleDoubleClick = useCallback(() => {
    window.clearTimeout(clickTimerRef.current)
    if (collapsed) {
      setCollapsed(false)
      return
    }
    unlockAudio()
    const nextMuted = toggleMuted()
    setMuted(nextMuted)
    speakVoice(nextMuted ? 'muted' : 'unmuted')
    speak(nextMuted ? '声音已关闭 🔇（双击恢复）' : '声音已开启 🔊（双击静音）', '')
  }, [collapsed, speak])

  /** 诊断面板内容。 */
  const diagLines = useMemo(() => {
    const running = runningSessions.length + (focusedSession?.running ? 1 : 0)
    return [
      ['会话', `${(list.ids ?? []).length} 个`],
      ['运行中', `${running} 个`],
      ['上下文', `${Math.round(contextRatio * 100)}%`],
      ['状态', effectiveVisual.kind],
      ['音量', `${Math.round((getVolume() ?? 1) * 100)}%`],
      ['静音', muted ? '是' : '否'],
    ]
  }, [runningSessions.length, focusedSession?.running, list.ids, contextRatio, effectiveVisual.kind, muted])

  const showStream = Boolean(streamText && !tapText && bubblePage % 2 === 0)
  const activityLabel = rotatingActivityLabel(streamMode, phase, questionCount, thinkingMs)
  const bubbleTitle = tapText || (showStream ? activityLabel : effectiveVisual.label)
  const bubbleDetail = tapDetail || (showStream ? typedStream : effectiveVisual.detail)
  const visibleFrame = !collapsed && FRAME_FOR_REACTION[activeReaction] === activeFrame ? activeFrame : ''
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
        <button className="dsh-live2d-character" type="button" aria-label={collapsed ? '双击展开 DeepSeek 状态助手' : '拖动/单击/长按/双击/三击 DeepSeek 状态助手'}
          onClick={handleClick} onDoubleClick={handleDoubleClick} onPointerDown={event => { pointerDown(event); handlePointerDownForInteraction(event) }}
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
        <footer>
          <label>音量 <input type="range" min="0" max="100" value={Math.round((getVolume() ?? 1) * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} aria-label="桌宠音量" /></label>
          <button type="button" onClick={() => { unlockAudio(); beep() }}>试音</button>
          <button type="button" onClick={() => { unlockAudio(); playCelebrate() }}>庆祝</button>
        </footer>
      </section>}
      <nav className="dsh-live2d-tools" aria-label="Pet 快捷操作">
        <button type="button" title={muted ? '声音已关闭（点击开启）' : '声音已开启（点击静音）'} aria-label={muted ? '开启声音' : '静音'} onClick={() => { unlockAudio(); const next = toggleMuted(); setMuted(next); speakVoice(next ? 'muted' : 'unmuted') }}><b>{muted ? '🔇' : '🔊'}</b><span>{muted ? '静音中' : '有声'}</span></button>
        <button type="button" title="最小化 Pet" aria-label="最小化 Pet" onClick={() => setCollapsed(true)}><b>−</b><span>最小化</span></button>
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
    if (waitingMs >= 4 * 60_000) return { kind: 'waiting', label: '等着等着犯困了', detail: '请在任务中回答，我还在等你' }
    if (waitingMs >= 2 * 60_000) return { kind: 'waiting', label: '等得有点生气了', detail: '任务里的问题还没有回答' }
    if (waitingMs >= 45_000) return { kind: 'waiting', label: '还在等你呢', detail: '请回到任务中完成回答' }
    return { kind: 'waiting', label: visual.label, detail: visual.detail }
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
