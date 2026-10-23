export interface VoiceLike {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
}

/** Spanish dialects in preference order; any other es-* voice ranks after these. */
export const LANG_PREFERENCE = ['es-mx', 'es-us', 'es', 'es-es']

const normLang = (lang: string) => lang.replace('_', '-').toLowerCase()
const isSpanish = (v: VoiceLike) => /^es(-|$)/.test(normLang(v.lang))

/** Stable identity of a voice: its voiceURI, or name+lang when the engine gives none. */
export const voiceId = (v: VoiceLike) => v.voiceURI || `${v.name}|${v.lang}`

/** iPhone Safari listed each voice three times on one load; voiceURI identifies a voice. */
export function dedupeVoices<T extends VoiceLike>(voices: T[]): T[] {
  const seen = new Set<string>()
  return voices.filter((v) => {
    const key = voiceId(v)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const groupKey = (v: VoiceLike) => `${v.name}|${normLang(v.lang)}`
const isSuperCompact = (v: VoiceLike) => /super-compact/i.test(v.voiceURI)
const isCompact = (v: VoiceLike) => /compact/i.test(v.voiceURI) && !isSuperCompact(v)
/** Quality words other than compact/super-compact. Their ranking is unknown, so they are reported, not ranked. */
const OTHER_QUALITY = /enhanced|premium/gi

export interface UnrecognizedQuality {
  name: string
  lang: string
  tags: string[]
  voiceURIs: string[]
}

/**
 * One entry per name+language: compact over super-compact over the first listed.
 * A group of several voices where some voiceURI carries another quality tag is still collapsed by that rule,
 * and is also returned in `unrecognized` so the caller can report it.
 */
export function collapseByQuality<T extends VoiceLike>(voices: T[]): { voices: T[]; unrecognized: UnrecognizedQuality[] } {
  const groups = new Map<string, T[]>()
  for (const v of voices) groups.set(groupKey(v), [...(groups.get(groupKey(v)) ?? []), v])
  const kept: T[] = []
  const unrecognized: UnrecognizedQuality[] = []
  for (const g of groups.values()) {
    kept.push(g.find(isCompact) ?? g.find(isSuperCompact) ?? g[0])
    const tags = [...new Set(g.flatMap((v) => v.voiceURI.match(OTHER_QUALITY) ?? []).map((t) => t.toLowerCase()))]
    if (g.length > 1 && tags.length > 0) {
      unrecognized.push({ name: g[0].name, lang: g[0].lang, tags, voiceURIs: g.map((v) => v.voiceURI) })
    }
  }
  return { voices: kept, unrecognized }
}

/** Spanish voices only, deduped, one per name+language (see collapseByQuality): es-MX, es-US, es, es-ES, other es-*; local voices first, then by name. */
export function rankVoices<T extends VoiceLike>(voices: T[]): T[] {
  const rank = (v: VoiceLike) => {
    const i = LANG_PREFERENCE.indexOf(normLang(v.lang))
    return i === -1 ? LANG_PREFERENCE.length : i
  }
  return collapseByQuality(dedupeVoices(voices.filter(isSpanish))).voices.sort(
    (a, b) => rank(a) - rank(b) || Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name),
  )
}

/**
 * The saved voice (by voiceId) if it is shown, else the shown voice with the same name and language as the saved one
 * (it was hidden by collapseByQuality; pass the full list as `all`), else the best-ranked one. `ranked` comes from rankVoices.
 */
export function pickVoice<T extends VoiceLike>(savedURI: string, ranked: T[], all: VoiceLike[] = []): T | undefined {
  const shown = ranked.find((v) => savedURI && voiceId(v) === savedURI)
  if (shown) return shown
  const hidden = savedURI ? all.find((v) => voiceId(v) === savedURI) : undefined
  return (hidden && ranked.find((v) => groupKey(v) === groupKey(hidden))) ?? ranked[0]
}

export const hasMexicanVoice = (ranked: VoiceLike[]) => ranked.some((v) => normLang(v.lang) === 'es-mx')
