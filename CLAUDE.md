# Dew O'Lingo

Personal web app for learning Spanish from a very basic starting level. Multimodal: spoken input and audio output. Three modules, sequenced:

1. **Scaffolding Engine** - direct instruction plus spaced repetition (SRS) for foundational vocabulary and syntax.
2. **Input Sandbox** - comprehensible input (reading and listening, A1 level) with automated grading. Missed vocabulary is extracted back into the SRS.
3. **Voice-Driven Roleplay** - task-based language teaching using real-world scenarios with a simulated native speaker and grammatical feedback.

## Hard constraints

- Completely static, client-side app deployed on GitHub Pages. No server-side infrastructure of any kind (no Python, Flask, Node, or other backend).
- Zero cost to develop and use.
- First release targets Chromebook, iPhone, and iPad (the devices tested so far). MacBook is deferred: not required for the first release, but kept as a candidate platform for later. Development happens on a Chromebook (Linux/Crostini).

## Locked stack (ask before changing any of this)

- **App shell:** Vite + React + TypeScript, hash routing, `vite-plugin-pwa`.
- **Hosting:** GitHub Pages, deployed by GitHub Actions.
- **Local data:** Dexie.js (IndexedDB) plus manual JSON export/import.
- **Cloud sync:** a separate private GitHub repo holding a data file, read and written from the browser via the GitHub Contents API with a fine-grained PAT scoped to that repo only. Not a Gist (gists are never private).
- **SRS:** `ts-fsrs` (FSRS-6).
- **LLM:** Google Gemini API, Flash-class free-tier models, called client-side. Bring-your-own-key via a Settings screen.
- **Audio:** native Web Speech API for speech-to-text (Spanish) and text-to-speech.
- **Roleplay loop:** sequential, turn-based: speech to text, then Gemini, then text to speech. Not Gemini Live.

## Decisions already made

- No fallback LLM providers or fallback audio engines in the proof of concept. Keep the LLM behind a small provider interface so one can be added later.
- The Gemini key and the GitHub PAT live only in each device's browser storage. Never commit, bundle, or sync them. The Gemini key is restricted to the `github.io` origin and to the Generative Language API.
- The target dialect is es-MX (Mexican Spanish).
- Review logs are append-only so they merge cleanly across devices.
- The app repo is assumed public, because Pages from a private repo on a free plan is believed unsupported (unverified). No secrets may ever be in this repo.

## Unverified - confirm before building on these

Do not assume any of these work. Test them and report the result as verified or failed.

- **VERIFIED 2026-10-21:** Authenticated browser calls from `https://briankdew.github.io` to `api.github.com`, including read and write of a private repo's contents with a fine-grained PAT (CORS and permissions).
  - Method: temporary page, real PAT scoped to one throwaway private repo (Contents: read/write). Per run: GET existing, PUT update, PUT update with sha, PUT with stale sha, final GET.
  - Result: all steps succeeded and the stale-sha write returned a readable HTTP 409 on Chromebook Chrome 154, iPhone Safari 27.2 (iOS UA 18.7), and iPad Safari 27.0, each in a Safari tab, plus iPad and iPhone home-screen apps.
  - Caveats: home-screen runs are user-reported (the probe did not log display mode). Not tested: long idle periods, large files, rate limits, offline behavior.
- **VERIFIED 2026-10-19:** Spanish speech recognition and synthesis via the Web Speech API on Chromebook (HP Chromebook x360 14c, Chrome 154, online).
  - Recognition: `es-ES` 5/5 phrases correct on the first try. `es-MX` 4/5 on the first try, 5/5 with one retry. No hard errors.
  - Synthesis: 24 Spanish voices, 7 rated 5/5 by ear, 4 of them local. No `es-MX` voice is exposed (only `es-ES`, `es-US`, `es`).
  - `confidence` is not informative (about 0.95 even for a wrong transcript). Transcripts lack punctuation and have inconsistent capitalization.
  - The voice list is likely device-specific (inferred). One speaker, 5 phrases, subjective ratings.
