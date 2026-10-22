/** Which rule ended a recognition session. W2 is the extended deadline after a result. */
export type WatchdogRule = 'W0' | 'W1' | 'W2' | 'W3' | 'W4'

export interface WatchdogConfig {
  /** W0: no `audiostart` this long after start(). Generous, so a first-use mic prompt can be answered. */
  noAudioMs: number
  /** W1/W2: no `result` this long after `audiostart` (W1) or after the latest result (W2). */
  noResultMs: number
  /** W3: `audioend` with no result at all this long ago. */
  afterAudioEndMs: number
  /** W4: hard cap measured from `audiostart`. */
  hardCapMs: number
}

export const DEFAULT_WATCHDOG: WatchdogConfig = {
  noAudioMs: 20_000,
  noResultMs: 10_000,
  afterAudioEndMs: 5_000,
  hardCapMs: 20_000,
}

export interface Watchdog {
  start(): void
  audiostart(): void
  result(): void
  audioend(): void
  stop(): void
}

/**
 * Deadline logic for one recognition session. The clock origin is `audiostart` (the mic is open
 * from then on); only `result` events extend the deadline, because iOS Safari is not known to
 * fire speechstart. Durations are an argument so tests can shorten them; the app uses the defaults.
 */
export function createWatchdog(onExpire: (rule: WatchdogRule) => void, config: Partial<WatchdogConfig> = {}): Watchdog {
  const cfg = { ...DEFAULT_WATCHDOG, ...config }
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let startedAt = 0
  let t0: number | null = null
  let lastResultAt: number | null = null
  let audioEndAt: number | null = null

  const compute = (): { at: number; rule: WatchdogRule } => {
    if (t0 === null) return { at: startedAt + cfg.noAudioMs, rule: 'W0' }
    let best: { at: number; rule: WatchdogRule } =
      lastResultAt === null ? { at: t0 + cfg.noResultMs, rule: 'W1' } : { at: lastResultAt + cfg.noResultMs, rule: 'W2' }
    if (lastResultAt === null && audioEndAt !== null && audioEndAt + cfg.afterAudioEndMs < best.at) {
      best = { at: audioEndAt + cfg.afterAudioEndMs, rule: 'W3' }
    }
    if (t0 + cfg.hardCapMs <= best.at) best = { at: t0 + cfg.hardCapMs, rule: 'W4' }
    return best
  }

  const arm = () => {
    if (stopped) return
    if (timer) clearTimeout(timer)
    const { at, rule } = compute()
    timer = setTimeout(() => {
      timer = null
      if (stopped) return
      stopped = true
      onExpire(rule)
    }, Math.max(0, at - Date.now()))
  }

  return {
    start() {
      startedAt = Date.now()
      arm()
    },
    audiostart() {
      if (t0 === null) t0 = Date.now()
      arm()
    },
    result() {
      lastResultAt = Date.now()
      arm()
    },
    audioend() {
      audioEndAt = Date.now()
      arm()
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
