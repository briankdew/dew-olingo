import { test, expect, type Page } from '@playwright/test'

const FAKE_KEY = 'FAKE_GEMINI_KEY_NOT_REAL'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-goog-api-key',
  'access-control-allow-methods': 'POST',
}

async function stubGemini(page: Page, status: number, body: unknown) {
  const seen: { url: string; key: string | undefined; post: string }[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    seen.push({ url: req.url(), key: req.headers()['x-goog-api-key'], post: req.postData() ?? '' })
    return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return seen
}

test('key is masked, test connection succeeds, key only in the header', async ({ page }) => {
  const seen = await stubGemini(page, 200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
  await page.goto('./#/settings')
  const key = page.getByLabel(/Gemini API key/)
  await expect(key).toHaveAttribute('type', 'password')
  await key.fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText('saved (ends …REAL)')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(FAKE_KEY)

  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByTestId('test-result')).toContainText('Connected')
  expect(seen).toHaveLength(1)
  expect(seen[0].key).toBe(FAKE_KEY)
  expect(seen[0].url).toContain('gemini-3.5-flash-lite')
  expect(seen[0].url).not.toContain(FAKE_KEY)
  expect(seen[0].post).not.toContain(FAKE_KEY)

  await page.reload()
  await expect(page.getByText('saved (ends …REAL)')).toBeVisible()
})

test('test connection reports an auth failure', async ({ page }) => {
  await stubGemini(page, 400, { error: { message: 'API key not valid' } })
  await page.goto('./#/settings')
  await page.getByLabel(/Gemini API key/).fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByTestId('test-result')).toContainText('Failed (auth)')
})

test('test connection without a key asks for one', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByTestId('test-result')).toContainText('Save a Gemini key first')
})

test('test connection shows elapsed seconds while waiting, and a non-auth 400 is not called auth', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    await new Promise((r) => setTimeout(r, 2500))
    return route.fulfill({
      status: 400,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'unsupported option' } }),
    })
  })
  await page.goto('./#/settings')
  await page.getByLabel(/Gemini API key/).fill(FAKE_KEY)
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByRole('button', { name: 'Test connection' }).click()
  await expect(page.getByTestId('test-result')).toContainText(/Testing… [12] s/)
  await expect(page.getByTestId('test-result')).toContainText('Failed (bad-request)')
})
