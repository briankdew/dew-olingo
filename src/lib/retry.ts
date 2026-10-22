export interface RetryOptions {
  /** Retries after the first attempt. */
  retries?: number
  baseMs?: number
  maxMs?: number
  /** Return true to retry; `retryAfterMs` is a server hint to wait at least that long. */
  shouldRetry?: (error: unknown) => boolean
  getRetryAfterMs?: (error: unknown) => number | undefined
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseMs = 500,
    maxMs = 8000,
    shouldRetry = () => true,
    getRetryAfterMs,
    sleep = realSleep,
    random = Math.random,
  } = opts
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (e) {
      if (attempt >= retries || !shouldRetry(e)) throw e
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + random() / 2)
      await sleep(Math.max(backoff, getRetryAfterMs?.(e) ?? 0))
    }
  }
}
