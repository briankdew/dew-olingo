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

/** iPhone Safari listed each voice three times on one load; voiceURI identifies a voice. */
export function dedupeVoices<T extends VoiceLike>(voices: T[]): T[] {
  const seen = new Set<string>()
  return voices.filter((v) => {
    const key = v.voiceURI || `${v.name}|${v.lang}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Spanish voices only, deduped: es-MX, es-US, es, es-ES, other es-*; local voices first, then by name. */
export function rankVoices<T extends VoiceLike>(voices: T[]): T[] {
  const rank = (v: VoiceLike) => {
    const i = LANG_PREFERENCE.indexOf(normLang(v.lang))
    return i === -1 ? LANG_PREFERENCE.length : i
  }
  return dedupeVoices(voices.filter(isSpanish)).sort(
    (a, b) => rank(a) - rank(b) || Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name),
  )
}

/** The saved voice if it still exists, else the best-ranked one. `ranked` comes from rankVoices. */
export function pickVoice<T extends VoiceLike>(savedURI: string, ranked: T[]): T | undefined {
  return ranked.find((v) => savedURI && v.voiceURI === savedURI) ?? ranked[0]
}

export const hasMexicanVoice = (ranked: VoiceLike[]) => ranked.some((v) => normLang(v.lang) === 'es-mx')
