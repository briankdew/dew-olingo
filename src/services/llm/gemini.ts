import { fetchWithTimeout, TimeoutError } from '../../lib/fetchWithTimeout'
import { retryWithBackoff, type RetryOptions } from '../../lib/retry'
import { LLMError, type LLMProvider, type LLMRequest } from './types'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const LLM_TIMEOUT_MS = 30_000

export interface GeminiOptions {
  apiKey: string
  model?: string
  timeoutMs?: number
  retry?: RetryOptions
}

const MAX_RETRY_AFTER_MS = 60_000

/** Retry-After is delay-seconds or an HTTP date. */
export function parseRetryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined
  const s = Number(header)
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(header) - now
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : undefined
}

interface GeminiErrorBody {
  error?: { message?: string; status?: string; details?: { reason?: string }[] }
}

function isInvalidKey(body: GeminiErrorBody): boolean {
  const e = body.error
  return !!e && (!!e.details?.some((d) => d.reason === 'API_KEY_INVALID') || /api key not valid/i.test(e.message ?? ''))
}

export class GeminiProvider implements LLMProvider {
  private readonly model: string

  constructor(private readonly opts: GeminiOptions) {
    this.model = opts.model?.trim() || DEFAULT_GEMINI_MODEL
  }

  private scrub(text: string): string {
    return this.opts.apiKey ? text.split(this.opts.apiKey).join('[key]') : text
  }

  private async attempt(req: LLMRequest): Promise<string> {
    const body = {
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
      contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      ...(req.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }
    let res: Response
    try {
      res = await fetchWithTimeout(`${BASE_URL}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
        body: JSON.stringify(body),
        timeoutMs: this.opts.timeoutMs ?? LLM_TIMEOUT_MS,
      })
    } catch (e) {
      if (e instanceof TimeoutError) {
        const secs = Math.round((this.opts.timeoutMs ?? LLM_TIMEOUT_MS) / 1000)
        throw new LLMError('timeout', `Gemini did not answer within ${secs} seconds. It may be slow, or you may be offline.`)
      }
      throw new LLMError('offline', 'Could not reach Gemini. You may be offline.')
    }
    if (!res.ok) {
      let detail = ''
      let body: GeminiErrorBody = {}
      try {
        body = (await res.json()) as GeminiErrorBody
        detail = this.scrub(body.error?.message ?? '')
      } catch {
        // body not JSON
      }
      const suffix = detail ? `: ${detail}` : ''
      if (res.status === 429) throw new LLMError('rate-limited', `Gemini rate limit reached (429)${suffix}`, parseRetryAfterMs(res.headers.get('retry-after')))
      if (res.status === 503) throw new LLMError('unavailable', `Gemini is busy (503)${suffix}`, parseRetryAfterMs(res.headers.get('retry-after')))
      if (res.status === 401 || res.status === 403 || (res.status === 400 && isInvalidKey(body))) {
        throw new LLMError('auth', `Gemini rejected the request (${res.status})${suffix}`)
      }
      if (res.status === 400) throw new LLMError('bad-request', `Gemini rejected the request as invalid (400)${suffix}`)
      throw new LLMError('bad-response', `Gemini error ${res.status}${suffix}`)
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new LLMError('bad-response', 'Gemini returned no text.')
    return text
  }

  generate(req: LLMRequest): Promise<string> {
    return retryWithBackoff(() => this.attempt(req), {
      retries: 3,
      shouldRetry: (e) => e instanceof LLMError && (e.kind === 'rate-limited' || e.kind === 'unavailable'),
      getRetryAfterMs: (e) => (e instanceof LLMError ? e.retryAfterMs : undefined),
      ...this.opts.retry,
    })
  }
}
