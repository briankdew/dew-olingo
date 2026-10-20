# Device verification log

This content comes from an earlier verification spike.

- Chromebook (Chrome): Web Speech API works for es-MX (5/5 phrases; 4/5 on the first try, 5/5 with one retry). 24 Spanish voices; no native es-MX voice.
- iPhone Safari: see 'iPhone Safari speech findings' below.
- Not yet tested: MacBook Safari, iPad, offline behavior, GitHub Contents API CORS, Gemini API.

## iPhone Safari speech findings (2026-10-19 and 2026-10-20)

Device: iPhone 15 Pro. User-reported iOS 27; the page's user agent string reports Safari 27.2 and iOS 18.7. Tested in a Safari tab and in the home-screen app, mostly on the device mic and speaker, plus one AirPods run.

Recognition (webkitSpeechRecognition):
- New recognizer on every Listen tap: the first attempt captured; every later attempt got no speech until the user tapped Stop (sessions hung 11-29 s). Safari never ended a hung session on its own, so the app needs its own timeout.
- One recognizer reused, start() called each attempt: 3 of 5 captured, alternating success and hang.
- One continuous session (continuous=true, no stop between phrases): Safari tab, es-ES, 5/5. Home-screen app, es-ES, 4/4 before TTS playback. Home-screen app, es-MX, 2/2 before TTS playback. A 69-second idle gap did not end the session.
- Results accumulate in one list (resultIndex advances per phrase). Final confidence was 0.95-0.998; interim results report 0.

TTS interference (two trials, home-screen app, continuous session, Paulina compact voice):
- Trial 1 (es-ES): after playback, the next phrase got no events until the user tapped Done (about 27 s).
- Trial 2 (es-MX): the session ended by itself with error:audio-capture (then audioend, speechend, end), about 43 s after the previous result; a new session started on the next Listen captured the remaining 3 phrases. The page did not log when playback started, so the timing is inferred.
- Working assumption (unproven, two trials): TTS playback takes over the iOS audio session. Start a fresh recognition session after each playback, and add a watchdog timer.

Voices: es-MX Paulina (compact 5, super-compact 4); es-ES Mónica (compact 2, super-compact 1). Subjective, one listener. On one early load the page listed each voice three times (213 total, 12 Spanish); later loads showed 71 total and 4 Spanish. Dedupe by voiceURI.

Permissions: the home-screen app has its own mic permission. User report: its prompt appeared only after mic access was turned off for Safari proper.

Not tested: iPad; continuous sessions longer than about 2.5 minutes; TTS with AirPods; Silent Mode effects on speaker audio (the user's reports were unclear); a held mic stream (E3).
