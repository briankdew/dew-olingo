# Device verification log

This content comes from an earlier verification spike.

- Chromebook (Chrome): Web Speech API works for es-MX (5/5 phrases; 4/5 on the first try, 5/5 with one retry). 24 Spanish voices; no native es-MX voice.
- iPhone Safari: see 'iPhone Safari speech findings' below.
- GitHub Contents API CORS: see 'GitHub Contents API CORS' below. Verified 2026-10-21 with a real PAT on Chromebook, iPhone, and iPad (see below).
- Gemini API: see 'Gemini API CORS and limits' below. Verified 2026-10-21 with a real free-tier key on Chromebook, iPhone, and iPad (user-run; see below).
- Not yet tested: MacBook Safari (deferred; not required for the first release), offline behavior, Gemini free-tier rate limits.

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

Not tested: continuous sessions longer than about 2.5 minutes; TTS with AirPods; Silent Mode effects on speaker audio (the user's reports were unclear); a held mic stream (E3).

## iPad Safari speech findings (2026-10-20)

Device: iPad 10th generation. User-reported iOS 27; the page's user agent string reports Safari 27.0 and a Macintosh platform (iPadOS reports as Mac). Tested in a Safari tab only, on the device mic and speaker.

- Safari exposes webkitSpeechRecognition and speechSynthesis. Mic permission started as "prompt", then granted.
- Continuous session (continuous=true, no stop between phrases), es-MX, no TTS: 5/5 phrases captured, final confidence 0.986-0.998, no errors.
- Continuous session, es-MX, with TTS: phrases 1 and 2 captured; after Paulina (super-compact) played, phrases 3-5 produced no events at all (not even speechstart), and the user had to tap Done each time (20-24 s). Same silent failure as iPhone trial 1. Working assumption (unproven, one trial): TTS playback breaks the live recognition session; start a fresh session after each playback and add a watchdog timer.
- Voices: 2 Spanish voices at first load (Mónica es-ES and Paulina es-MX, both super-compact, 69 total); the list later grew to 4 (compact versions added, 71 total). Voice quality rated by one listener: Paulina super-compact 5, Mónica super-compact 1. Compact variants not played.

Not tested: home-screen mode on iPad; TTS before any recognition; continuous sessions longer than about 2 minutes.

## GitHub Contents API CORS (2026-10-20)

Question: can a page on `https://briankdew.github.io` call `api.github.com` (Contents API) from the browser, including the preflight for an authenticated PUT?

**Verified (curl, Origin `https://briankdew.github.io`, no PAT):**
- `OPTIONS` preflight for PUT (request headers `authorization,content-type,x-github-api-version`): HTTP 204, `access-control-allow-origin: *`, `access-control-allow-methods: GET, POST, PATCH, PUT, DELETE`, `access-control-allow-headers` includes `Authorization`, `Content-Type`, `If-Match`, `X-GitHub-Api-Version`. `access-control-max-age: 86400`. The GET preflight is identical.
- Unauthenticated GET of a public repo file: HTTP 200 with `access-control-allow-origin: *`.
- PUT with a dummy token to a nonexistent repo: HTTP 401 `Bad credentials`, still with `access-control-allow-origin: *`. Error responses are readable cross-origin.
- `access-control-expose-headers` includes `ETag`, `Retry-After`, `X-RateLimit-*`.
- curl shows what the server sends, not what a browser enforces.

**Verified (Playwright Chromium, opt-in `e2e/github-cors.spec.ts`, page origin stubbed as `https://briankdew.github.io`, dummy token):**
- GET with `Authorization`: JS reads status 401.
- PUT with `Authorization`, `Content-Type: application/json`, `X-GitHub-Api-Version`: preflight passes, JS reads 401 `Bad credentials`.

**Unverified:**
- Playwright WebKit: fails to launch on Crostini (missing `libmanette-0.2.so.0`); the spec is not run in CI (opt-in, external network). Playwright WebKit is not iOS Safari anyway.
- Fine-grained PAT scoped to one private repo: read and write of contents, `sha` update flow, 409 on a stale `sha`. Needs a real PAT in a real browser.
- iPhone Safari, iPad Safari, home-screen app (ITP, content blockers).
- The `*` Allow-Origin is inferred to be sufficient because requests use no cookies (fetch `credentials` default). Not tested with `credentials: 'include'`, which the app should not use.

**Verified 2026-10-21 (real PAT, real browsers):**
- Method: a temporary page on `https://briankdew.github.io`, run with a real fine-grained PAT scoped to one throwaway private repo (Contents: read/write). Sequence per run: GET existing, PUT update, PUT update with `sha`, PUT with a stale `sha`, final GET.
- Result: all steps succeeded and the stale-`sha` write returned a readable HTTP 409 on Chromebook Chrome 154, iPhone Safari 27.2 (iOS UA 18.7), and iPad Safari 27.0, each in a Safari tab, plus the iPad and iPhone home-screen apps.
- Caveats: the home-screen runs are user-reported, since the probe did not log display mode. Not tested: long idle periods, large files, rate limits, offline behavior.
- The throwaway PAT was deleted. The temporary probe page was removed from the repo.

## Gemini API CORS and limits (2026-10-21)

Question: can a page on `https://briankdew.github.io` call `generativelanguage.googleapis.com` with a user-supplied key?

**Verified (curl, Origin `https://briankdew.github.io`, dummy key `DUMMY_KEY_NOT_REAL`):**
- `OPTIONS` preflight for POST to `/v1beta/models/<model>:generateContent`: HTTP 200, `access-control-allow-origin: https://briankdew.github.io` (the origin is echoed, not `*`), `allow-methods: DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT`, `allow-headers` echoes `content-type,x-goog-api-key`, `max-age: 3600`. Same for `?key=` auth with `content-type` only.
- POST with the dummy key, both auth styles: HTTP 400 `API_KEY_INVALID`, with Allow-Origin present, so error bodies are readable cross-origin.
- curl shows what the server sends, not what a browser enforces.

**Verified (Playwright Chromium, opt-in `e2e/gemini-cors.spec.ts`, page origin stubbed as `https://briankdew.github.io`, dummy key):** POST with `x-goog-api-key` and JSON body: preflight passes and JS reads status 400 and `API_KEY_INVALID`.

**Verified 2026-10-21 (real free-tier key, real origin; run by the user, results as reported):**
- Method: a temporary page on `https://briankdew.github.io`, a real free-tier API key typed into a password field (in memory only), sent in the `x-goog-api-key` header, 6 es-MX A1 prompt cases (7 calls, including one two-turn exchange).
- Success path from the real origin: Chromebook Chrome 154 (tab), iPhone Safari 27.2 (tab and home-screen app), iPad Safari 27.0 (tab and home-screen app). Home-screen runs are identified by `navigator.standalone` being true; the display-mode line reported "browser" even there, so it is not reliable on iOS.
- `gemini-3.6-flash`: replies in 4.6 to 37.7 s; 2 of 6 calls returned HTTP 503 "high demand" (16-18 s to fail); each success used 473-728 hidden thinking tokens.
- `gemini-3.5-flash-lite`: 35 calls across 5 runs, all HTTP 200, no thinking tokens, 68-262 total tokens per call, typical latency 0.6-2.0 s, with 3 slow calls (11, 14.5, 25 s).
- Quality (judged by the AI, not a native speaker): beginner-appropriate es-MX. "Yo tiene hambre" was always corrected to "tengo", but 4 of 5 lite runs gave a confusing explanation. Two-turn context worked.
- The temporary probe page (`public/gemini-probe.html`) was removed from the repo afterwards.

**Unverified:**
- Free-tier rate limits: the docs publish no figures (check AI Studio). No 429 was seen in 35 lite calls, which does not establish the limit.
- Whether the key's `github.io` HTTP-referrer restriction was enforced: the run reports do not say if the key was restricted, so this is not confirmed.
- Model IDs came from Google's docs and may change; the app should make the model ID a setting.
- Free-tier content may be used by Google to improve its products.
- Quality is one AI judgment of a few prompts, not a native speaker's.
- Playwright WebKit: fails to launch on Crostini (missing `libmanette-0.2.so.0`); not iOS Safari anyway.
- Offline behavior; long idle periods.
- `GET /v1beta/models` needs a valid key (dummy key returns 400), so model IDs below come from the docs, not from the API.

**Free-tier limits (documented, fetched 2026-10-21):**
- https://ai.google.dev/gemini-api/docs/rate-limits : no free-tier RPM/TPM/RPD figures are published. The page says to view active limits in Google AI Studio. Limits are applied per project, not per API key; daily quotas reset at midnight Pacific; "Specified rate limits are not guaranteed"; limits change automatically with tier and account status; preview/experimental models are stricter. The exact numbers for this account are unverified: check AI Studio.
- https://ai.google.dev/gemini-api/docs/pricing : every text Flash and Flash-Lite model listed has a free tier ("Free of charge"). The "Used to improve our products" row is Yes for the free tier and No for the paid tier.
- https://ai.google.dev/gemini-api/docs/models : stable Flash-class IDs `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; `gemini-3-flash-preview` is preview; `gemini-2.5-flash` and `-lite` are not deprecated but limited to users who have used them before; `gemini-2.0-flash` and `-lite` are shut down. No shutdown dates for Flash-class models on that page.
- The page content came through a summarizing fetch tool, not a raw read; confirm the figures in the docs before relying on them.
