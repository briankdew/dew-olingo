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
- [ ] Real PAT, private repo, read/write/update/409 via `public/cors-probe.html` on Chromebook, iPhone, iPad. UNVERIFIED (needs the user).
- [ ] After the PAT test: remove `public/cors-probe.html`; update the CLAUDE.md "Unverified" item.

