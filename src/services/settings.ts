import { db } from '../db/schema'
import { DEFAULT_GEMINI_MODEL } from './llm/gemini'

/** Non-secret settings live in Dexie (and are exported); secrets live in ./secrets. */
export async function getModel(): Promise<string> {
  const row = await db.settings.get('model')
  return typeof row?.value === 'string' && row.value.trim() ? row.value : DEFAULT_GEMINI_MODEL
}

export async function setModel(model: string): Promise<void> {
  await db.settings.put({ key: 'model', value: model.trim() })
}

export async function getSyncRepo(): Promise<string> {
  const row = await db.settings.get('syncRepo')
  return typeof row?.value === 'string' ? row.value : ''
}

export async function setSyncRepo(repo: string): Promise<void> {
  await db.settings.put({ key: 'syncRepo', value: repo.trim() })
}

/** The chosen TTS voice, by voiceURI. Empty means "use the best-ranked voice". */
export async function getVoiceURI(): Promise<string> {
  const row = await db.settings.get('voiceURI')
  return typeof row?.value === 'string' ? row.value : ''
}

export async function setVoiceURI(voiceURI: string): Promise<void> {
  await db.settings.put({ key: 'voiceURI', value: voiceURI })
}
