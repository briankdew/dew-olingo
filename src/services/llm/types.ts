export interface LLMMessage {
  role: 'user' | 'model'
  text: string
}

export interface LLMRequest {
  system?: string
  messages: LLMMessage[]
  /** Ask for a JSON reply. */
  json?: boolean
}

export interface LLMProvider {
  generate(req: LLMRequest): Promise<string>
}

export type LLMErrorKind = 'auth' | 'bad-request' | 'rate-limited' | 'unavailable' | 'timeout' | 'offline' | 'bad-response'

export class LLMError extends Error {
  constructor(
    public readonly kind: LLMErrorKind,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}
