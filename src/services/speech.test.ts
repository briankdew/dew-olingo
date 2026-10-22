import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSpeech } from './speech'
import { runSelfTest, type SelfTestRow } from './speechSelfTest'
import { SttError } from './stt/stt'
import { FakeRecognitionFactory, type FakeRecognition } from './stt/testing'
import { FakeSynth, FakeUtterance } from './tts/testing'

const run = (ms: number) => vi.advanceTimersByTimeAsync(ms)
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value }), (error: unknown) => ({ error }))

let f: FakeRecognitionFactory
let synth: FakeSynth
const make = () =>
  createSpeech({
    stt: { createRecognition: f.create },
    tts: { synth, createUtterance: (t) => new FakeUtterance(t) },
  })
const good = (r: FakeRecognition) => {
  setTimeout(() => r.emitStart(), 5)
  setTimeout(() => r.audiostart(), 10)
  setTimeout(() => r.result('hola', false), 50)
  setTimeout(() => r.result('hola', true, true), 80)
  setTimeout(() => r.audioend(), 90)
  setTimeout(() => r.end(), 100)
}

beforeEach(() => {
  vi.useFakeTimers()
  f = new FakeRecognitionFactory()
  synth = new FakeSynth()
})
afterEach(() => vi.useRealTimers())

describe('speech wiring', () => {
  it('speak, listen, speak, listen: four calls in order, two different fresh sessions', async () => {
    f.onStart = good
    synth.autoFinishMs = 20
    const { stt, tts } = make()
    const order: string[] = []
    for (const n of [1, 2]) {
      await run(0)
      const s = tts.speak('hola').then(() => order.push(`speak${n}`))
      await run(30)
      await s
      const l = stt.listen().then(() => order.push(`listen${n}`))
      await run(200)
      await l
    }
    expect(order).toEqual(['speak1', 'listen1', 'speak2', 'listen2'])
    expect(f.instances).toHaveLength(2)
    expect(f.instances[0]).not.toBe(f.instances[1])
  })

  it('listen() is refused while the utterance plays, and allowed after it ends', async () => {
    const { stt, tts } = make()
    void tts.speak('hola')
    await expect(stt.listen()).rejects.toMatchObject({ kind: 'busy' })
    synth.finish()
    await run(0)
    f.onStart = good
    const l = stt.listen()
    await run(200)
    await l
  })

  it('speak() aborts a live recognition session', async () => {
    f.onStart = (r) => setTimeout(() => r.audiostart(), 10)
    const { stt, tts } = make()
    const l = settle(stt.listen())
    await run(100)
    void tts.speak('hola')
    await run(10)
    expect(f.last.abortCalls).toBe(1)
    expect(((await l) as { error: SttError }).error.kind).toBe('aborted')
  })

  it('TTS then a silent session (iPad failure shape): listen times out and the session is aborted', async () => {
    synth.autoFinishMs = 20
    const { stt, tts } = make()
    const s = tts.speak('hola')
    await run(30)
    await s
    const l = settle(stt.listen())
    await run(20_000)
    await run(10)
    const e = ((await l) as { error: SttError }).error
    expect(e.kind).toBe('timeout')
    expect(f.last.abortCalls).toBe(1)
  })
})

describe('runSelfTest()', () => {
  it('runs Part A (listen, listen) then Part B (speak, listen, speak, listen) and keeps every event list', async () => {
    f.onStart = good
    synth.autoFinishMs = 20
    const speech = make()
    const rows: SelfTestRow[] = []
    const prompts: string[] = []
    const p = runSelfTest(speech, { prompt: (t) => prompts.push(t), onRow: (r) => rows.push(r) })
    await run(2_000)
    const all = await p
    expect(all.map((r) => r.label)).toEqual(['A1 listen', 'A2 listen', 'B1 listen', 'B2 listen'])
    expect(all.every((r) => r.ok && r.text === 'hola')).toBe(true)
    expect(rows).toHaveLength(4)
    expect(all.every((r) => r.events.some((e) => e.name === 'result') && r.events.at(-1)?.name === 'end')).toBe(true)
    const names = all[0].events.map((e) => e.name)
    expect(names.indexOf('result')).toBeLessThan(names.indexOf('audioend'))
    expect(f.instances).toHaveLength(4)
    expect(synth.spoken).toHaveLength(2)
    expect(prompts.at(-1)).toBe('Done.')
  })

  it('stops before the next step once the signal is aborted', async () => {
    f.onStart = good
    synth.autoFinishMs = 20
    const ctl = new AbortController()
    const rows: SelfTestRow[] = []
    const p = runSelfTest(make(), {
      prompt: () => {},
      signal: ctl.signal,
      onRow: (r) => {
        rows.push(r)
        if (rows.length === 1) ctl.abort()
      },
    })
    await run(5_000)
    await p
    expect(rows).toHaveLength(1)
    expect(f.instances).toHaveLength(1)
    expect(synth.spoken).toHaveLength(0)
  })

  it('a failing listen keeps its events and rule, and the test carries on to the next step', async () => {
    let n = 0
    f.onStart = (r) => (++n === 1 ? setTimeout(() => r.audiostart(), 10) : good(r))
    synth.autoFinishMs = 20
    const p = runSelfTest(make(), { prompt: () => {}, onRow: () => {} })
    await run(60_000)
    const all = await p
    expect(all[0]).toMatchObject({ ok: false, label: 'A1 listen', ruleFired: 'W1' })
    expect(all[0].events.map((e) => e.name)).toEqual(['js:start()', 'audiostart', 'js:watchdog', 'js:abort()', 'end'])
    expect(all.slice(1).every((r) => r.ok)).toBe(true)
  })
})
