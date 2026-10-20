import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4173/dew-olingo/'

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: { baseURL, trace: process.env.CI ? 'retain-on-failure' : 'off' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
