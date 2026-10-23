import type { Stt } from './stt/stt'
import { SttError, type SttEvent } from './stt/stt'
import { sttMessage } from './stt/errors'
import { formatEventList } from './stt/format'
import type { Tts } from './tts/tts'
import type { VoiceLike } from './tts/voices'
import type { WatchdogRule } from './stt/watchdog'

export interface SelfTestRow {
  part: 'A' | 'B'
  step: 'speak' | 'listen'
  label: string
  ok: boolean
  /** Transcript on success, user-facing message on failure. */
  text: string
  events: SttEvent[]
  ruleFired?: WatchdogRule
  endNotSeen: boolean
}

const partAPrompt = (n: number) => `Test ${n} of 4 (Part A, listen). Say a short Spanish phrase now.`

export const SAMPLE_PHRASE = 'Hola, ¿cómo estás?'

/**
 * Part A: listen, listen (no TTS between), to tell a per-tap hang from TTS interference.
 * Part B: speak, listen, speak, listen. Every listen is attempted even after a failure.
 * Aborting `signal` stops before the next step (the caller aborts the live adapters). `prompt` tells the user what to do before each step; each row is reported as soon as it ends.
 */
export async function runSelfTest(
  speech: { stt: Stt; tts: Tts },
  opts: { voice?: VoiceLike; prompt: (text: string) => void; onRow: (row: SelfTestRow) => void; signal?: AbortSignal },
): Promise<SelfTestRow[]> {
  const rows: SelfTestRow[] = []
  const listen = async (part: 'A' | 'B', label: string) => {
    if (opts.signal?.aborted) return
    let row: SelfTestRow
    try {
      const r = await speech.stt.listen()
      row = { part, step: 'listen', label, ok: true, text: r.transcript, events: r.events, ruleFired: r.ruleFired, endNotSeen: r.endNotSeen }
    } catch (e) {
      row =
        e instanceof SttError
          ? { part, step: 'listen', label, ok: false, text: sttMessage(e.kind, 'panel'), events: e.events, ruleFired: e.ruleFired, endNotSeen: e.endNotSeen }
          : { part, step: 'listen', label, ok: false, text: 'Unexpected error.', events: [], endNotSeen: false }
    }
    if (opts.signal?.aborted) return
    rows.push(row)
    opts.onRow(row)
  }

  opts.prompt(partAPrompt(1))
  await listen('A', 'A1 listen')
  if (opts.signal?.aborted) return rows
  opts.prompt(partAPrompt(2))
  await listen('A', 'A2 listen')

  for (const n of [1, 2]) {
    if (opts.signal?.aborted) return rows
    opts.prompt(`Test ${n + 2} of 4 (Part B): the app is speaking. Wait for it to finish, then say a short phrase.`)
    try {
      await speech.tts.speak(SAMPLE_PHRASE, opts.voice)
    } catch (e) {
      if (opts.signal?.aborted) return rows
      const text = e instanceof Error ? e.message : 'Speech output failed.'
      const row: SelfTestRow = { part: 'B', step: 'speak', label: `B${n} speak`, ok: false, text, events: [], endNotSeen: false }
      rows.push(row)
      opts.onRow(row)
    }
    if (opts.signal?.aborted) return rows
    opts.prompt(`Test ${n + 2} of 4 (Part B, listen). Say a short Spanish phrase now.`)
    await listen('B', `B${n} listen`)
  }
  if (!opts.signal?.aborted) opts.prompt('Done.')
  return rows
}

export interface SelfTestSummary {
  aPassed: number
  bPassed: number
  line: string
  text: string
}

/** Counts passed listens per part; a Part B listen whose speak step failed does not pass. */
export function summarizeSelfTest(rows: SelfTestRow[]): SelfTestSummary {
  // A Part B round counts only if its speak step also worked; otherwise nothing was tested after playback.
  const speakFailed = (label: string) => rows.some((r) => r.step === 'speak' && !r.ok && r.label.slice(0, 2) === label.slice(0, 2))
  const passed = (part: 'A' | 'B') => rows.filter((r) => r.part === part && r.step === 'listen' && r.ok && !speakFailed(r.label)).length
  const aPassed = passed('A')
  const bPassed = passed('B')
  const aOk = aPassed === 2
  const bOk = bPassed === 2
  const line = aOk && bOk
    ? 'No problems found.'
    : !aOk && bOk
      ? 'Listening twice in a row has a problem on this device.'
      : aOk && !bOk
        ? 'Listening right after the app speaks has a problem on this device.'
        : 'Both problems appeared.'
  return { aPassed, bPassed, line, text: `Part A: ${aPassed} of 2 passed. Part B: ${bPassed} of 2 passed.` }
}

/** The label the voice picker shows for a voice. */
export function voiceLabel(v: VoiceLike | undefined): string {
  return v ? `${v.name} (${v.lang}, ${v.localService ? 'on device' : 'network'})` : 'default voice'
}

/** Plain text for the Copy results button: summary, voice, then each row with its event list. */
export function buildReport(rows: SelfTestRow[], voice: VoiceLike | undefined): string {
  const sum = summarizeSelfTest(rows)
  const out = [sum.text, sum.line, `Voice used: ${voiceLabel(voice)}`, '', 'Troubleshooting events; times are milliseconds after the mic started.']
  for (const r of rows) {
    out.push('', `${r.label}: ${r.ok ? 'pass' : 'FAIL'} ${r.text}`)
    out.push(...formatEventList(r.events, r.ruleFired, r.endNotSeen))
  }
  return out.join('\n')
}
