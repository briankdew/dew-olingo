import type { SynthLike, UtteranceLike } from './tts'
import type { VoiceLike } from './voices'

export class FakeUtterance implements UtteranceLike {
  voice: unknown = null
  lang = ''
  onend: (() => void) | null = null
  onerror: ((e: { error?: string }) => void) | null = null
  constructor(public readonly text: string) {}
}

/** Test double for speechSynthesis. Playback ends only when the test calls finish(). */
export class FakeSynth implements SynthLike {
  voices: (VoiceLike & { default?: boolean })[] = []
  spoken: FakeUtterance[] = []
  cancelCalls = 0
  /** When set, each utterance ends this many ms after speak(). */
  autoFinishMs: number | null = null
  private listeners = new Set<() => void>()

  getVoices() {
    return this.voices
  }
  speak(u: UtteranceLike) {
    this.spoken.push(u as FakeUtterance)
    if (this.autoFinishMs !== null) setTimeout(() => u.onend?.(), this.autoFinishMs)
  }
  cancel() {
    this.cancelCalls++
  }
  addEventListener(_type: 'voiceschanged', fn: () => void) {
    this.listeners.add(fn)
  }
  removeEventListener(_type: 'voiceschanged', fn: () => void) {
    this.listeners.delete(fn)
  }
  fireVoicesChanged() {
    this.listeners.forEach((fn) => fn())
  }
  get listenerCount() {
    return this.listeners.size
  }
  finish() {
    this.spoken[this.spoken.length - 1]?.onend?.()
  }
}

export const fakeVoice = (voiceURI: string, lang: string, localService = true, name = voiceURI): VoiceLike => ({
  voiceURI,
  name,
  lang,
  localService,
})
