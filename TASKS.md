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
