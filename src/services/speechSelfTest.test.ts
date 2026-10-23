import { describe, expect, it } from 'vitest'
import { buildReport, summarizeSelfTest, type SelfTestRow } from './speechSelfTest'

const row = (part: 'A' | 'B', n: number, ok: boolean): SelfTestRow => ({
  part,
  step: 'listen',
  label: `${part}${n} listen`,
  ok,
  text: ok ? 'hola' : 'No speech was detected in time. Tap Listen to try again.',
  events: [{ name: 'audiostart', atMs: 20 }],
  endNotSeen: false,
})

const rows = (a: boolean[], b: boolean[]) => [...a.map((ok, i) => row('A', i + 1, ok)), ...b.map((ok, i) => row('B', i + 1, ok))]

describe('summarizeSelfTest', () => {
  it('both pass', () => {
    const s = summarizeSelfTest(rows([true, true], [true, true]))
    expect(s.text).toBe('Part A: 2 of 2 passed. Part B: 2 of 2 passed.')
    expect(s.line).toBe('No problems found.')
  })
  it('A fails, B passes', () => {
    const s = summarizeSelfTest(rows([true, false], [true, true]))
    expect(s.text).toBe('Part A: 1 of 2 passed. Part B: 2 of 2 passed.')
    expect(s.line).toBe('Listening twice in a row has a problem on this device.')
  })
  it('A passes, B fails', () => {
    const s = summarizeSelfTest(rows([true, true], [false, true]))
    expect(s.text).toBe('Part A: 2 of 2 passed. Part B: 1 of 2 passed.')
    expect(s.line).toBe('Listening right after the app speaks has a problem on this device.')
  })
  it('both fail', () => {
    const s = summarizeSelfTest(rows([false, false], [false, false]))
    expect(s.text).toBe('Part A: 0 of 2 passed. Part B: 0 of 2 passed.')
    expect(s.line).toBe('Both problems appeared.')
  })
  it('a Part B round whose speak step failed does not pass', () => {
    const speak: SelfTestRow = { part: 'B', step: 'speak', label: 'B1 speak', ok: false, text: 'x', events: [], endNotSeen: false }
    const s = summarizeSelfTest([...rows([true, true], [true, true]), speak])
    expect(s.text).toBe('Part A: 2 of 2 passed. Part B: 1 of 2 passed.')
    expect(s.line).toBe('Listening right after the app speaks has a problem on this device.')
  })
})

describe('buildReport', () => {
  it('has the summary, voice, caption and every event list', () => {
    const paulina = { voiceURI: 'com.apple.voice.compact.es-MX.Paulina', name: 'Paulina', lang: 'es-MX', localService: true }
    const out = buildReport(rows([true, true], [true, false]), paulina, [
      { voiceURI: 'com.apple.voice.super-compact.es-MX.Paulina', name: 'Paulina', lang: 'es-MX', localService: true },
      paulina,
      { voiceURI: 'net.es', name: 'Google español', lang: 'es-ES', localService: false },
      { voiceURI: 'en', name: 'Alex', lang: 'en-US', localService: true },
    ])
    expect(out).toContain('Part A: 2 of 2 passed. Part B: 1 of 2 passed.')
    expect(out).toContain('Voice used: Paulina (es-MX, on device), voiceURI: com.apple.voice.compact.es-MX.Paulina')
    expect(out).toContain('Troubleshooting events; times are milliseconds after the mic started.')
    expect(out.match(/audiostart/g)).toHaveLength(4)
    expect(out).toContain('All voices reported by the browser (4)')
    expect(out).toContain('com.apple.voice.super-compact.es-MX.Paulina | Paulina | es-MX | local\n')
    expect(out).toContain('com.apple.voice.compact.es-MX.Paulina | Paulina | es-MX | local <- picker')
    expect(out).toContain('net.es | Google español | es-ES | network\n')
    expect(out).toContain('en | Alex | en-US | local')
    expect(out.match(/<- picker/g)).toHaveLength(2) // header text + one marked voice
  })

  it('handles the default voice and an empty voice list', () => {
    const out = buildReport(rows([true, true], [true, true]), undefined)
    expect(out).toContain('Voice used: default voice\n')
    expect(out).toContain('All voices reported by the browser (0)')
  })
})
