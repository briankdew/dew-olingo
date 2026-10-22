import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GEMINI_MODEL, GeminiProvider, parseRetryAfterMs } from './gemini'
import { LLMError } from './types'

const FAKE_KEY = 'FAKE_GEMINI_KEY_NOT_REAL'
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hola' }] } }] }))
const err = (status: number, message = 'nope', headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers })
const noWait = { retry: { sleep: async () => {}, random: () => 1 } }

afterEach(() => vi.unstubAllGlobals())

describe('GeminiProvider', () => {
  it('defaults to gemini-3.5-flash-lite', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
  })

  it('succeeds, sending the key only in the header and using the default model', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const text = await new GeminiProvider({ apiKey: FAKE_KEY }).generate({
      system: 'sys',
      messages: [{ role: 'user', text: 'hi' }],
      json: true,
    })
    expect(text).toBe('hola')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent')
    expect(url).not.toContain(FAKE_KEY)
    expect(String(init.body)).not.toContain(FAKE_KEY)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY)
    expect(JSON.parse(String(init.body)).generationConfig.responseMimeType).toBe('application/json')
  })

  it('uses the model setting when given', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    await new GeminiProvider({ apiKey: FAKE_KEY, model: 'gemini-x' }).generate({ messages: [{ role: 'user', text: 'a' }] })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/models/gemini-x:')
  })

  it('retries 429 and 503 with backoff, honoring Retry-After, then succeeds', async () => {
    const sleeps: number[] = []
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(err(429, 'slow down', { 'retry-after': '2' }))
      .mockResolvedValueOnce(err(503, 'high demand'))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const p = new GeminiProvider({ apiKey: FAKE_KEY, retry: { sleep: async (ms) => void sleeps.push(ms), random: () => 1 } })
    expect(await p.generate({ messages: [{ role: 'user', text: 'a' }] })).toBe('hola')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sleeps[0]).toBe(2000)
  })

  it('gives up on a persistent 429 with a rate-limited error', async () => {
    const fetchMock = vi.fn(async () => err(429))
    vi.stubGlobal('fetch', fetchMock)
    const p = new GeminiProvider({ apiKey: FAKE_KEY, ...noWait })
    await expect(p.generate({ messages: [{ role: 'user', text: 'a' }] })).rejects.toMatchObject({ kind: 'rate-limited' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not retry auth errors and scrubs the key from messages', async () => {
    const fetchMock = vi.fn(async () => err(400, `API key not valid: ${FAKE_KEY}`))
    vi.stubGlobal('fetch', fetchMock)
    const p = new GeminiProvider({ apiKey: FAKE_KEY, ...noWait })
    const e = (await p.generate({ messages: [{ role: 'user', text: 'a' }] }).catch((x: unknown) => x)) as LLMError
    expect(e.kind).toBe('auth')
    expect(e.message).not.toContain(FAKE_KEY)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('times out against a hanging server with a clear message', async () => {
    vi.stubGlobal(
      'fetch',
      (_u: string, init: RequestInit) =>
        new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))),
    )
    const p = new GeminiProvider({ apiKey: FAKE_KEY, timeoutMs: 20, ...noWait })
    await expect(p.generate({ messages: [{ role: 'user', text: 'a' }] })).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringMatching(/did not answer within \d+ seconds.*slow.*offline/),
    })
  })

  it('names the configured timeout in seconds', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) =>
      new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError')))),
    )
    const p = new GeminiProvider({ apiKey: FAKE_KEY, timeoutMs: 1500, ...noWait })
    vi.useFakeTimers()
    const assertion = expect(p.generate({ messages: [{ role: 'user', text: 'a' }] })).rejects.toMatchObject({
      kind: 'timeout',
      message: expect.stringContaining('within 2 seconds'),
    })
    await vi.advanceTimersByTimeAsync(2000)
    await assertion
    vi.useRealTimers()
  })

  describe('HTTP 400 classification', () => {
    const run = async (res: Response) => {
      const fetchMock = vi.fn(async () => res)
      vi.stubGlobal('fetch', fetchMock)
      const e = (await new GeminiProvider({ apiKey: FAKE_KEY, ...noWait })
        .generate({ messages: [{ role: 'user', text: 'a' }] })
        .catch((x: unknown) => x)) as LLMError
      expect(fetchMock).toHaveBeenCalledTimes(1)
      return e
    }
    const json = (status: number, error: object) => new Response(JSON.stringify({ error }), { status })

    it('400 with reason API_KEY_INVALID is auth', async () => {
      const e = await run(json(400, { status: 'INVALID_ARGUMENT', message: 'bad', details: [{ reason: 'API_KEY_INVALID' }] }))
      expect(e.kind).toBe('auth')
    })

    it('400 whose message says the API key is not valid is auth', async () => {
      expect((await run(json(400, { message: 'API key not valid. Please pass a valid API key.' }))).kind).toBe('auth')
    })

    it('any other 400 is a bad request, not auth', async () => {
      const e = await run(json(400, { status: 'INVALID_ARGUMENT', message: 'contents is not specified' }))
      expect(e.kind).toBe('bad-request')
      expect(e.message).toContain('contents is not specified')
    })

    it('a 400 with a non-JSON body is a bad request', async () => {
      expect((await run(new Response('<html>oops</html>', { status: 400 }))).kind).toBe('bad-request')
    })

    it.each([401, 403])('%i stays auth', async (status) => {
      expect((await run(json(status, { message: 'denied' }))).kind).toBe('auth')
    })
  })

  describe('parseRetryAfterMs', () => {
    const now = Date.parse('2026-10-22T12:00:00Z')
    it('reads delay-seconds', () => expect(parseRetryAfterMs('3', now)).toBe(3000))
    it('reads an HTTP date in the future', () =>
      expect(parseRetryAfterMs('Thu, 22 Oct 2026 12:00:05 GMT', now)).toBe(5000))
    it('caps very long delays', () => expect(parseRetryAfterMs('9999', now)).toBe(60_000))
    it('ignores past dates, zero, junk and missing', () => {
      expect(parseRetryAfterMs('Thu, 22 Oct 2026 11:00:00 GMT', now)).toBeUndefined()
      expect(parseRetryAfterMs('0', now)).toBeUndefined()
      expect(parseRetryAfterMs('soon', now)).toBeUndefined()
      expect(parseRetryAfterMs(null, now)).toBeUndefined()
    })
  })

  it('reports a network failure as offline', async () => {
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')))
    const p = new GeminiProvider({ apiKey: FAKE_KEY, ...noWait })
    await expect(p.generate({ messages: [{ role: 'user', text: 'a' }] })).rejects.toMatchObject({ kind: 'offline' })
  })
})
