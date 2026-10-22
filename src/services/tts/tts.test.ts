import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTts } from './tts'
import { FakeSynth, FakeUtterance, fakeVoice } from './testing'

let synth: FakeSynth
const make = (extra = {}) => createTts({ synth, createUtterance: (t) => new FakeUtterance(t), ...extra })

beforeEach(() => {
  vi.useFakeTimers()
  synth = new FakeSynth()
})
afterEach(() => vi.useRealTimers())

describe('speak()', () => {
  it('stays pending, and isSpeaking stays true, until the utterance really ends', async () => {
    const tts = make()
    let done = false
    const p = tts.speak('hola', fakeVoice('p', 'es-MX')).then((o) => {
      done = true
      return o
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(done).toBe(false)
    expect(tts.isSpeaking()).toBe(true)
    synth.finish()
    expect(await p).toBe('ended')
    expect(tts.isSpeaking()).toBe(false)
    expect(synth.spoken[0].lang).toBe('es-MX')
    expect((synth.spoken[0].voice as { voiceURI: string }).voiceURI).toBe('p')
  })

  it('cancel() resolves the pending speak as cancelled', async () => {
    const tts = make()
    const p = tts.speak('hola')
    tts.cancel()
    expect(await p).toBe('cancelled')
    expect(tts.isSpeaking()).toBe(false)
  })

  it('treats the browser "interrupted" error as a cancel and other errors as failures', async () => {
    const tts = make()
    const a = tts.speak('uno')
    synth.spoken[0].onerror?.({ error: 'interrupted' })
    expect(await a).toBe('cancelled')
    const b = tts.speak('dos')
    synth.spoken[1].onerror?.({ error: 'synthesis-failed' })
    await expect(b).rejects.toThrow(/synthesis-failed/)
    expect(tts.isSpeaking()).toBe(false)
  })

  it('runs beforeSpeak first (used to stop a live recognition session)', async () => {
    const order: string[] = []
    const tts = make({ beforeSpeak: () => order.push(`before:${synth.spoken.length}`) })
    void tts.speak('hola')
    expect(order).toEqual(['before:0'])
  })

  it('rejects when there is no speech synthesis', async () => {
    await expect(createTts({ synth: null }).speak('hola')).rejects.toThrow(/not available/)
  })
})

describe('voice loading', () => {
  it('loadVoices waits for voiceschanged when the list is empty', async () => {
    const tts = make()
    const p = tts.loadVoices()
    synth.voices = [fakeVoice('a', 'es-MX')]
    synth.fireVoicesChanged()
    expect((await p).map((v) => v.voiceURI)).toEqual(['a'])
    expect(synth.listenerCount).toBe(0)
  })

  it('loadVoices gives up after the wait cap and returns what it has', async () => {
    const tts = make({ voicesWaitMs: 2000 })
    const p = tts.loadVoices()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await p).toEqual([])
  })

  it('watchVoices sees the list grow (iPad went from 2 to 4 Spanish voices) and unsubscribes', () => {
    const tts = make()
    const seen: number[] = []
    synth.voices = [fakeVoice('a', 'es-MX'), fakeVoice('b', 'es-ES')]
    const stop = tts.watchVoices((v) => seen.push(v.length))
    synth.voices = [...synth.voices, fakeVoice('c', 'es-MX'), fakeVoice('d', 'es-ES')]
    synth.fireVoicesChanged()
    expect(seen).toEqual([2, 4])
    stop()
    expect(synth.listenerCount).toBe(0)
  })
})
