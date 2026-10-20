# Tasks

> Update after each completed task so work can resume after a usage-limit interruption.


## Test pipeline (2026-10-20)
- [x] Add Vitest (v4; v5 needs Node >=22.12, local is 20.20.2), Playwright (chromium + webkit), `@types/node`.
- [x] `npm run typecheck`, `npm run build`, `npm test` pass locally. Playwright chromium passes locally.
- [ ] Playwright webkit locally: fails on Crostini, missing `libmanette-0.2.so.0` (needs `sudo npx playwright install-deps webkit`). Not yet run on CI.
- [ ] Push a branch/PR to confirm `.github/workflows/ci.yml` goes green.
