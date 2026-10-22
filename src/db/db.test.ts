import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData, importData } from './exportImport'
import { appendReviewLog, DewDB, type ReviewLog } from './schema'

const FAKE_GEMINI_KEY = 'FAKE_GEMINI_KEY_NOT_REAL'
const FAKE_PAT = 'FAKE_GITHUB_PAT_NOT_REAL'

const log = (id: string): ReviewLog => ({ id, cardId: 'c1', rating: 3, reviewedAt: 1000, deviceId: 'd1' })

let n = 0
let db: DewDB
beforeEach(() => {
  db = new DewDB(`test-${n++}`)
})

describe('export/import', () => {
  it('round-trips data into a fresh database', async () => {
    await db.settings.put({ key: 'model', value: 'gemini-3.5-flash-lite' })
    await db.cards.put({ id: 'c1' })
    await db.passages.put({ id: 'p1' })
    await appendReviewLog(db, log('l1'))
    const json = JSON.stringify(await exportData(db))

    const other = new DewDB(`test-${n++}`)
    await importData(other, json)
    expect(await other.settings.toArray()).toEqual([{ key: 'model', value: 'gemini-3.5-flash-lite' }])
    expect(await other.cards.toArray()).toEqual([{ id: 'c1' }])
    expect(await other.passages.toArray()).toEqual([{ id: 'p1' }])
    expect(await other.reviewLogs.toArray()).toEqual([log('l1')])
  })

  it('merges review logs without duplicating or rewriting them', async () => {
    await appendReviewLog(db, log('l1'))
    const json = JSON.stringify(await exportData(db))
    await appendReviewLog(db, log('l2'))
    await importData(db, json)
    await importData(db, json)
    expect((await db.reviewLogs.toArray()).map((l) => l.id).sort()).toEqual(['l1', 'l2'])
  })

  it('rejects malformed files', async () => {
    await expect(importData(db, 'not json')).rejects.toThrow(/valid JSON/)
    await expect(importData(db, JSON.stringify({ version: 99 }))).rejects.toThrow(/version/)
    await expect(importData(db, JSON.stringify({ version: 1 }))).rejects.toThrow(/missing/)
  })

  it('never contains secrets, even from localStorage or a decoy settings row', async () => {
    const store = new Map([
      ['dew.geminiKey', FAKE_GEMINI_KEY],
      ['dew.githubPat', FAKE_PAT],
    ])
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    await db.settings.put({ key: 'model', value: 'gemini-3.5-flash-lite' })
    // Decoy rows: not on the allow-list, so they must be dropped.
    await db.settings.put({ key: 'geminiKey', value: FAKE_GEMINI_KEY })
    await db.settings.put({ key: 'githubPat', value: FAKE_PAT })

    const json = JSON.stringify(await exportData(db))
    for (const s of [FAKE_GEMINI_KEY, FAKE_PAT, 'geminiKey', 'githubPat', 'dew.geminiKey', 'dew.githubPat']) {
      expect(json).not.toContain(s)
    }

    // A tampered file carrying secrets must not import them either.
    const tampered = JSON.stringify({ ...JSON.parse(json), settings: [{ key: 'geminiKey', value: FAKE_GEMINI_KEY }] })
    const other = new DewDB(`test-${n++}`)
    await importData(other, tampered)
    expect(await other.settings.toArray()).toEqual([])
    delete (globalThis as { localStorage?: unknown }).localStorage
  })
})
