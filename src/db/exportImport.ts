import { EXPORTABLE_SETTING_KEYS, type Card, type DewDB, type Passage, type ReviewLog, type SettingRow } from './schema'

export const EXPORT_VERSION = 1

export interface ExportFile {
  version: number
  exportedAt: string
  settings: SettingRow[]
  cards: Card[]
  reviewLogs: ReviewLog[]
  passages: Passage[]
}

const allowed = new Set<string>(EXPORTABLE_SETTING_KEYS)

export async function exportData(db: DewDB): Promise<ExportFile> {
  const [settings, cards, reviewLogs, passages] = await Promise.all([
    db.settings.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.passages.toArray(),
  ])
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings.filter((s) => allowed.has(s.key)),
    cards,
    reviewLogs,
    passages,
  }
}

function isRecordArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null)
}

export function parseExport(text: string): ExportFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Import file is not valid JSON.')
  }
  const f = data as Partial<ExportFile> | null
  if (!f || typeof f !== 'object') throw new Error('Import file has the wrong shape.')
  if (f.version !== EXPORT_VERSION) throw new Error(`Unsupported export version: ${String(f.version)}.`)
  for (const k of ['settings', 'cards', 'reviewLogs', 'passages'] as const) {
    if (!isRecordArray(f[k])) throw new Error(`Import file is missing "${k}".`)
  }
  return f as ExportFile
}

/** Merge an export into the database. Safe to repeat: existing review logs are kept, not rewritten. */
export async function importData(db: DewDB, text: string): Promise<void> {
  const f = parseExport(text)
  await db.transaction('rw', db.settings, db.cards, db.reviewLogs, db.passages, async () => {
    await db.settings.bulkPut(f.settings.filter((s) => allowed.has(s.key)))
    await db.cards.bulkPut(f.cards)
    await db.passages.bulkPut(f.passages)
    const existing = new Set(await db.reviewLogs.toCollection().primaryKeys())
    await db.reviewLogs.bulkAdd(f.reviewLogs.filter((l) => !existing.has(l.id)))
  })
}
