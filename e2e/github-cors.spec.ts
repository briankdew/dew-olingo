import { test, expect } from '@playwright/test'

// Opt-in: hits the real api.github.com (unauthenticated limit is 60 requests/hour per IP).
// Run with: CORS_PROBE=1 npx playwright test e2e/github-cors.spec.ts
// Uses a dummy token only. Never put a real PAT in this file.
test.skip(!process.env.CORS_PROBE, 'set CORS_PROBE=1 to run')

const ORIGIN = 'https://briankdew.github.io'
const API = 'https://api.github.com/repos/briankdew/dew-olingo-cors-probe-nonexistent/contents/probe.json'

test.beforeEach(async ({ page }) => {
  // Make the page's origin the real github.io origin. Only this origin is stubbed; api.github.com is real.
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
  )
  await page.goto(`${ORIGIN}/dew-olingo/`)
})

test('GET with Authorization header: JS can read the response', async ({ page }) => {
  const r = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { headers: { Authorization: 'Bearer invalid', Accept: 'application/vnd.github+json' } })
      return { ok: true, status: res.status }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, API)
  expect(r).toEqual({ ok: true, status: 401 })
})

test('PUT with Authorization + JSON body: preflight passes and JS can read the response', async ({ page }) => {
  const r = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer invalid',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ message: 'probe', content: btoa('{}') }),
      })
      const body = await res.json()
      return { ok: true, status: res.status, message: body.message }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }, API)
  expect(r).toEqual({ ok: true, status: 401, message: 'Bad credentials' })
})
