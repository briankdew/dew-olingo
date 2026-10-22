export const DEFAULT_TIMEOUT_MS = 10_000

export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * The only way the app makes network requests. Relies on its own timer, never on
 * navigator.onLine (unreliable on iOS; a VPN can make offline requests hang for minutes).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } catch (e) {
    if (timedOut) throw new TimeoutError(timeoutMs)
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
