import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STT_MESSAGES, mapSttErrorCode, sttMessage } from './errors'
import { formatEventList } from './format'
import { SttError, createStt, type ListenResult } from './stt'
import { FakeRecognitionFactory } from './testing'

const run = (ms: number) => vi.advanceTimersByTimeAsync(ms)
const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value }) as { value: T; error?: undefined },
    (error: unknown) => ({ error }) as { value?: undefined; error: unknown },
  )

let f: FakeRecognitionFactory
beforeEach(() => {
  vi.useFakeTimers()
  f = new FakeRecognitionFactory()
})
afterEach(() => vi.useRealTimers())

/** A normal session: start, audiostart, interim, final, audioend, end. */
const goodSession = (text = 'hola') =>
  (f.onStart = (r) => {
    setTimeout(() => r.emitStart(), 10)
    setTimeout(() => r.audiostart(), 20)
    setTimeout(() => r.result(text.slice(0, 2), false), 100)
    setTimeout(() => r.result(text, true, true), 200)
    setTimeout(() => r.audioend(), 210)
    setTimeout(() => r.end(), 220)
  })

describe('listen()', () => {
  it('returns the transcript and a timestamped event list with results before audioend', async () => {
    goodSession()
    const stt = createStt({ createRecognition: f.create })
    const p = stt.listen()
    await run(300)
    const r = (await p) as ListenResult
    expect(r.transcript).toBe('hola')
    expect(r.partial).toBe(false)
    expect(r.events.map((e) => e.name)).toEqual(['js:start()', 'start', 'audiostart', 'result', 'result', 'audioend', 'end'])
    expect(r.events.map((e) => e.detail)).toEqual([undefined, undefined, undefined, 'interim', 'final', undefined, undefined])
    expect(r.events[5].atMs).toBe(210)
    expect(f.last.lang).toBe('es-MX')
  })

  it('uses a fresh recognition instance for every call and never reuses one', async () => {
    goodSession()
    const stt = createStt({ createRecognition: f.create })
    for (let i = 0; i < 2; i++) {
      const p = stt.listen()
      await run(300)
      await p
    }
    expect(f.instances).toHaveLength(2)
    expect(f.instances[0]).not.toBe(f.instances[1])
    expect(f.instances.map((r) => r.startCalls)).toEqual([1, 1])
  })

  it('refuses with busy while TTS is speaking or another session is active', async () => {
    let speaking = true
    const stt = createStt({ createRecognition: f.create, isSpeaking: () => speaking })
    await expect(stt.listen()).rejects.toMatchObject({ kind: 'busy' })
    expect(f.instances).toHaveLength(0)
    speaking = false
    goodSession()
    const first = stt.listen()
    await expect(stt.listen()).rejects.toMatchObject({ kind: 'busy' })
    await run(300)
    await first
  })

  it('reports unsupported when there is no engine', async () => {
    const stt = createStt({ createRecognition: null })
    expect(stt.isSupported()).toBe(false)
    await expect(stt.listen()).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('maps the Chrome offline error "network" to offline, then end', async () => {
    f.onStart = (r) => {
      setTimeout(() => r.error('network'), 300)
      setTimeout(() => r.end(), 310)
    }
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(400)
    const { error } = await p
    expect(error).toBeInstanceOf(SttError)
    expect((error as SttError).kind).toBe('offline')
    expect((error as SttError).message).toBe(STT_MESSAGES.offline)
    expect((error as SttError).events.map((e) => e.name)).toContain('end')
  })

  it('maps permission, no-speech and unknown codes', () => {
    expect(mapSttErrorCode('not-allowed')).toBe('permission')
    expect(mapSttErrorCode('service-not-allowed')).toBe('permission')
    expect(mapSttErrorCode('no-speech')).toBe('no-speech')
    expect(mapSttErrorCode('audio-capture')).toBe('other')
  })

  it('a natural end with no result is no-speech, not a timeout', async () => {
    f.onStart = (r) => {
      setTimeout(() => r.audiostart(), 10)
      setTimeout(() => r.audioend(), 20)
      setTimeout(() => r.end(), 30)
    }
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(100)
    expect(((await p).error as SttError).kind).toBe('no-speech')
  })

  it('start() throwing is reported as an error, not left hanging', async () => {
    f.startThrows = true
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(2_000)
    expect(((await p).error as SttError).kind).toBe('other')
  })
})

describe('watchdog inside listen()', () => {
  it('a silent session after audiostart times out (W1), aborts the instance and ignores late events', async () => {
    f.endAfterAbortMs = 500
    f.onStart = (r) => setTimeout(() => r.audiostart(), 50)
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(10_050)
    expect(f.last.abortCalls).toBe(1)
    await run(500)
    const { error } = await p
    const e = error as SttError
    expect(e.kind).toBe('timeout')
    expect(e.ruleFired).toBe('W1')
    expect(e.endNotSeen).toBe(false)
    const seen = e.events.length
    f.last.result('too late', true)
    expect(e.events).toHaveLength(seen)
  })

  it('a session that never opens audio times out at 20 s (W0), the iPad silent-after-TTS shape', async () => {
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(20_000)
    await run(500)
    const e = (await p).error as SttError
    expect(e.kind).toBe('timeout')
    expect(e.ruleFired).toBe('W0')
    expect(e.events.map((x) => x.name)).toEqual(['js:start()', 'js:watchdog', 'js:abort()', 'end'])
  })

  it('audioend with no result times out 5 s later (W3)', async () => {
    f.onStart = (r) => {
      setTimeout(() => r.audiostart(), 10)
      setTimeout(() => r.audioend(), 2_010)
    }
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(7_010)
    await run(100)
    expect(((await p).error as SttError).ruleFired).toBe('W3')
  })

  it('keeps text that already arrived when the watchdog fires (partial)', async () => {
    f.onStart = (r) => {
      setTimeout(() => r.audiostart(), 10)
      setTimeout(() => r.result('quiero un', false), 1_000)
    }
    const p = settle(createStt({ createRecognition: f.create }).listen())
    await run(11_010)
    await run(100)
    const v = (await p).value as ListenResult
    expect(v.transcript).toBe('quiero un')
    expect(v.partial).toBe(true)
    expect(v.ruleFired).toBe('W2')
  })

  it('waits for the old instance end before the next session; gives up after the cap', async () => {
    f.endAfterAbortMs = null // abort() never produces an end
    const stt = createStt({ createRecognition: f.create })
    const first = settle(stt.listen())
    await run(20_000)
    await run(1_499)
    expect(f.instances).toHaveLength(1)
    await run(1)
    const e = (await first).error as SttError
    expect(e.endNotSeen).toBe(true)
    expect(formatEventList(e.events, e.ruleFired, e.endNotSeen)).toContain('end event not seen after abort')

    f.endAfterAbortMs = 500
    f.onStart = (r) => setTimeout(() => r.audiostart(), 10)
    const second = settle(stt.listen())
    await run(499)
    expect(f.instances).toHaveLength(1) // still waiting for the first instance's end
    await run(1)
    await run(1)
    expect(f.instances).toHaveLength(2)
    await run(30_000)
    await second
  })
})

describe('abortActive()', () => {
  it('stops the live session and rejects with aborted', async () => {
    f.onStart = (r) => setTimeout(() => r.audiostart(), 10)
    const stt = createStt({ createRecognition: f.create })
    const p = settle(stt.listen())
    await run(100)
    stt.abortActive()
    await run(10)
    expect(f.last.abortCalls).toBe(1)
    expect(((await p).error as SttError).kind).toBe('aborted')
  })
})

describe('formatEventList()', () => {
  it('prints timestamps, details and the rule fired', () => {
    const lines = formatEventList(
      [
        { name: 'start', atMs: 12 },
        { name: 'result', atMs: 840, detail: 'interim' },
      ],
      'W1',
    )
    expect(lines).toEqual(['    12 ms  start', '   840 ms  result (interim)', 'watchdog rule fired: W1'])
  })
})

describe('sttMessage contexts', () => {
  it('conversation wording is unchanged and mentions typing', () => {
    expect(sttMessage('offline')).toBe('Speech recognition needs an internet connection and could not reach it. Type your answer instead.')
    expect(sttMessage('timeout', 'conversation')).toBe('No speech was detected in time. Try again, or type your answer.')
    expect(sttMessage('no-speech')).toBe("I didn't hear anything. Try again, or type your answer.")
    expect(sttMessage('other')).toBe('Speech recognition failed. Try again, or type your answer.')
  })
  it('panel wording never mentions typing and retry messages end with Tap Listen to try again.', () => {
    for (const k of ['offline', 'permission', 'timeout', 'no-speech', 'unsupported', 'busy', 'aborted', 'other'] as const) {
      expect(sttMessage(k, 'panel')).not.toMatch(/type|text box/i)
    }
    for (const k of ['offline', 'timeout', 'no-speech', 'other'] as const) {
      expect(sttMessage(k, 'panel').endsWith('Tap Listen to try again.')).toBe(true)
    }
  })
})
