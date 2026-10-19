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
      setVoices(all.filter((v) => /^es(-|$)/i.test(v.lang.replace('_', '-'))))
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [hasSynthesis])

  useEffect(
    () => () => {
      recRef.current?.abort()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

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

    function finish(rec: Recognition | null) {
      const first = finals[0]
      const alternatives: RecognitionAlternative[] = first
        ? Array.from({ length: first.length }, (_, i) => ({
            transcript: first[i].transcript,
            confidence: first[i].confidence,
          }))
        : []
      const transcript = finals.map((r) => r[0].transcript).join(' ').trim()
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
        online: navigator.onLine,
        at: new Date().toISOString(),
      }
      setAttempts((a) => [...a, attempt])
      setListeningPhrase(null)
      setInterim('')
      if (recRef.current === rec) recRef.current = null
      micPermission().then(setPermAfter)
    }

    if (!recognition) {
      error = 'unsupported'
      finish(null)
      return
    }
    const rec = new recognition.ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 3
    const mark = (name: string) => () => events.push(name)
    rec.onstart = mark('start')
    rec.onaudiostart = mark('audiostart')
    rec.onsoundstart = mark('soundstart')
    rec.onspeechstart = mark('speechstart')
    rec.onspeechend = mark('speechend')
    rec.onsoundend = mark('soundend')
    rec.onaudioend = mark('audioend')
    rec.onnomatch = mark('nomatch')
    rec.onresult = (e) => {
      events.push('result')
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finals.push(r)
          if (latencyMs === null) latencyMs = Math.round(performance.now() - startedAt)
        } else {
          partial += r[0].transcript
        }
      }
      setInterim(partial)
    }
    rec.onerror = (e) => {
      events.push(`error:${e.error}`)
      error = e.error
    }
    rec.onend = () => {
      events.push('end')
      finish(rec)
    }
    recRef.current = rec
    setListeningPhrase(phrase.id)
    setInterim('')
    try {
      rec.start()
    } catch (err) {
      error = `start-threw: ${err instanceof Error ? err.message : String(err)}`
      finish(rec)
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
          {listeningPhrase === p.id && <button onClick={() => recRef.current?.stop()}>Stop</button>}
          {listeningPhrase === p.id && interim && <div>Interim: {interim}</div>}
          {attempts
            .filter((a) => a.phraseId === p.id)
            .map((a) => (
              <div key={a.id} style={{ marginTop: 6, paddingLeft: 12, borderLeft: '3px solid #ddd' }}>
                <div>
                  [{a.lang}] “{a.transcript || '(nothing)'}” · auto-match: {String(a.autoMatch)}
                  {a.alternativeMatches && !a.autoMatch ? ' (a lower-ranked alternative matches)' : ''}
                  {a.error ? ` · error: ${a.error}` : ''}
                  {a.latencyMs !== null ? ` · ${a.latencyMs} ms` : ''}
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
