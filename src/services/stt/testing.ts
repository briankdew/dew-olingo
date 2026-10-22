import type { RecognitionEventLike, RecognitionLike } from './stt'

/** Test double for a recognition engine. Events are emitted by the test; nothing happens on its own. */
export class FakeRecognition implements RecognitionLike {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  onsoundstart: (() => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  onsoundend: (() => void) | null = null
  onaudioend: (() => void) | null = null
  onnomatch: (() => void) | null = null
  onresult: ((e: RecognitionEventLike) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  startCalls = 0
  abortCalls = 0
  private results: { isFinal: boolean; length: number; 0: { transcript: string } }[] = []

  constructor(private readonly factory: FakeRecognitionFactory) {}

  start() {
    this.startCalls++
    if (this.factory.startThrows) throw new Error('InvalidStateError')
    this.factory.onStart?.(this)
  }
  stop() {}
  abort() {
    this.abortCalls++
    if (this.factory.endAfterAbortMs !== null) setTimeout(() => this.onend?.(), this.factory.endAfterAbortMs)
  }

  emitStart() {
    this.onstart?.()
  }
  audiostart() {
    this.onaudiostart?.()
  }
  audioend() {
    this.onaudioend?.()
  }
  /** Adds or replaces the latest result, like a real engine's growing results list. */
  result(transcript: string, isFinal: boolean, replaceLast = false) {
    if (replaceLast) this.results.pop()
    this.results.push({ isFinal, length: 1, 0: { transcript } })
    this.onresult?.({ resultIndex: this.results.length - 1, results: this.results as unknown as RecognitionEventLike['results'] })
  }
  error(code: string) {
    this.onerror?.({ error: code })
  }
  end() {
    this.onend?.()
  }
}

export class FakeRecognitionFactory {
  instances: FakeRecognition[] = []
  /** Delay before `end` follows abort(); null means abort() never produces an `end`. */
  endAfterAbortMs: number | null = 0
  startThrows = false
  /** Called from start(); schedule the session's events here (use setTimeout so they come after start() returns). */
  onStart: ((r: FakeRecognition) => void) | null = null
  create = () => {
    const r = new FakeRecognition(this)
    this.instances.push(r)
    return r
  }
  get last() {
    return this.instances[this.instances.length - 1]
  }
}
