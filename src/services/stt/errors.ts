export type SttErrorKind = 'offline' | 'permission' | 'timeout' | 'no-speech' | 'unsupported' | 'busy' | 'aborted' | 'other'

export const STT_MESSAGES: Record<SttErrorKind, string> = {
  offline: 'Speech recognition needs an internet connection and could not reach it. Type your answer instead.',
  permission: 'Microphone access is blocked. Allow the microphone for this app in your browser or device settings, then try again.',
  timeout: 'No speech was detected in time. Try again, or type your answer.',
  'no-speech': "I didn't hear anything. Try again, or type your answer.",
  unsupported: "Speech recognition isn't available in this browser. Type your answer instead.",
  busy: 'Still busy with the previous sound. Try again in a moment.',
  aborted: 'Listening was stopped.',
  other: 'Speech recognition failed. Try again, or type your answer.',
}

/** Speech-check panel wording: no mention of typing, since the panel has no text box. */
const PANEL_MESSAGES: Record<SttErrorKind, string> = {
  offline: 'Speech recognition needs an internet connection and could not reach it. Tap Listen to try again.',
  permission: STT_MESSAGES.permission,
  timeout: 'No speech was detected in time. Tap Listen to try again.',
  'no-speech': "I didn't hear anything. Tap Listen to try again.",
  unsupported: "Speech recognition isn't available in this browser.",
  busy: STT_MESSAGES.busy,
  aborted: STT_MESSAGES.aborted,
  other: 'Speech recognition failed. Tap Listen to try again.',
}

export type SttMessageContext = 'conversation' | 'panel'

export function sttMessage(kind: SttErrorKind, context: SttMessageContext = 'conversation'): string {
  return context === 'panel' ? PANEL_MESSAGES[kind] : STT_MESSAGES[kind]
}

/** Maps a Web Speech `error` code. Chrome offline gives "network"; confidence and onLine are never consulted. */
export function mapSttErrorCode(code: string): SttErrorKind {
  switch (code) {
    case 'network':
      return 'offline'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission'
    case 'no-speech':
      return 'no-speech'
    case 'aborted':
      return 'aborted'
    default:
      return 'other'
  }
}
