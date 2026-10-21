import { test, expect } from '@playwright/test'

const SCREENS = [
  { hash: '#/', heading: 'Home' },
  { hash: '#/scaffolding', heading: 'Scaffolding' },
  { hash: '#/input-sandbox', heading: 'Input Sandbox' },
  { hash: '#/roleplay', heading: 'Roleplay' },
  { hash: '#/settings', heading: 'Settings' },
  { hash: '#/spike/speech', heading: 'Speech test (spike)' },
]

test('home loads with the app title', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/Dew O'Lingo/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Dew O'Lingo")
})

for (const { hash, heading } of SCREENS) {
  test(`route ${hash} renders without errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto(`./${hash}`)
    await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('nav links navigate and hide the spike route', async ({ page }) => {
  await page.goto('./')
  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link')).toHaveCount(5)
  await nav.getByRole('link', { name: 'Roleplay' }).click()
  await expect(page).toHaveURL(/#\/roleplay$/)
  await expect(page.getByRole('heading', { level: 2, name: 'Roleplay' })).toBeVisible()
})

test('unknown hash shows Not found', async ({ page }) => {
  await page.goto('./#/nope')
  await expect(page.getByRole('heading', { level: 2, name: 'Not found' })).toBeVisible()
})
