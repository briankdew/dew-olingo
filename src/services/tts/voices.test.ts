import { describe, expect, it } from 'vitest'
import { dedupeVoices, hasMexicanVoice, pickVoice, rankVoices, voiceId } from './voices'
import { fakeVoice } from './testing'

describe('dedupeVoices', () => {
  it('keeps one copy of each voice when the list repeats three times (iPhone)', () => {
    const base = [fakeVoice('paulina', 'es-MX'), fakeVoice('monica', 'es-ES'), fakeVoice('alex', 'en-US')]
    const out = dedupeVoices([...base, ...base, ...base])
    expect(out.map((v) => v.voiceURI)).toEqual(['paulina', 'monica', 'alex'])
  })

  it('falls back to name+lang when the voiceURI is empty', () => {
    const a = { ...fakeVoice('', 'es-MX'), name: 'Paulina' }
    const b = { ...fakeVoice('', 'es-ES'), name: 'Monica' }
    expect(dedupeVoices([a, a, b])).toEqual([a, b])
  })
})

describe('rankVoices', () => {
  it('orders es-MX, es-US, es, es-ES and drops non-Spanish voices', () => {
    const list = [
      fakeVoice('a', 'es-ES'),
      fakeVoice('b', 'en-US'),
      fakeVoice('c', 'es'),
      fakeVoice('d', 'es-US'),
      fakeVoice('e', 'es-MX'),
      fakeVoice('f', 'es-AR'),
    ]
    expect(rankVoices(list).map((v) => v.voiceURI)).toEqual(['e', 'd', 'c', 'a', 'f'])
  })

  it('treats es_MX like es-MX, and prefers local voices within a language', () => {
    const list = [fakeVoice('net', 'es-MX', false), fakeVoice('loc', 'es_MX', true)]
    expect(rankVoices(list).map((v) => v.voiceURI)).toEqual(['loc', 'net'])
  })

  it('a Chromebook-shaped list (no es-MX) picks es-US first and reports no Mexican voice', () => {
    const ranked = rankVoices([fakeVoice('1', 'es-ES'), fakeVoice('2', 'es-US'), fakeVoice('3', 'es')])
    expect(pickVoice('', ranked)?.voiceURI).toBe('2')
    expect(hasMexicanVoice(ranked)).toBe(false)
  })
})

describe('pickVoice', () => {
  const ranked = rankVoices([fakeVoice('mx', 'es-MX'), fakeVoice('es', 'es-ES')])
  it('returns the saved voice when it still exists', () => expect(pickVoice('es', ranked)?.voiceURI).toBe('es'))
  it('falls back to the top-ranked voice when the saved one has vanished', () =>
    expect(pickVoice('gone', ranked)?.voiceURI).toBe('mx'))
  it('tells voices with empty voiceURIs apart by name+lang', () => {
    const a = { ...fakeVoice('', 'es-MX'), name: 'Paulina' }
    const b = { ...fakeVoice('', 'es-MX'), name: 'Juan' }
    const two = rankVoices([a, b])
    expect(voiceId(b)).toBe('Juan|es-MX')
    expect(pickVoice(voiceId(b), two)).toBe(b)
    expect(pickVoice(voiceId(a), two)).toBe(a)
  })
  it('returns undefined with no Spanish voices', () => expect(pickVoice('x', [])).toBeUndefined())
})
