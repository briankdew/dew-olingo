import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, TimeoutError } from './fetchWithTimeout'
import { retryWithBackoff } from './retry'

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('times out against a hanging stub', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
    )
    const p = fetchWithTimeout('https://example.test/', { timeoutMs: 5000 })
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('defaults to 10 s and returns the response when it arrives in time', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok'))
    const res = await fetchWithTimeout('https://example.test/')
    expect(await res.text()).toBe('ok')
  })

  it('passes through a caller abort as a non-timeout error', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
        }),
    )
    const ac = new AbortController()
    const p = fetchWithTimeout('https://example.test/', { signal: ac.signal })
    const assertion = expect(p).rejects.not.toBeInstanceOf(TimeoutError)
    ac.abort()
    await assertion
  })
})

describe('retryWithBackoff', () => {
  const sleeps: number[] = []
  const sleep = async (ms: number) => void sleeps.push(ms)
  beforeEach(() => (sleeps.length = 0))

  it('retries with growing waits then succeeds', async () => {
    let calls = 0
    const r = await retryWithBackoff(
      async () => {
        if (++calls < 3) throw new Error('x')
        return 'ok'
      },
      { sleep, random: () => 1, baseMs: 100 },
    )
    expect(r).toBe('ok')
    expect(sleeps).toEqual([100, 200])
  })

  it('gives up after the retry limit', async () => {
    let calls = 0
    await expect(
      retryWithBackoff(async () => {
        calls++
        throw new Error('nope')
      }, { sleep, retries: 2 }),
    ).rejects.toThrow('nope')
    expect(calls).toBe(3)
  })

  it('does not retry when shouldRetry says no, and honors a retry-after hint', async () => {
    let calls = 0
    await expect(
      retryWithBackoff(async () => (calls++, Promise.reject(new Error('fatal'))), { sleep, shouldRetry: () => false }),
    ).rejects.toThrow('fatal')
    expect(calls).toBe(1)

    let c2 = 0
    await retryWithBackoff(async () => (++c2 < 2 ? Promise.reject(new Error('r')) : 'ok'), {
      sleep,
      baseMs: 10,
      getRetryAfterMs: () => 3000,
    })
    expect(sleeps.at(-1)).toBe(3000)
  })
})
