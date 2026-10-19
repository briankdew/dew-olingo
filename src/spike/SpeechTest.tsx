import { useEffect, useRef, useState } from 'react'
import { ResultsPanel } from './ResultsPanel'

interface RecognitionAlternative {
  transcript: string
  confidence: number
}
interface RecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
interface RecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResult }
}
interface RecognitionErrorEvent {
  error: string
  message?: string
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onsoundend: (() => void) | null
  onaudioend: (() => void) | null
  onstart: (() => void) | null
  onnomatch: (() => void) | null
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition
interface SpeechWindow {
  SpeechRecognition?: RecognitionCtor
  webkitSpeechRecognition?: RecognitionCtor
}

const PHRASES = [
  { id: 1, text: 'Hola, me llamo Ana.' },
  { id: 2, text: '¿Cómo estás?' },
  { id: 3, text: 'Quiero un café, por favor.' },
  { id: 4, text: '¿Dónde está el baño?' },
  { id: 5, text: 'Mañana voy a la escuela.' },
]
const LANGS = ['es-ES', 'es-MX'] as const
type Lang = (typeof LANGS)[number]
const HARD_ERRORS = ['not-allowed', 'service-not-allowed', 'language-not-supported']

interface ResultSnapshot {
  isFinal: boolean
  alternatives: RecognitionAlternative[]
}
interface ResultLogEntry {
  t: number
  resultIndex: number
  results: ResultSnapshot[]
}
interface TimelineEntry {
  t: number
  name: string
}

interface Diag {
  experiments: { e1: boolean; e2: boolean; e3: boolean }
  instanceId: number | null
  startCountOnInstance: number | null
  attemptsOnInstance: number | null
  sessionReused: boolean | null
  msSincePageLoad: number
  endedBy: string
  micStream: string
  idleEvents: { atMs: number; name: string }[]
}

interface E2Active {
  event: (name: string) => void
  result: (e: RecognitionEvent) => void
  error: (code: string) => void
  end: () => void
}

interface Attempt {
  id: number
  phraseId: number
  expected: string
  lang: Lang
  transcript: string
  alternatives: RecognitionAlternative[]
  autoMatch: boolean
  alternativeMatches: boolean
  userCorrect: boolean | null
  rating: number | null
  error: string | null
  latencyMs: number | null
  events: string[]
  transcriptSource: 'final' | 'interim-fallback' | 'none'
  resultLog: ResultLogEntry[]
  timeline: TimelineEntry[]
  context: { ttsSpeaking: boolean; msSincePreviousEnd: number | null; visibility: string }
  diag: Diag
  online: boolean
  at: string
}

// Accent-, case-, and punctuation-insensitive, so "Mañana" and "manana" compare equal.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getCtor(): { name: string; ctor: RecognitionCtor } | null {
  const w = window as unknown as SpeechWindow
  if (w.SpeechRecognition) return { name: 'SpeechRecognition', ctor: w.SpeechRecognition }
  if (w.webkitSpeechRecognition) return { name: 'webkitSpeechRecognition', ctor: w.webkitSpeechRecognition }
  return null
}

function voiceKey(v: SpeechSynthesisVoice): string {
  return `${v.voiceURI}|${v.name}|${v.lang}`
}

async function micPermission(): Promise<string> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state
  } catch {
    return 'unsupported'
  }
}

function Rating({ name, value, onChange }: { name: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n}>
          <input type="radio" name={name} checked={value === n} onChange={() => onChange(n)} /> {n}
        </label>
      ))}
    </span>
  )
}

