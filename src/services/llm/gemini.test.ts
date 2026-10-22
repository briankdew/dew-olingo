import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from './gemini'
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
      message: expect.stringContaining('offline'),
    })
  })

  it('reports a network failure as offline', async () => {
    vi.stubGlobal('fetch', async () => Promise.reject(new TypeError('Failed to fetch')))
    const p = new GeminiProvider({ apiKey: FAKE_KEY, ...noWait })
    await expect(p.generate({ messages: [{ role: 'user', text: 'a' }] })).rejects.toMatchObject({ kind: 'offline' })
  })
})
