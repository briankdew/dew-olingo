import type { VoiceLike } from './voices'

export interface UtteranceLike {
  voice: unknown
  lang: string
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
}

export interface SynthLike {
  getVoices(): (VoiceLike & { default?: boolean })[]
  speak(u: UtteranceLike): void
  cancel(): void
  addEventListener(type: 'voiceschanged', fn: () => void): void
  removeEventListener(type: 'voiceschanged', fn: () => void): void
}

export interface TtsDeps {
  /** Null when the browser has no speech synthesis. */
  synth?: SynthLike | null
  createUtterance?: (text: string) => UtteranceLike
  /** Runs before each utterance; used to stop a live recognition session (TTS takes over the audio session). */
  beforeSpeak?: () => void
  voicesWaitMs?: number
}

export class TtsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TtsError'
  }
}

export type SpeakOutcome = 'ended' | 'cancelled'

const defaultSynth = (): SynthLike | null =>
  typeof speechSynthesis === 'undefined' ? null : (speechSynthesis as unknown as SynthLike)
const defaultUtterance = (text: string) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike

export function createTts(deps: TtsDeps = {}) {
  const synth = deps.synth === undefined ? defaultSynth() : deps.synth
  const createUtterance = deps.createUtterance ?? defaultUtterance
  const voicesWaitMs = deps.voicesWaitMs ?? 2000
  let current: ((o: SpeakOutcome) => void) | null = null

  const cancel = () => {
    synth?.cancel()
    const settle = current
    current = null
    settle?.('cancelled')
  }

  return {
    isSupported: () => synth !== null,

    /** True from speak() until the utterance ends, errors or is cancelled. */
    isSpeaking: () => current !== null,

    cancel,

    /** Settles only when playback has really finished (end), so callers can start listening afterwards. */
    speak(text: string, voice?: VoiceLike): Promise<SpeakOutcome> {
      if (!synth) return Promise.reject(new TtsError('Speech output is not available in this browser.'))
      cancel()
      deps.beforeSpeak?.()
      return new Promise<SpeakOutcome>((resolve, reject) => {
        const u = createUtterance(text)
        u.lang = voice?.lang ?? 'es-MX'
        if (voice) u.voice = voice
        const settle = (o: SpeakOutcome) => {
          if (current === settle) current = null
          resolve(o)
        }
        current = settle
        u.onend = () => settle('ended')
        u.onerror = (e) => {
          if (current !== settle) return
          current = null
          // Chrome reports a cancel() as "interrupted" or "canceled"; that is not a failure.
          if (e.error === 'interrupted' || e.error === 'canceled') resolve('cancelled')
          else reject(new TtsError(`Speech output failed${e.error ? ` (${e.error})` : ''}.`))
        }
        synth.speak(u)
      })
    },

    /** The current voice list, waiting briefly for `voiceschanged` if it is still empty. */
    async loadVoices(): Promise<VoiceLike[]> {
      if (!synth) return []
      if (synth.getVoices().length > 0) return synth.getVoices()
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          synth.removeEventListener('voiceschanged', done)
          resolve()
        }
        const timer = setTimeout(done, voicesWaitMs)
        synth.addEventListener('voiceschanged', done)
      })
      return synth.getVoices()
    },

    /** Calls back with the full list now and on every later change (iPad grew from 2 to 4 Spanish voices). */
    watchVoices(fn: (voices: VoiceLike[]) => void): () => void {
      if (!synth) return () => {}
      const push = () => fn(synth.getVoices())
      push()
      synth.addEventListener('voiceschanged', push)
      return () => synth.removeEventListener('voiceschanged', push)
    },
  }
}

export type Tts = ReturnType<typeof createTts>
