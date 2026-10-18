# Dew O'Lingo

Personal web app for learning Spanish from a very basic starting level. Multimodal: spoken input and audio output. Three modules, sequenced:

1. **Scaffolding Engine** - direct instruction plus spaced repetition (SRS) for foundational vocabulary and syntax.
2. **Input Sandbox** - comprehensible input (reading and listening, A1 level) with automated grading. Missed vocabulary is extracted back into the SRS.
3. **Voice-Driven Roleplay** - task-based language teaching using real-world scenarios with a simulated native speaker and grammatical feedback.

## Hard constraints

- Completely static, client-side app deployed on GitHub Pages. No server-side infrastructure of any kind (no Python, Flask, Node, or other backend).
- Zero cost to develop and use.
- Must work on iPhone, iPad, MacBook, and Chromebook. Development happens on a Chromebook (Linux/Crostini).

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
- Review logs are append-only so they merge cleanly across devices.
- The app repo is assumed public, because Pages from a private repo on a free plan is believed unsupported (unverified). No secrets may ever be in this repo.

## Unverified - confirm before building on these

Do not assume any of these work. Test them and report the result as verified or failed.

- Authenticated browser calls from a `github.io` origin to `api.github.com`, including read and write of a private repo's contents with a fine-grained PAT (CORS and permissions).
- Spanish speech recognition and speech synthesis quality via the Web Speech API on Chromebook, iPhone, iPad, and MacBook.
- Gemini free-tier limits for this account (not published in the public docs; check AI Studio) and Gemini's Spanish quality at A1 level. Free-tier content may be used by Google to improve its products.
- iOS/Safari behavior: browser storage eviction, and audio playback requiring a user tap.
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
