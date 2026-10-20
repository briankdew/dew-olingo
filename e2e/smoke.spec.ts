import { test, expect } from '@playwright/test'

test('app loads and hash routing works', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/Dew O'Lingo/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.goto('./#/gemini')
  await expect(page.getByText('Not implemented yet.')).toBeVisible()
})
