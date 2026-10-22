import type { Stt } from './stt/stt'
import { SttError, type SttEvent } from './stt/stt'
import type { Tts } from './tts/tts'
import type { VoiceLike } from './tts/voices'
import type { WatchdogRule } from './stt/watchdog'

export interface SelfTestRow {
  part: 'A' | 'B'
  label: string
  ok: boolean
  /** Transcript on success, user-facing message on failure. */
  text: string
  events: SttEvent[]
  ruleFired?: WatchdogRule
  endNotSeen: boolean
}

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
      row = { part, label, ok: true, text: r.transcript, events: r.events, ruleFired: r.ruleFired, endNotSeen: r.endNotSeen }
    } catch (e) {
      row =
        e instanceof SttError
          ? { part, label, ok: false, text: e.message, events: e.events, ruleFired: e.ruleFired, endNotSeen: e.endNotSeen }
          : { part, label, ok: false, text: 'Unexpected error.', events: [], endNotSeen: false }
    }
    if (opts.signal?.aborted) return
    rows.push(row)
    opts.onRow(row)
  }

  opts.prompt('Part A, listen 1 of 2: say something now.')
  await listen('A', 'A1 listen')
  if (opts.signal?.aborted) return rows
  opts.prompt('Part A, listen 2 of 2: say something again.')
  await listen('A', 'A2 listen')

  for (const n of [1, 2]) {
    if (opts.signal?.aborted) return rows
    opts.prompt(`Part B, round ${n} of 2: the voice is speaking.`)
    try {
      await speech.tts.speak(SAMPLE_PHRASE, opts.voice)
    } catch (e) {
      if (opts.signal?.aborted) return rows
      const text = e instanceof Error ? e.message : 'Speech output failed.'
      const row: SelfTestRow = { part: 'B', label: `B${n} speak`, ok: false, text, events: [], endNotSeen: false }
      rows.push(row)
      opts.onRow(row)
    }
    if (opts.signal?.aborted) return rows
    opts.prompt(`Part B, round ${n} of 2: say something now.`)
    await listen('B', `B${n} listen`)
  }
  if (!opts.signal?.aborted) opts.prompt('Done.')
  return rows
}
