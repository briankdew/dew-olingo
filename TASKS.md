# Tasks

> Update after each completed task so work can resume after a usage-limit interruption.


## Test pipeline (2026-10-20)
- [x] Add Vitest (v4; v5 needs Node >=22.12, local is 20.20.2), Playwright (chromium + webkit), `@types/node`.
- [x] `npm run typecheck`, `npm run build`, `npm test` pass locally. Playwright chromium passes locally.
- [ ] Playwright webkit locally: fails on Crostini, missing `libmanette-0.2.so.0` (needs `sudo npx playwright install-deps webkit`). Not yet run on CI.
- [ ] Push a branch/PR to confirm `.github/workflows/ci.yml` goes green.
- [x] Playwright CI config: `github` + `html` reporters and `trace: 'retain-on-failure'` in CI only (branch `cleanup-test-config`).

## GitHub Contents API CORS (2026-10-20)
- [x] curl: preflight (GET and PUT) from `https://briankdew.github.io` returns 204 with Allow-Origin `*`, PUT, Authorization, Content-Type. Verified (server headers only).
- [x] curl: 401 error response carries Allow-Origin. Verified.
- [x] Playwright Chromium (opt-in `CORS_PROBE=1`, `e2e/github-cors.spec.ts`): GET and PUT with `Authorization` pass CORS, JS reads the 401. Verified.
- [ ] Playwright WebKit: not run locally (`libmanette`, same as above); spec is not run in CI by design.
- [x] Real PAT, private repo, read/write/update/409 via the temporary probe page on Chromebook, iPhone, iPad. Verified 2026-10-21 (home-screen runs user-reported).
- [x] After the PAT test: removed `public/cors-probe.html`; updated the CLAUDE.md "Unverified" item.


## Gemini API spike (2026-10-21)
- [x] curl: preflight from `https://briankdew.github.io` for POST `:generateContent` passes for header auth (`x-goog-api-key`) and `?key=` auth. Verified (server headers only).
- [x] curl: 400 `API_KEY_INVALID` error bodies carry Allow-Origin. Verified.
- [x] Playwright Chromium (opt-in `GEMINI_PROBE=1`, `e2e/gemini-cors.spec.ts`, stubbed github.io origin, dummy key): preflight passes, JS reads the 400. Verified.
- [ ] Playwright WebKit: not run locally (`libmanette`); spec is not run in CI by design.
- [x] Free-tier limits: documented figures do not exist publicly; docs point to AI Studio (see docs/DEVICES.md).
- [x] Wrote `public/gemini-probe.html` (key in memory only; header auth; 5 single-turn prompts plus one two-turn exchange). Smoke-tested against a mocked Gemini in Chromium: key only in the header, no storage, no other hosts, turn 2 sends full history.
- [x] Real key on the real origin: success path and es-MX quality verified on Chromebook, iPhone, iPad (user-run, home-screen via `navigator.standalone`). The `github.io` referrer restriction is not confirmed.
- [ ] Free-tier rate limits for this account: unverified (check AI Studio).
- [x] Follow-up PR: removed `public/gemini-probe.html` and recorded the results in docs/DEVICES.md and CLAUDE.md.


## Offline spike (2026-10-21)
- [x] Probe `public/offline-probe/` (own narrow-scope SW, raw IndexedDB, speech buttons, "Unregister and clear"). Hand-written SW, no new dependency: Workbox/`vite-plugin-pwa` and Dexie specifics are NOT covered.
- [x] Playwright Chromium (`e2e/offline-probe.spec.ts`, `context.setOffline`): shell loads offline after one online visit; SW scope is the probe directory only and the real app is not served by it; IndexedDB survives offline writes, reload, new page, and a full browser restart (persistent profile); reset removes SW, caches, DB; nothing leaves localhost. Proves Chromium mechanics only.
- [ ] Playwright WebKit: spec skipped by design (not iOS Safari; also `libmanette` locally).
- [x] (partial) Real devices, airplane mode: Chromebook tab done; iPhone Safari tab done (offline part PROBABLE, user-reported). NOT done: iPad, home-screen apps, `estimate()`. See docs/DEVICES.md.
- [x] (partial) Speech offline: Chromebook verified (STT fails, local TTS works); iPhone PROBABLE (user-reported). NOT done: iPad.
- [ ] iOS storage eviction: not tested (needs days; optional day-8 reopen if the probe stays deployed).
- [x] Removal PR: probe and spec deleted, results recorded in docs/DEVICES.md and CLAUDE.md.


## v1 milestones (see SPEC.md for criteria)
- [x] M0 Shell and deploy (react-router HashRouter; speech test page kept at `#/spike/speech` until M3; [A] done, [D] device check on the Pages URL still to run)
- [x] M1 Data layer ([A] done: Dexie schema, append-only review log, export/import with secrets excluded, `fetchWithTimeout`, `retryWithBackoff`; no [D])
- [x] M2 Settings and LLM service ([A] done: secrets in localStorage, `LLMProvider` + Gemini adapter with 429/503 backoff, Settings screen with test-connection; [D] test-connection on Chromebook, iPhone, iPad still to run)
- [ ] M3 Speech services (delete `src/spike/`)
- [ ] M4 SRS core and seed content
- [ ] M5 Scaffolding UI I
- [ ] M6 Offline app-shell caching
- [ ] M7 Scaffolding UI II
- [ ] M8 Input Sandbox I
- [ ] M9 Input Sandbox II
- [ ] M10 Roleplay
- [ ] M11 Sync
- [ ] M12 Hardening and release

## Workflow and docs PR (2026-10-22)
- [x] CLAUDE.md status protocol; CI timeouts (job 20 min, Playwright install 10 min); Gemini latency findings in docs/DEVICES.md; slow-reply rule in SPEC.md (design rules and M10).

## Spec (2026-10-21)
- [x] Interview and SPEC.md written; CLAUDE.md "Next step" points to SPEC.md and TASKS.md.
