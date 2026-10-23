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
    const out = buildReport(rows([true, true], [true, false]), { voiceURI: 'v', name: 'Paulina', lang: 'es-MX', localService: true })
    expect(out).toContain('Part A: 2 of 2 passed. Part B: 1 of 2 passed.')
    expect(out).toContain('Voice used: Paulina (es-MX, on device)')
    expect(out).toContain('Troubleshooting events; times are milliseconds after the mic started.')
    expect(out.match(/audiostart/g)).toHaveLength(4)
  })
})
