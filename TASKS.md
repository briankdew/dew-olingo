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
- [x] M3 Speech services ([A] done: TTS adapter with voice dedupe and es-MX preference, STT adapter with fresh session per listen and watchdog W0-W4, speech-check panel in Settings, `src/spike/` and the hidden route deleted; [D] on iPhone, iPad and Chromebook still to run, see M3 section)
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

## M2 follow-ups (2026-10-22)
- [x] Timeout message names the seconds and says Gemini may be slow or you may be offline; Test connection shows elapsed seconds while waiting.
- [x] HTTP 400 is `auth` only for API_KEY_INVALID / "API key not valid"; other 400s are the new `bad-request` kind. 401 and 403 stay `auth`.
- [x] Codex PR #16: `Retry-After` HTTP-date form is parsed (capped at 60 s); Settings no longer overwrites a field the user already edited with a late-loading stored value.
- [ ] Follow-up: the late-load guard in Settings has no automated test (needs slow IndexedDB; no component-test setup). Checked by reading only.
- [ ] Follow-up (Codex, PR #18): a 400 whose body is valid JSON of an odd shape (for example `null`) can throw a TypeError in `isInvalidKey` or `body.error` in `src/services/llm/gemini.ts` instead of classifying as `bad-request`. Read from the code only; not reproduced, not fixed.

## CI install hang (2026-10-22)
- [x] Logs of the three hung runs (39798768796, 39803111143, 39840307091) read: all stalled in the apt-get phase of `playwright install --with-deps` (package downloads from azure.archive.ubuntu.com stalling, `Ign:` about 2 min after `Get:`). Passing runs finish the step in 30-60 s.
- [x] Added a step before the install that sets apt `Acquire::Retries 3` and a 30 s timeout. Nothing else in `ci.yml` changed.
- Not established: why the mirror stalls, and whether the two older hangs stalled at the same point (their logs go silent after apt starts).
- [x] Retry loop built: the install is wrapped in 3 attempts of `timeout 240`, 20 s apart, step `timeout-minutes: 15`. The apt.conf.d step was removed (it did not prevent the hang).
- **Result (PR #20, same day): the apt change did not prevent the hang.** The step ran, yet the install stalled again on `libcodec2-1.2` (9 MB, `Ign:` after about 100 s, same package as the PR #17 hang) and hit the 10-minute step timeout at package 28 of 181. A 30 s no-data timeout does not fire when data trickles in, so the stall is slow transfer from azure.archive.ubuntu.com, not a dead connection (inferred). A different failure also appeared once: `packages.microsoft.com` returned 403 during `apt update` (exit 100). Both cleared on re-trigger. So the retry-loop step above is now justified; not built yet.
- **Finding (CI runs #82 on bd3f04d and #87, 2026-10-23):** attempt 1 hit `timeout 240` during the package download stall. `timeout` killed npx but not its apt-get child (PID 3000), which kept the dpkg lock, so attempts 2 and 3 failed at once with "Could not get lock /var/lib/dpkg/lock-frontend". The retry loop gave no real retries. (#82 read from its log; #87 as described by the user, log not re-read.)
- [x] Fix (PR A): `timeout -k 15 240`; after a failed attempt `sudo pkill -x apt-get` and `sudo pkill -x dpkg`, wait up to 30 s for the lock to be free, `sudo dpkg --configure -a`, then the existing 20 s pause. Prints each attempt's elapsed seconds. **Partly verified on PR #25's own CI (run 39984510941):** all three attempts stalled on the download (241, 240, 240 s), but attempts 2 and 3 ran normally with no dpkg lock error, so the lock release works. A fourth case of the mirror being too slow for `timeout 240` remains: three attempts can all stall. `gh run rerun --failed` then passed. Not verified: the `dpkg --configure -a` and 30 s lock-wait paths on a stalled run (no log line shows them).
- [ ] If installs still hang, try running the Playwright tests in the official Playwright container image (unverified; its version must match the installed Playwright).

## M3 Speech services (2026-10-22)
- [x] `services/tts` (dedupe by voiceURI, es-MX > es-US > es > es-ES, `speak()` settles only on end), `services/stt` (new recognizer per `listen()`, abort and wait for `end` before the next, watchdog W0-W4 keyed on `audiostart` and `result`), `services/speech.ts` wiring (listen refused while TTS plays; speak aborts a live session).
- [x] Settings speech-check panel: voice picker (saved in Dexie), Play sample, Listen, Self-test (Part A listen-listen, Part B speak-listen x2) with a timestamped event list after every listen.
- [x] Deleted `src/spike/`, the hidden route and its tests; `noSpike.test.ts` scans src, e2e and public.
- [x] Fake-engine tests (Vitest) and e2e with fake engines (Chromium passes locally; WebKit needs `libmanette` locally, runs in CI).
- [ ] [D] iPhone and iPad, tab and home-screen app: run Self-test, record Part A and Part B separately with the event lists. If Part A hangs, decide on a continuous-session approach before M10 (DEVICES.md: fresh recognizer per tap hung on iPhone; not built).
- [ ] [D] Chromebook: voice fallback note, Listen, offline message; mic-denied and silent-Listen checks on iPhone and iPad.
- [ ] Unverified on iOS: `end` firing after `abort()`; `audiostart` and `result` events arriving as assumed; whether the fresh-session rule works at all.
- [x] Codex review on PR #20 (2 P2 findings, both fixed in this PR): panel unmount now aborts the self-test, the active session and TTS; voices with empty voiceURI get distinct option ids (`voiceId`).
- Note: `hidden` in `routes.ts` is now unused (kept, harmless).

## Spec (2026-10-21)
- [x] Interview and SPEC.md written; CLAUDE.md "Next step" points to SPEC.md and TASKS.md.

## Speech-check panel UX (2026-10-23)
- [x] Self-test explanation, progress line, Stop test, summary with plain verdict, voice used, Copy results, panel-specific STT messages (`sttMessage(kind, 'panel')`; conversation wording unchanged). Tests: unit (summary, report, message contexts) and e2e.
- [ ] [D] Run Self-test on iPhone and iPad (tab and home-screen app) and paste the Copy results output.

## Voice picker collapse (2026-10-23)
- [x] One picker entry per name+language, compact over super-compact; saved hidden voice falls back to its kept sibling; groups with other quality tags are reported by `collapseByQuality` (not shown in the UI).
- [ ] Codex review of PR #23 never finished (status stayed "running" for 35+ min at merge). Re-run with `@codex review` on a follow-up PR or read the diff.
- [ ] [D] On iPhone, confirm the picker shows one entry per voice and that the real voiceURIs contain "compact" / "super-compact" (not verified).

