import type { SttEvent } from './stt'
import type { WatchdogRule } from './watchdog'

/** Plain-text lines for the on-device event list, e.g. "  412 ms  result (interim)". */
export function formatEventList(events: SttEvent[], ruleFired?: WatchdogRule, endNotSeen = false): string[] {
  const lines = events.map((e) => `${String(e.atMs).padStart(6)} ms  ${e.name}${e.detail ? ` (${e.detail})` : ''}`)
  if (ruleFired) lines.push(`watchdog rule fired: ${ruleFired}`)
  if (endNotSeen) lines.push('end event not seen after abort')
  return lines
}
