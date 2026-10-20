# Device verification log

This content comes from an earlier verification spike.

- Chromebook (Chrome): Web Speech API works for es-MX (5/5 phrases). 24 Spanish voices; no native es-MX voice.
- iPhone Safari: speech recognition is exposed but only reliably captures the first attempt per session. Workaround: one long-lived recognizer, no `stop()` between phrases (captured 5/5). UNRESOLVED: `speechSynthesis` playback appears to interfere with a live recognition session. Home-screen-installed app does not inherit Safari's mic permission.
- Not yet tested: MacBook Safari, iPad, offline behavior, GitHub Contents API CORS, Gemini API.
