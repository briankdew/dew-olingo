import Dexie, { type EntityTable } from 'dexie'

export interface SettingRow {
  key: string
  value: unknown
}

export interface Card {
  id: string
}

export interface Passage {
  id: string
}

export interface ReviewLog {
  id: string
  cardId: string
  rating: number
  reviewedAt: number
  deviceId: string
}

/**
 * Non-secret settings that may be exported. The Gemini key and GitHub PAT are
 * kept in localStorage (see M2) and are never stored in Dexie.
 */
export const EXPORTABLE_SETTING_KEYS = ['model', 'voiceURI', 'newCardLimit', 'syncRepo'] as const

export class DewDB extends Dexie {
  settings!: EntityTable<SettingRow, 'key'>
  cards!: EntityTable<Card, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  passages!: EntityTable<Passage, 'id'>

  constructor(name = 'dew-olingo') {
    super(name)
    this.version(1).stores({
      settings: 'key',
      cards: 'id',
      reviewLogs: 'id, cardId, reviewedAt',
      passages: 'id',
    })
  }
}

export const db = new DewDB()

/** Review logs are append-only: this is the only write path, and an existing id is never changed. */
export async function appendReviewLog(target: DewDB, log: ReviewLog): Promise<void> {
  await target.reviewLogs.add(log)
}
