import { createStt, type SttDeps } from './stt/stt'
import { createTts, type TtsDeps } from './tts/tts'

/**
 * Wires the two adapters together: listen() refuses while TTS plays, and speak() stops a live
 * recognition session first (iOS: TTS playback takes over the audio session).
 */
export function createSpeech(deps: { stt?: SttDeps; tts?: TtsDeps } = {}) {
  const stt = createStt({ ...deps.stt, isSpeaking: () => tts.isSpeaking() })
  const tts = createTts({ ...deps.tts, beforeSpeak: () => stt.abortActive() })
  return { stt, tts }
}

export const speech = createSpeech()