- Spanish speech recognition and speech synthesis via the Web Speech API on MacBook (deferred; not required for the first release). iPhone and iPad results are recorded in docs/DEVICES.md.
- Web Speech and storage behavior offline.
  - **VERIFIED 2026-10-21 (Chromebook Chrome 154, tab):** STT fails offline with error "network" (about 0.3 s after start); local TTS works (es-ES voice; no es-MX voice); IndexedDB persists; the probe shell loaded from the service worker cache.
  - **PROBABLE (iPhone Safari 27.2, tab; user-reported, not directly logged):** Add record, local es-MX TTS and STT all worked offline. `navigator.onLine` stayed true (unreliable on iOS); not known whether recognition ran on-device.
  - Unverified: iPad (any mode), home-screen app offline on any device, Dexie, Workbox/`vite-plugin-pwa`. An always-on VPN made offline requests hang for minutes instead of failing, so the app needs its own timeouts. Details in docs/DEVICES.md.
- **VERIFIED 2026-10-21:** Browser calls from `https://briankdew.github.io` to the Gemini API with a user-supplied free-tier key, including CORS and Spanish quality at A1 level.
  - Method: temporary page, real key typed into a password field, `x-goog-api-key` header, 6 es-MX A1 cases (7 calls, one two-turn).
  - Result: success path on Chromebook Chrome 154 (tab), iPhone Safari 27.2 (tab and home-screen app), iPad Safari 27.0 (tab and home-screen app). `gemini-3.5-flash-lite`: 35 calls across 5 runs, all HTTP 200, no thinking tokens, typically 0.6-2.0 s (3 slow calls: 11, 14.5, 25 s). `gemini-3.6-flash`: 4.6-37.7 s, 2 of 6 calls HTTP 503 "high demand", 473-728 hidden thinking tokens per success.
  - Quality was judged by the AI, not a native speaker: beginner-appropriate es-MX, two-turn context worked, "Yo tiene hambre" always corrected to "tengo" but 4 of 5 lite explanations were confusing.
  - Caveats: home-screen runs identified by `navigator.standalone` (display-mode is unreliable on iOS). Model IDs came from Google's docs and may change, so make the model ID a setting. Not confirmed that the key's `github.io` referrer restriction was enforced. Details in docs/DEVICES.md.
- Gemini free-tier limits for this account (not published in the public docs; check AI Studio; no 429 seen in 35 calls, which does not establish the limit). Free-tier content may be used by Google to improve its products.
- iOS/Safari behavior: browser storage eviction (still unverified: `persisted()` was false; data seen intact only about 1.5 h), and audio playback requiring a user tap.
- Whether a free GitHub plan can publish Pages from a private repo.

## Conventions

- Set the Vite `base` path for GitHub Pages. Use hash routing so refresh never 404s.
- Handle Gemini 429 responses with backoff. Limits can change without warning.
- Add no features or dependencies beyond what is requested.
- Say clearly when something is inferred, unknown, or undocumented. Do not present guesses as facts.
- Keep replies concise.

## Repo structure

```
dew-olingo/
├── .github/workflows/deploy.yml     # build + publish to Pages
├── public/                          # PWA icons, manifest, seed content
├── src/
│   ├── app/                         # router, shell, settings (API key + PAT UI)
│   ├── db/                          # Dexie schema, export/import
│   ├── srs/                         # FSRS scheduler, review queue
│   ├── modules/
│   │   ├── scaffolding/             # direct instruction + SRS drills
│   │   ├── input-sandbox/           # A1 reading/listening, grading, vocab extraction
│   │   └── roleplay/                # scenarios, turn loop, grammar feedback
│   ├── services/
│   │   ├── llm/                     # provider interface + gemini adapter
│   │   ├── stt/                     # webspeech adapter
│   │   ├── tts/                     # speechSynthesis adapter
│   │   └── sync/                    # GitHub Contents API sync
│   ├── prompts/                     # system prompts per module
│   └── lib/                         # rate limiter, retry/backoff, audio utils
├── vite.config.ts
└── package.json
```

## Next step

Run the verification spike (the unverified items above) before building the modules.

## Working rules

- The app must work in Safari on iOS and iPadOS, not just Chrome. Avoid Chrome-only APIs. macOS Safari is deferred with the MacBook.
- Read `docs/DEVICES.md` before touching speech code.
- Never commit API keys or the GitHub PAT; keys are bring-your-own via the settings UI.
- Run available tests before declaring a task done, and update `TASKS.md`.
- Test commands: `npm run typecheck`, `npm test` (Vitest), `npm run test:e2e` (builds, then Playwright).
