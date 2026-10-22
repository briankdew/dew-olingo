import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSecret, getSecret, maskSecret, setSecret } from './secrets'

describe('secrets', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  })
  afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage)

  it('stores, reads and clears', () => {
    expect(setSecret('gemini', 'FAKE_GEMINI_KEY_NOT_REAL')).toBe(true)
    expect(getSecret('gemini')).toBe('FAKE_GEMINI_KEY_NOT_REAL')
    clearSecret('gemini')
    expect(getSecret('gemini')).toBe('')
  })

  it('masks the value', () => {
    expect(maskSecret('')).toBe('not set')
    const m = maskSecret('FAKE_GEMINI_KEY_NOT_REAL')
    expect(m).not.toContain('FAKE_GEMINI')
    expect(m).toContain('REAL')
  })

  it('survives blocked storage', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(getSecret('gemini')).toBe('')
    expect(setSecret('gemini', 'x')).toBe(false)
    expect(() => clearSecret('gemini')).not.toThrow()
  })
})
