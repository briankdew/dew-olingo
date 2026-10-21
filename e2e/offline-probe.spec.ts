import { chromium, test, expect, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Proves the mechanism in Chromium only. iOS Safari, real airplane mode, speech
// recognition, and storage eviction need a real device (see TASKS.md).
test.skip(({ browserName }) => browserName !== 'chromium', 'Playwright WebKit is not iOS Safari; devices cover Safari')

const PROBE = 'offline-probe/'

// Wait until the probe's startup (IDB, SW registration, fetch checks) has finished.
async function ready(page: Page) {
  await expect(page.locator('#shell-source')).not.toHaveText('...')
  await expect(page.locator('#sw-state')).toContainText('active')
  await page.evaluate(() => navigator.serviceWorker.ready)
}

// One online visit that installs the SW, then a reload so the page is controlled.
async function visitOnline(page: Page) {
  await page.goto(PROBE)
  await ready(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('#sw-controlled')).toHaveText('yes')
}

test('shell loads offline after one online visit and nothing leaves localhost', async ({ page, context }) => {
  const urls: string[] = []
  context.on('request', (r) => urls.push(r.url()))
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await visitOnline(page)
  await expect(page.locator('#shell-source')).toHaveText('cache')
  await expect(page.locator('#uncached')).toHaveText(/^HTTP /) // vite preview answers 200 (SPA fallback), GitHub Pages 404; either way it resolves online
  await expect(page.locator('#realapp')).toHaveText('HTTP 200')

  await context.setOffline(true)
  await page.reload()
  await ready(page)
  await expect(page).toHaveTitle(/Offline probe/)
  await expect(page.locator('#shell-source')).toHaveText('cache')
  await expect(page.locator('#uncached')).toHaveText('failed')
  await expect(page.locator('#realapp')).toHaveText('failed')

  expect(urls.filter((u) => !u.startsWith('http://localhost:4173/'))).toEqual([])
  expect(errors).toEqual([])
})

test('SW scope is the probe directory and the real app is not served by it', async ({ page, context }) => {
  await visitOnline(page)
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))
  expect(regs).toEqual(['http://localhost:4173/dew-olingo/offline-probe/'])

  const app = await context.newPage()
  await app.goto('./')
  await expect(app).toHaveTitle(/Dew O'Lingo/)
  expect(await app.evaluate(() => navigator.serviceWorker.controller)).toBeNull()

  await context.setOffline(true)
  await expect(app.goto('./')).rejects.toThrow()
})

test('IndexedDB data survives offline use, reload, and a new page', async ({ page, context }) => {
  await visitOnline(page)
  await context.setOffline(true)
  await page.reload()
  await ready(page)
  await page.locator('#add-record').click()
  await page.locator('#add-record').click()
  await expect(page.locator('#idb-manual')).toHaveText('2')

  await page.reload()
  await ready(page)
  await expect(page.locator('#idb-manual')).toHaveText('2')

  const second = await context.newPage()
  await second.goto(PROBE)
  await ready(second)
  await expect(second.locator('#idb-manual')).toHaveText('2')
})

test('shell and IndexedDB data survive a full browser restart, then work offline', async ({ baseURL }) => {
  const dir = await mkdtemp(join(tmpdir(), 'offline-probe-'))
  const launch = (): Promise<BrowserContext> => chromium.launchPersistentContext(dir, { baseURL })
  try {
    let ctx = await launch()
    let page = await ctx.newPage()
    await visitOnline(page)
    await page.locator('#add-record').click()
    await expect(page.locator('#idb-manual')).toHaveText('1')
    await ctx.close()

    ctx = await launch()
    await ctx.setOffline(true)
    page = await ctx.newPage()
    await page.goto(PROBE)
    await ready(page)
    await expect(page.locator('#idb-manual')).toHaveText('1')
    await expect(page.locator('#shell-source')).toHaveText('cache')
    await ctx.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Unregister and clear removes the SW, caches, and database', async ({ page, context }) => {
  await visitOnline(page)
  await page.locator('#add-record').click()
  await page.locator('#reset').click()
  await expect(page.locator('#reset-result')).toContainText('deleted')

  const left = await page.evaluate(async () => ({
    regs: (await navigator.serviceWorker.getRegistrations()).length,
    caches: (await caches.keys()).filter((k) => k.startsWith('offline-probe-')),
    dbs: (await indexedDB.databases()).map((d) => d.name),
  }))
  expect(left.regs).toBe(0)
  expect(left.caches).toEqual([])
  expect(left.dbs).not.toContain('offline-probe')

  await context.setOffline(true)
  await expect(page.goto(PROBE)).rejects.toThrow()
})

test('?reset=1 clears without registering again', async ({ page }) => {
  await visitOnline(page)
  await page.goto(`${PROBE}?reset=1`)
  await expect(page.locator('#reset-result')).toContainText('deleted')
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
  expect(regs).toBe(0)
})

test('speech section feature-detects without throwing (real STT/TTS need a device)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(PROBE)
  await ready(page)
  await expect(page.locator('#speech-support')).toContainText('speechSynthesis=')
  await page.locator('#speak-local').click()
  await page.locator('#speak-remote').click()
  expect(errors).toEqual([])
})
