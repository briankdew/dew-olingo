import { mapSttErrorCode, STT_MESSAGES, type SttErrorKind } from './errors'
import { createWatchdog, type WatchdogConfig, type WatchdogRule } from './watchdog'

export interface SttEvent {
  name: string
  /** Milliseconds since start() was called. */
  atMs: number
  detail?: string
}

export interface ListenResult {
  transcript: string
  /** True when the watchdog ended the session after some text had arrived. */
  partial: boolean
  events: SttEvent[]
  ruleFired?: WatchdogRule
  /** abort()/error was not followed by an `end` event within the wait cap. */
  endNotSeen: boolean
}

export class SttError extends Error {
  constructor(
    public readonly kind: SttErrorKind,
    public readonly events: SttEvent[] = [],
    public readonly ruleFired?: WatchdogRule,
    public readonly endNotSeen = false,
  ) {
    super(STT_MESSAGES[kind])
    this.name = 'SttError'
  }
}

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
export interface RecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResult }
}
export interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onsoundstart: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  onsoundend: (() => void) | null
  onaudioend: (() => void) | null
  onnomatch: (() => void) | null
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface SttDeps {
  /** Null when the browser has no recognition API. */
  createRecognition?: (() => RecognitionLike) | null
  /** True while TTS is playing; listen() refuses then. */
  isSpeaking?: () => boolean
  watchdog?: Partial<WatchdogConfig>
  /** How long to wait for `end` after abort() before moving on. */
  endWaitMs?: number
  lang?: string
}

type RecognitionCtor = new () => RecognitionLike

function defaultCreateRecognition(): (() => RecognitionLike) | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? () => new Ctor() : null
}

interface Instance {
  rec: RecognitionLike
  ended: boolean
  waiters: (() => void)[]
}

interface Active {
  cancelled: boolean
  abort: () => void
}

export function createStt(deps: SttDeps = {}) {
  const create = deps.createRecognition === undefined ? defaultCreateRecognition() : deps.createRecognition
  const isSpeaking = deps.isSpeaking ?? (() => false)
  const endWaitMs = deps.endWaitMs ?? 1500
  const lang = deps.lang ?? 'es-MX'
  let active: Active | null = null
  let last: Instance | null = null

  /** Resolves true if the instance's `end` event arrived, false when the cap ran out first. */
  const waitEnded = (inst: Instance): Promise<boolean> =>
    new Promise((resolve) => {
      if (inst.ended) return resolve(true)
      const timer = setTimeout(() => resolve(false), endWaitMs)
      inst.waiters.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })

  const safeAbort = (rec: RecognitionLike) => {
    try {
      rec.abort()
    } catch {
      // already stopped
    }
  }

  async function run(opts: { lang?: string }, token: Active): Promise<ListenResult> {
    // Safety net: never create a session while the previous instance may still hold the mic.
    if (last && !last.ended) {
      safeAbort(last.rec)
      await waitEnded(last)
    }
    if (token.cancelled) throw new SttError('aborted')
    if (!create) throw new SttError('unsupported')

    // A fresh instance every time: iOS Safari hung on reused sessions, and TTS breaks a live one.
    const rec = create()
    const inst: Instance = { rec, ended: false, waiters: [] }
    last = inst
    const events: SttEvent[] = []
    const startedAt = Date.now()
    const record = (name: string, detail?: string) =>
      events.push({ name, atMs: Date.now() - startedAt, ...(detail ? { detail } : {}) })

    rec.lang = opts.lang ?? lang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    return new Promise<ListenResult>((resolve, reject) => {
      let settled = false
      let transcript = ''
      let sawFinal = false
      let rawError: string | null = null

      // decide() runs after abort()/end have been handled and returns the result or throws the SttError.
      const finish = (doAbort: boolean, decide: (endNotSeen: boolean) => ListenResult) => {
        if (settled) return
        settled = true
        watchdog.stop()
        void (async () => {
          let endNotSeen = false
          if (!inst.ended) {
            if (doAbort) {
              record('js:abort()')
              safeAbort(rec)
            }
            endNotSeen = !(await waitEnded(inst))
          }
          try {
            resolve(decide(endNotSeen))
          } catch (e) {
            reject(e)
          }
        })()
      }

      const watchdog = createWatchdog((rule) => {
        record('js:watchdog', rule)
        finish(true, (endNotSeen) => {
          if (transcript.trim()) return { transcript: transcript.trim(), partial: true, events: events.slice(), ruleFired: rule, endNotSeen }
          throw new SttError('timeout', events.slice(), rule, endNotSeen)
        })
      }, deps.watchdog)

      token.abort = () =>
        finish(true, (endNotSeen) => {
          throw new SttError('aborted', events.slice(), undefined, endNotSeen)
        })

      // Handlers go quiet once settled; only `end` is still tracked, so we know when the mic is free.
      const mark = (name: string, extra?: () => void) => () => {
        if (settled) return
        record(name)
        extra?.()
      }
      rec.onstart = mark('start')
      rec.onaudiostart = mark('audiostart', () => watchdog.audiostart())
      rec.onsoundstart = mark('soundstart')
      rec.onspeechstart = mark('speechstart')
      rec.onspeechend = mark('speechend')
      rec.onsoundend = mark('soundend')
      rec.onaudioend = mark('audioend', () => watchdog.audioend())
      rec.onnomatch = mark('nomatch')
      rec.onresult = (e) => {
        if (settled) return
        let text = ''
        let latestFinal = false
        for (let i = 0; i < e.results.length; i++) {
          text += (i ? ' ' : '') + e.results[i][0].transcript
          latestFinal = e.results[i].isFinal
          if (latestFinal) sawFinal = true
        }
        transcript = text
        record('result', latestFinal ? 'final' : 'interim')
        watchdog.result()
      }
      rec.onerror = (e) => {
        if (settled) return
        record('error', e.error)
        rawError = e.error
        finish(false, (endNotSeen) => {
          throw new SttError(mapSttErrorCode(e.error), events.slice(), undefined, endNotSeen)
        })
      }
      rec.onend = () => {
        inst.ended = true
        inst.waiters.splice(0).forEach((w) => w())
        if (settled && !events.some((x) => x.name === 'end')) record('end')
        if (settled) return
        record('end')
        finish(false, (endNotSeen) => {
          if (rawError) throw new SttError(mapSttErrorCode(rawError), events.slice(), undefined, endNotSeen)
          if (transcript.trim()) return { transcript: transcript.trim(), partial: !sawFinal, events: events.slice(), endNotSeen }
          throw new SttError('no-speech', events.slice(), undefined, endNotSeen)
        })
      }

      try {
        record('js:start()')
        rec.start()
        watchdog.start()
      } catch {
        finish(false, (endNotSeen) => {
          throw new SttError('other', events.slice(), undefined, endNotSeen)
        })
      }
    })
  }

  return {
    isSupported: () => create !== null,

    /** One fresh recognition session. Rejects with SttError; the events are on the error and the result. */
    async listen(opts: { lang?: string } = {}): Promise<ListenResult> {
      if (active || isSpeaking()) throw new SttError('busy')
      const token: Active = { cancelled: false, abort: () => {} }
      token.abort = () => {
        token.cancelled = true
      }
      active = token
      try {
        return await run(opts, token)
      } finally {
        if (active === token) active = null
      }
    },

    /** Stops the session in progress, if any; its listen() rejects with kind "aborted". */
    abortActive(): void {
      active?.abort()
    },
  }
}

export type Stt = ReturnType<typeof createStt>
