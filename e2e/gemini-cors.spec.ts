import { test, expect } from '@playwright/test'

// Opt-in: hits the real generativelanguage.googleapis.com.
// Run with: GEMINI_PROBE=1 npx playwright test e2e/gemini-cors.spec.ts --project=chromium
// Uses a dummy key only. Never put a real API key in this file.
test.skip(!process.env.GEMINI_PROBE, 'set GEMINI_PROBE=1 to run')

const ORIGIN = 'https://briankdew.github.io'
const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
const BODY = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hola' }] }] })

test.beforeEach(async ({ page }) => {
  // Make the page's origin the real github.io origin. Only this origin is stubbed; the Gemini host is real.
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
  )
  await page.goto(`${ORIGIN}/dew-olingo/`)
})

test('POST with x-goog-api-key header: preflight passes and JS can read the error', async ({ page }) => {
  const r = await page.evaluate(
    async ([url, body]) => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'DUMMY_KEY_NOT_REAL' },
          body,
        })
        const json = await res.json()
        return { ok: true, status: res.status, reason: json.error?.details?.[0]?.reason }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },
    [API, BODY],
  )
  expect(r).toEqual({ ok: true, status: 400, reason: 'API_KEY_INVALID' })
})
