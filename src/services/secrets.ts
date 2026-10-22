/** The only module that touches the Gemini key and GitHub PAT. Device-local; never exported, synced or committed. */
const KEYS = { gemini: 'dew.geminiKey', github: 'dew.githubPat' } as const
export type SecretName = keyof typeof KEYS

export function getSecret(name: SecretName): string {
  try {
    return localStorage.getItem(KEYS[name]) ?? ''
  } catch {
    return ''
  }
}

/** Returns false if the browser refused the write (blocked storage). */
export function setSecret(name: SecretName, value: string): boolean {
  try {
    localStorage.setItem(KEYS[name], value)
    return true
  } catch {
    return false
  }
}

export function clearSecret(name: SecretName): void {
  try {
    localStorage.removeItem(KEYS[name])
  } catch {
    // nothing to clear
  }
}

/** Display form that never reveals the secret: "saved (ends …abcd)" or "not set". */
export function maskSecret(value: string): string {
  if (!value) return 'not set'
  return value.length > 8 ? `saved (ends …${value.slice(-4)})` : 'saved'
}