export function SpeechTest() {
  const [deviceNote, setDeviceNote] = useState('')
  const [notes, setNotes] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [totalVoices, setTotalVoices] = useState(0)
  const [rawEsVoices, setRawEsVoices] = useState(0)
  const [voiceRatings, setVoiceRatings] = useState<Record<string, number>>({})
  const [played, setPlayed] = useState<Record<string, boolean>>({})
  const [ttsErrors, setTtsErrors] = useState<Record<string, string[]>>({})
  const [lang, setLang] = useState<Lang>('es-ES')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [listeningPhrase, setListeningPhrase] = useState<number | null>(null)
  const [interim, setInterim] = useState('')
  const [permBefore, setPermBefore] = useState('checking')
  const [permAfter, setPermAfter] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const nextId = useRef(1)
  const lastEndAt = useRef<number | null>(null)
  const logRef = useRef<((name: string) => void) | null>(null)
  // Experiments for the iPhone Safari "attempts 2+ stall" diagnosis. All off = original behavior.
  const [exp1, setExp1] = useState(false)
  const [exp2, setExp2] = useState(false)
  const [exp3, setExp3] = useState(false)
  const [micStatus, setMicStatus] = useState('off')
  const exp3Ref = useRef(false)
  const micStreamRef = useRef<MediaStream | null>(null)
  const persistentRef = useRef<Recognition | null>(null)
  const sessionAlive = useRef(false)
  const sessionLang = useRef<Lang | null>(null)
  const sessionLen = useRef(0)
  const e2Active = useRef<E2Active | null>(null)
  const doneRef = useRef<(() => void) | null>(null)
  const stopTapped = useRef(false)
  const idleEvents = useRef<{ atMs: number; name: string }[]>([])
  const instInfo = useRef(new Map<Recognition, { id: number; starts: number; attempts: number }>())
  const instanceSeq = useRef(0)
  const pageLoadAt = useRef(performance.now())

  const recognition = getCtor()
  const hasSynthesis = 'speechSynthesis' in window

  useEffect(() => {
    micPermission().then(setPermBefore)
  }, [])

  useEffect(() => {
    if (!hasSynthesis) return
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      setTotalVoices(all.length)
      const es = all.filter((v) => /^es(-|$)/i.test(v.lang.replace('_', '-')))
      // iPhone Safari returned each voice 3 times; keep the first copy of each key.
      const seen = new Set<string>()
      setRawEsVoices(es.length)
      setVoices(
        es.filter((v) => {
          const key = voiceKey(v)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }),
      )
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [hasSynthesis])

  useEffect(
    () => () => {
      logRef.current?.('js:abort() (unmount)')
      recRef.current?.abort()
      dropPersistent()
      stopMic()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  // Detach and abort the reused (E1) or continuous (E2) instance; nulling the ref first mutes its handlers.
  function dropPersistent() {
    const r = persistentRef.current
    persistentRef.current = null
    sessionAlive.current = false
    e2Active.current = null
    r?.abort()
  }

  function stopMic() {
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop())
    micStreamRef.current = null
  }

  function micState(): string {
    if (!exp3Ref.current) return 'off'
    const s = micStreamRef.current
    if (!s) return 'not-acquired'
    return s.getTracks().every((tr) => tr.readyState === 'live') ? 'live' : 'ended'
  }

  function toggleReuse(on: boolean) {
    dropPersistent()
    setExp1(on)
  }

  function toggleContinuous(on: boolean) {
    dropPersistent()
    setExp2(on)
  }

  // Runs in the checkbox click so getUserMedia keeps the user gesture; the stream is held until unchecked.
  async function toggleMic(on: boolean) {
    setExp3(on)
    exp3Ref.current = on
    if (!on) {
      stopMic()
      setMicStatus('off')
      return
    }
    setMicStatus('requesting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!exp3Ref.current) {
        s.getTracks().forEach((tr) => tr.stop())
        return
      }
      micStreamRef.current = s
      setMicStatus('live')
    } catch (err) {
      setMicStatus(`failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // E2: handlers live on the session instance for its whole life and forward to whichever attempt is active.
  function bindSession(rec: Recognition) {
    const live = () => persistentRef.current === rec
    const idle = (name: string) =>
      idleEvents.current.push({ atMs: Math.round(performance.now() - pageLoadAt.current), name })
    const evt = (name: string) => () => {
      if (!live()) return
      if (e2Active.current) e2Active.current.event(name)
      else idle(name)
    }
    rec.onstart = evt('start')
    rec.onaudiostart = evt('audiostart')
    rec.onsoundstart = evt('soundstart')
    rec.onspeechstart = evt('speechstart')
    rec.onspeechend = evt('speechend')
    rec.onsoundend = evt('soundend')
    rec.onaudioend = evt('audioend')
    rec.onnomatch = evt('nomatch')
    rec.onresult = (e) => {
      if (!live()) return
      sessionLen.current = e.results.length
      if (e2Active.current) e2Active.current.result(e)
      else idle('result')
    }
    rec.onerror = (e) => {
      if (!live()) return
      if (e2Active.current) e2Active.current.error(e.error)
      else idle(`error:${e.error}`)
    }
    rec.onend = () => {
      if (!live()) return
      sessionAlive.current = false
      if (e2Active.current) e2Active.current.end()
      else idle('end')
    }
  }

  function playAll(v: SpeechSynthesisVoice) {
    const key = voiceKey(v)
    window.speechSynthesis.cancel()
    setPlayed((p) => ({ ...p, [key]: true }))
    for (const phrase of PHRASES) {
      const u = new SpeechSynthesisUtterance(phrase.text)
      u.voice = v
      u.lang = v.lang
      u.onerror = (e) => setTtsErrors((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), e.error] }))
      window.speechSynthesis.speak(u)
    }
  }

  function listen(phrase: { id: number; text: string }) {
    if (listeningPhrase !== null) return
    const startedAt = performance.now()
    const events: string[] = []
    const finals: RecognitionResult[] = []
    let error: string | null = null
    let latencyMs: number | null = null
    const timeline: TimelineEntry[] = []
    const resultLog: ResultLogEntry[] = []
    let lastSnapshot: ResultSnapshot[] = []
    const t = () => Math.round(performance.now() - startedAt)
    const log = (name: string) => timeline.push({ t: t(), name })
    const context: Attempt['context'] = {
      ttsSpeaking: hasSynthesis && window.speechSynthesis.speaking,
      msSincePreviousEnd: lastEndAt.current === null ? null : Math.round(startedAt - lastEndAt.current),
      visibility: document.visibilityState,
    }

    stopTapped.current = false
    let finished = false
    let offset = 0
    const diag: Diag = {
      experiments: { e1: exp1, e2: exp2, e3: exp3 },
      instanceId: null,
      startCountOnInstance: null,
      attemptsOnInstance: null,
      sessionReused: null,
      msSincePageLoad: Math.round(startedAt - pageLoadAt.current),
      endedBy: 'natural',
      micStream: micState(),
      idleEvents: idleEvents.current.splice(0),
    }

    function finish(rec: Recognition | null, reason?: string) {
      if (finished) return
      finished = true
      diag.endedBy = reason ?? (stopTapped.current ? 'stop-tap' : 'natural')
      diag.micStream = micState()
      e2Active.current = null
      doneRef.current = null
      const first = finals[0]
      const finalAlternatives: RecognitionAlternative[] = first
        ? Array.from({ length: first.length }, (_, i) => ({
            transcript: first[i].transcript,
            confidence: first[i].confidence,
          }))
        : []
      const finalTranscript = finals.map((r) => r[0].transcript).join(' ').trim()
      // Some browsers may never send isFinal; fall back to the last interim snapshot and flag it.
      const fallbackTranscript = lastSnapshot.map((r) => r.alternatives[0]?.transcript ?? '').join(' ').trim()
      const useFallback = finals.length === 0 && fallbackTranscript !== ''
      const transcript = useFallback ? fallbackTranscript : finalTranscript
      const alternatives = useFallback ? (lastSnapshot[0]?.alternatives ?? []) : finalAlternatives
      const transcriptSource: Attempt['transcriptSource'] =
        finals.length > 0 ? 'final' : useFallback ? 'interim-fallback' : 'none'
      const expected = normalize(phrase.text)
      const attempt: Attempt = {
        id: nextId.current++,
        phraseId: phrase.id,
        expected: phrase.text,
        lang,
        transcript,
        alternatives,
        autoMatch: normalize(transcript) === expected,
        alternativeMatches: alternatives.some((a) => normalize(a.transcript) === expected),
        userCorrect: null,
        rating: null,
        error,
        latencyMs,
        events,
        transcriptSource,
        resultLog,
        timeline,
        context,
        diag,
        online: navigator.onLine,
        at: new Date().toISOString(),
      }
      setAttempts((a) => [...a, attempt])
      setListeningPhrase(null)
      setInterim('')
      lastEndAt.current = performance.now()
      if (recRef.current === rec) recRef.current = null
      micPermission().then(setPermAfter)
    }

    if (!recognition) {
      error = 'unsupported'
      finish(null)
      return
    }
    let rec: Recognition
    let sessionLive = false
    if (exp2) {
      const existing = persistentRef.current
      sessionLive = existing !== null && sessionAlive.current && sessionLang.current === lang
      if (existing && sessionLive) {
        rec = existing
        offset = sessionLen.current
      } else {
        dropPersistent()
        rec = new recognition.ctor()
        persistentRef.current = rec
        sessionAlive.current = true
        sessionLang.current = lang
        sessionLen.current = 0
        rec.lang = lang
        rec.continuous = true
        rec.interimResults = true
        rec.maxAlternatives = 3
        bindSession(rec)
      }
    } else {
      rec = (exp1 ? persistentRef.current : null) ?? new recognition.ctor()
      if (exp1) persistentRef.current = rec
      rec.lang = lang
      rec.continuous = false
      rec.interimResults = true
      rec.maxAlternatives = 3
    }
    const mark = (name: string) => () => {
      events.push(name)
      log(name)
    }
    const onResult = (e: RecognitionEvent) => {
      events.push('result')
      log('result')
      // In a continuous session (E2) results accumulate; `offset` skips those from earlier phrases.
      lastSnapshot = Array.from({ length: e.results.length - offset }, (_, k) => {
        const i = k + offset
        return {
          isFinal: e.results[i].isFinal,
          alternatives: Array.from({ length: e.results[i].length }, (_, j) => ({
            transcript: e.results[i][j].transcript,
            confidence: e.results[i][j].confidence,
          })),
        }
      })
      resultLog.push({ t: t(), resultIndex: e.resultIndex, results: lastSnapshot })
      let partial = ''
      for (let i = Math.max(e.resultIndex, offset); i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finals.push(r)
          if (latencyMs === null) latencyMs = Math.round(performance.now() - startedAt)
        } else {
          partial += r[0].transcript
        }
      }
      setInterim(partial)
      // The continuous session never ends on its own, so the first final closes the attempt.
      if (exp2 && finals.length > 0) finish(rec, 'final-result')
    }
    const onError = (e: RecognitionErrorEvent) => {
      events.push(`error:${e.error}`)
      log(`error:${e.error}`)
      error = e.error
    }
    const onEnd = () => {
      events.push('end')
      log('end')
      finish(rec, exp2 ? 'session-end' : undefined)
    }
    const info = instInfo.current.get(rec) ?? { id: ++instanceSeq.current, starts: 0, attempts: 0 }
    instInfo.current.set(rec, info)
    info.attempts++
    diag.instanceId = info.id
    diag.attemptsOnInstance = info.attempts
    diag.sessionReused = exp2 ? sessionLive : null
    if (exp2) {
      e2Active.current = { event: (name) => mark(name)(), result: onResult, error: (code) => onError({ error: code }), end: onEnd }
      doneRef.current = () => {
        log('js:done (no stop)')
        finish(rec, 'done-tap')
      }
    } else {
      rec.onstart = mark('start')
      rec.onaudiostart = mark('audiostart')
      rec.onsoundstart = mark('soundstart')
      rec.onspeechstart = mark('speechstart')
      rec.onspeechend = mark('speechend')
      rec.onsoundend = mark('soundend')
      rec.onaudioend = mark('audioend')
      rec.onnomatch = mark('nomatch')
      rec.onresult = onResult
      rec.onerror = onError
      rec.onend = onEnd
    }
    recRef.current = rec
    logRef.current = log
    setListeningPhrase(phrase.id)
    setInterim('')
    if (exp2 && sessionLive) {
      diag.startCountOnInstance = info.starts
      log('js:start() skipped (continuous session live)')
      return
    }
    try {
      info.starts++
      diag.startCountOnInstance = info.starts
      log('js:start()')
      rec.start()
    } catch (err) {
      log('js:start() threw')
      error = `start-threw: ${err instanceof Error ? err.message : String(err)}`
      if (exp2) sessionAlive.current = false
      finish(rec, 'start-threw')
    }
  }

  function updateAttempt(id: number, patch: Partial<Attempt>) {
    setAttempts((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  const effectiveCorrect = (a: Attempt) => a.userCorrect ?? a.autoMatch
  const correctPhrases = (l: Lang) =>
    new Set(attempts.filter((a) => a.lang === l && effectiveCorrect(a)).map((a) => a.phraseId)).size
  const hardErrors = [...new Set(attempts.map((a) => a.error).filter((e): e is string => !!e && HARD_ERRORS.includes(e)))]
  const ratedVoiceValues = voices.map((v) => voiceRatings[voiceKey(v)]).filter((n): n is number => n !== undefined)
  const bestVoiceRating = ratedVoiceValues.length ? Math.max(...ratedVoiceValues) : null
  const missing: string[] = []
  if (!recognition) missing.push('no SpeechRecognition in this browser')
  const unrated = voices.filter((v) => voiceRatings[voiceKey(v)] === undefined).length
  if (unrated) missing.push(`${unrated} voice(s) not rated`)
  for (const l of LANGS) {
    const notTried = PHRASES.filter((p) => !attempts.some((a) => a.lang === l && a.phraseId === p.id)).length
    if (notTried) missing.push(`${notTried} phrase(s) not attempted in ${l}`)
  }
  const failReasons: string[] = []
  if (voices.length === 0) failReasons.push('no Spanish voices')
  else if (bestVoiceRating === null || bestVoiceRating < 3) failReasons.push('no voice rated 3 or higher')
  if (Math.max(correctPhrases('es-ES'), correctPhrases('es-MX')) < 4) failReasons.push('fewer than 4 of 5 phrases correct in either language')
  if (hardErrors.length) failReasons.push(`hard errors: ${hardErrors.join(', ')}`)
  const verdict = missing.length ? 'incomplete' : failReasons.length ? 'fail' : 'pass'
  const verdictReasons = missing.length ? missing : failReasons

  const results = {
    deviceNote,
    notes,
    features: {
      recognitionApi: recognition?.name ?? null,
      speechSynthesis: hasSynthesis,
      totalVoices,
      esVoices: voices.length,
      rawEsVoiceCount: rawEsVoices,
      duplicateVoiceCount: rawEsVoices - voices.length,
      online: navigator.onLine,
      micPermissionBefore: permBefore,
      micPermissionAfterLatestAttempt: permAfter,
    },
    voices: voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      voiceURI: v.voiceURI,
      localService: v.localService,
      default: v.default,
      played: played[voiceKey(v)] ?? false,
      rating: voiceRatings[voiceKey(v)] ?? null,
      ttsErrors: ttsErrors[voiceKey(v)] ?? [],
    })),
    attempts: attempts.map((a) => ({ ...a, correct: effectiveCorrect(a) })),
    summary: {
      esVoices: voices.length,
      bestVoiceRating,
      correctPhrases: { 'es-ES': correctPhrases('es-ES'), 'es-MX': correctPhrases('es-MX') },
      hardErrors,
      interimFallbackAttempts: attempts.filter((a) => a.transcriptSource === 'interim-fallback').length,
      verdict,
      reasons: verdictReasons,
    },
  }

  return (
    <div>
      <h3>Setup</h3>
      <p>
        <label>
          Device note: <input value={deviceNote} onChange={(e) => setDeviceNote(e.target.value)} placeholder="e.g. Chromebook model" />
        </label>
      </p>
      <p>
        <label>
          Notes: <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </p>
      <ul>
        <li>Recognition API: {recognition?.name ?? 'not available'}</li>
        <li>speechSynthesis: {hasSynthesis ? 'available' : 'not available'}</li>
        <li>
          Voices: {voices.length} Spanish of {totalVoices} total
        </li>
        <li>Online: {String(navigator.onLine)}</li>
        <li>Mic permission: {permBefore}{permAfter ? ` (after latest attempt: ${permAfter})` : ''}</li>
      </ul>

      <h3>Voices (TTS)</h3>
      <p>Each Play click speaks all 5 phrases. Rate how intelligible the voice is, 1 (unintelligible) to 5 (clear).</p>
      {voices.length === 0 && <p>No Spanish voices listed yet. Voices may load late; if this stays empty, that's a result.</p>}
      {voices.map((v) => {
        const key = voiceKey(v)
        return (
          <div key={key} style={{ borderTop: '1px solid #ccc', padding: '8px 0' }}>
            <div>
              <strong>{v.name}</strong> · {v.lang} · {v.localService ? 'local' : 'network'}
              {v.default ? ' · default' : ''}
            </div>
            <button onClick={() => playAll(v)}>Play all 5</button>{' '}
            <Rating name={`voice-${key}`} value={voiceRatings[key] ?? null} onChange={(n) => setVoiceRatings((r) => ({ ...r, [key]: n }))} />
            {ttsErrors[key]?.length ? <div>TTS errors: {ttsErrors[key].join(', ')}</div> : null}
          </div>
        )
      })}

      <h3>Recognition (STT)</h3>
      <p>
        Language:{' '}
        {LANGS.map((l) => (
          <label key={l} style={{ marginRight: 12 }}>
            <input type="radio" name="lang" checked={lang === l} onChange={() => setLang(l)} disabled={listeningPhrase !== null} /> {l}
          </label>
        ))}
      </p>
      <p>
        Experiments (iPhone Safari diagnosis; leave all off for normal behavior; reload the page between experiments):
        <br />
        <label>
          <input type="checkbox" checked={exp1} disabled={listeningPhrase !== null || exp2} onChange={(e) => toggleReuse(e.target.checked)} /> E1
          reuse one instance, start() each attempt
        </label>
        <br />
        <label>
          <input type="checkbox" checked={exp2} disabled={listeningPhrase !== null || exp1} onChange={(e) => toggleContinuous(e.target.checked)} /> E2
          one continuous session, no stop() between phrases (Stop becomes Done)
        </label>
        <br />
        <label>
          <input type="checkbox" checked={exp3} disabled={listeningPhrase !== null} onChange={(e) => void toggleMic(e.target.checked)} /> E3 hold a
          getUserMedia mic stream open
        </label>{' '}
        ({micStatus})
      </p>
      <p>Click Listen, then say the phrase. The first click triggers the mic permission prompt. Attempt every phrase in both languages.</p>
      {PHRASES.map((p) => (
        <div key={p.id} style={{ borderTop: '1px solid #ccc', padding: '8px 0' }}>
          <div>
            <strong>
              {p.id}. {p.text}
            </strong>
          </div>
          <button onClick={() => listen(p)} disabled={listeningPhrase !== null}>
            {listeningPhrase === p.id ? 'Listening…' : `Listen (${lang})`}
          </button>{' '}
          {listeningPhrase === p.id && <button
              onClick={() => {
                if (exp2) {
                  doneRef.current?.()
                  return
                }
                stopTapped.current = true
                logRef.current?.('js:stop()')
                recRef.current?.stop()
              }}
            >
              {exp2 ? 'Done' : 'Stop'}
            </button>}
          {listeningPhrase === p.id && interim && <div>Interim: {interim}</div>}
          {attempts
            .filter((a) => a.phraseId === p.id)
            .map((a) => (
              <div key={a.id} style={{ marginTop: 6, paddingLeft: 12, borderLeft: '3px solid #ddd' }}>
                <div>
                  [{a.lang}] “{a.transcript || '(nothing)'}” · auto-match: {String(a.autoMatch)}
                  {a.transcriptSource !== 'final' ? ` · source: ${a.transcriptSource}` : ''}
                  {a.alternativeMatches && !a.autoMatch ? ' (a lower-ranked alternative matches)' : ''}
                  {a.error ? ` · error: ${a.error}` : ''}
                  {a.latencyMs !== null ? ` · ${a.latencyMs} ms` : ''}
                </div>
                <div>
                  endedBy: {a.diag.endedBy} · instance #{a.diag.instanceId} (attempt {a.diag.attemptsOnInstance}, start() x
                  {a.diag.startCountOnInstance}
                  {a.diag.sessionReused !== null ? `, session ${a.diag.sessionReused ? 'reused' : 'new'}` : ''}) · mic stream:{' '}
                  {a.diag.micStream}
                </div>
                {a.alternatives.length > 0 && (
                  <div>
                    Alternatives:{' '}
                    {a.alternatives.map((alt) => `“${alt.transcript}” (${alt.confidence.toFixed(2)})`).join(', ')}
                  </div>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={effectiveCorrect(a)}
                    onChange={(e) => updateAttempt(a.id, { userCorrect: e.target.checked })}
                  />{' '}
                  correct
                </label>{' '}
                <Rating name={`attempt-${a.id}`} value={a.rating} onChange={(n) => updateAttempt(a.id, { rating: n })} />
              </div>
            ))}
        </div>
      ))}

      <h3>Verdict: {verdict}</h3>
      {verdictReasons.length > 0 && (
        <ul>
          {verdictReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p>Ratings and attempts live in this page only. A refresh clears them, so copy the results before leaving.</p>
      <ResultsPanel test="speech" results={results} />
    </div>
  )
}
