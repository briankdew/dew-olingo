import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getVoiceURI, setVoiceURI } from './settings'

describe('voice setting', () => {
  it('defaults to empty and round-trips the chosen voiceURI', async () => {
    expect(await getVoiceURI()).toBe('')
    await setVoiceURI('com.apple.voice.compact.es-MX.Paulina')
    expect(await getVoiceURI()).toBe('com.apple.voice.compact.es-MX.Paulina')
  })
})
