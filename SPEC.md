# Dew O'Lingo v1 spec

Constraints, locked stack and decisions live in `CLAUDE.md`; this file does not repeat them. Device findings live in `docs/DEVICES.md`. Progress is tracked in `TASKS.md`.

Platforms for v1: Chromebook Chrome, iPhone Safari, iPad Safari (tab and home-screen app). MacBook is out of scope.

## Design rules (from docs/DEVICES.md)

- **Speech, iOS:** start a fresh recognition session after every TTS playback and for every user turn; never rely on one long continuous session. Every recognition session has a watchdog timer (hung sessions were seen lasting 11-43 s); on expiry the app stops the session and offers retry or typing.
- **Voices:** dedupe `speechSynthesis` voices by `voiceURI`. Prefer es-MX, then es-US, es, es-ES. The voice is a Settings choice. Chromebook exposes no es-MX voice.
- **Speech, offline:** Chrome STT fails offline with error "network". Show a clear offline message and offer the text box. Local TTS works offline.
- **Network:** every request goes through one `fetchWithTimeout` (default 10 s, longer for LLM calls) because the always-on VPN makes offline requests hang for minutes. Never rely on `navigator.onLine`.
- **Gemini:** the model ID is a setting, default `gemini-3.5-flash-lite`. Handle 429 and 503 with backoff. Free-tier limits for this account are unknown. The lite model's explanations are sometimes confusing, so the UI shows the corrected sentence first and the explanation as secondary text.
- **Secrets:** the Gemini key and the GitHub PAT stay in device browser storage and are never exported, synced or committed.
- **Seed content:** the vocabulary and grammar notes are AI-authored and not verified by a fluent speaker. Errors are expected; flagged items are corrected in the JSON.

## Screens

- **Home:** due and new card counts; entry points to the three modules and Settings.
- **Scaffolding:** a short grammar note (about 10 A1 topics) is shown before its related cards unlock. A review card shows one of the types below, with a grade after the answer. A session summary follows. A daily new-card limit (default 10, adjustable) applies on top of due reviews.
  - Card types: recognition (Spanish to English); typed production (English to Spanish); listening (TTS plays, you pick the meaning); spoken production (you say it, STT checks it).
- **Input Sandbox:**
  - Passage picker: generate an A1 passage with Gemini, or open a saved one. Saved passages work offline.
  - Reader: tap an unknown word to save it into the SRS. A read-aloud button plays the passage with TTS.
  - Questions: multiple choice, written by Gemini with the passage and graded locally.
  - Result: score and the words you missed.
- **Roleplay:** a list of about 5 hand-written scenarios, each with a goal and target phrases. In a conversation, tap to talk (a fresh STT session per turn) or type in an always-available text box. The partner replies in character with TTS. Each of your turns gets a short English grammar note from the same Gemini reply. An end summary closes the scenario.
- **Settings:** Gemini key, model ID, GitHub PAT and sync repo, voice picker, new-card limit, Export/Import JSON, Sync now with last-synced time, and offline and status messages.

## Milestones

Each milestone should fit one Claude Pro 5-hour window. **[A]** is an automated check; **[D]** is a short device checklist you run.

