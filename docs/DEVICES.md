# Device verification log

This content comes from an earlier verification spike.

- Chromebook (Chrome): Web Speech API works for es-MX (5/5 phrases; 4/5 on the first try, 5/5 with one retry). 24 Spanish voices; no native es-MX voice.
- iPhone Safari: see 'iPhone Safari speech findings' below.
- GitHub Contents API CORS: see 'GitHub Contents API CORS' below. Verified 2026-10-21 with a real PAT on Chromebook, iPhone, and iPad (see below).
- Not yet tested: MacBook Safari (deferred; not required for the first release), offline behavior, Gemini API.

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
