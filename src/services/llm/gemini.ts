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

function parseRetryAfterMs(res: Response): number | undefined {
  const s = Number(res.headers.get('retry-after'))
  return Number.isFinite(s) && s > 0 ? s * 1000 : undefined
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
      if (e instanceof TimeoutError) throw new LLMError('timeout', 'Gemini did not answer in time. You may be offline.')
      throw new LLMError('offline', 'Could not reach Gemini. You may be offline.')
    }
    if (!res.ok) {
      let detail = ''
      try {
        detail = this.scrub(((await res.json()) as { error?: { message?: string } }).error?.message ?? '')
      } catch {
        // body not JSON
      }
      const suffix = detail ? `: ${detail}` : ''
      if (res.status === 429) throw new LLMError('rate-limited', `Gemini rate limit reached (429)${suffix}`, parseRetryAfterMs(res))
      if (res.status === 503) throw new LLMError('unavailable', `Gemini is busy (503)${suffix}`, parseRetryAfterMs(res))
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new LLMError('auth', `Gemini rejected the request (${res.status})${suffix}`)
      }
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