- **M0 Shell and deploy.** Vite, React, TypeScript, hash routes, `base` path, GitHub Actions deploy, nav shell. No `vite-plugin-pwa` and no service worker here. The existing `src/spike/` code: the app shell replaces `App` as the entry; the speech test page stays at a hidden route (`#/spike/speech`) until M3 replaces it, then M3 deletes the spike code. [A] typecheck; unit smoke; e2e loads every route, including the speech test page. [D] the Pages URL opens on Chromebook, iPhone and iPad.
- **M1 Data layer.** Dexie schema, append-only review log, export/import (secrets excluded), `fetchWithTimeout`, retry/backoff. [A] export/import round-trip; secrets absent from the export; a timeout fires against a hanging stub.
- **M2 Settings and LLM service.** Key, model and PAT storage; provider interface with the Gemini adapter; test-connection button; 429/503 backoff; offline message. [A] mocked-Gemini tests for success, 429 and timeout; default model is `gemini-3.5-flash-lite`. [D] test-connection succeeds on all three devices.
- **M3 Speech services.** TTS adapter (dedupe, es-MX preference), STT adapter (fresh session, watchdog, offline error), speech-check panel in Settings. Then delete `src/spike/` and the hidden route. [A] fake-engine tests for dedupe, watchdog and session restart; no `src/spike` references remain. [D] TTS then STT works twice in a row on iPhone and iPad; the Chromebook offline error message shows.
- **M4 SRS core and seed content.** `ts-fsrs` wrapper, review queue, new-card limit, seed JSON and loader. Seed content is AI-authored, not verified by a fluent speaker. [A] scheduling, queue and limit tests; seed schema validation; any item you flag is corrected in the JSON and pinned by a test. [D] you spot-check a sample of about 20 items, spread across vocabulary and grammar notes.
- **M5 Scaffolding UI I.** Home, grammar-note gating, recognition and typed production reviews, session summary. [A] e2e review flow persists to Dexie. [D] a review session on all three devices, online.
- **M6 Offline app-shell caching.** A hand-written service worker (no new dependency) caches the app shell only, not Gemini, GitHub or other API calls. Manifest and icons. Explicit update path: a new deploy replaces the cached app on the next load with no stale copies (build-versioned cache, old caches deleted, new worker activates, the page reloads once). [A] Chromium Playwright: loads offline after one visit; after a simulated new deploy the next load serves the new build and the old cache is gone; API calls are not cached. [D] offline load of the installed app and a Safari tab on Chromebook, iPhone and iPad (iPad offline included); an update check after a deploy.
- **M7 Scaffolding UI II.** Listening cards and spoken production. [A] fake-speech e2e. [D] a spoken card works on iPhone and iPad after TTS plays.
- **M8 Input Sandbox I.** Passage generation (JSON schema, validation), Dexie cache, reader with tap-to-save into the SRS. [A] mocked-Gemini tests cover malformed JSON and retries; cached passages open offline. [D] generate and read a passage on a device.
- **M9 Input Sandbox II.** TTS read-aloud, locally graded multiple-choice questions, score and missed-word extraction. [A] grading tests. [D] the listening flow on iPhone and iPad.
- **M10 Roleplay.** Scenarios, the turn loop (STT, Gemini, TTS), per-turn feedback note, text-box fallback, end summary. [A] mocked-LLM and fake-speech turn-loop tests; the watchdog falls back to the text box. [D] a full scenario on iPhone and iPad.
- **M11 Sync.** GitHub Contents API client, merge of append-only logs, retry on a 409, Sync now UI. [A] merge and 409 tests against a stub. [D] sync across two devices; an offline failure shows cleanly.
- **M12 Hardening and release.** Error states, final device checklist, docs. [A] the full test suite. [D] the full checklist on Chromebook, iPhone and iPad including home-screen apps; record verified or failed results in `docs/DEVICES.md`.

Roleplay (M10) can slip past sync or release if time runs short.

## Out of scope for v1

- MacBook and macOS Safari support.
- Fallback LLM providers or fallback audio engines.
- Accounts, social features, streaks and gamification.
- Gemini Live and any continuous or hands-free voice mode.
- Gemini-invented or user-typed roleplay scenarios.
- Free-text answers graded by Gemini.
- Automatic sync (v1 sync is a manual button).

## Open items

- Gemini free-tier limits for this account are unknown (check AI Studio).
- iOS storage eviction over days is unverified.
- Not yet tested: iPad home-screen offline, Dexie offline behavior, long idle periods.
- Whether the Gemini key's `github.io` referrer restriction is enforced.
- The seed content has not been checked by a fluent speaker.
