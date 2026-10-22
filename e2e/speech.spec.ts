import { test, expect, type Page } from '@playwright/test'

/**
 * Installs a fake recognition engine and a fake speechSynthesis before the app loads.
 * `window.__fake.script` picks what each recognition session does: 'good', 'silent' (audio opens, no result),
 * 'offline' (error "network"). The function body is serialized into the page, so it must not use imports.
 */
async function installFakes(page: Page, script: 'good' | 'silent' | 'offline') {
  await page.addInitScript((initial) => {
    const w = window as unknown as Record<string, unknown>
    w.__fake = { script: initial, instances: 0 }
    const fake = w.__fake as { script: string; instances: number }

    class FakeRecognition {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onstart: (() => void) | null = null
      onaudiostart: (() => void) | null = null
      onaudioend: (() => void) | null = null
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {
        fake.instances++
        setTimeout(() => this.onstart?.(), 5)
        if (fake.script === 'offline') {
          setTimeout(() => this.onerror?.({ error: 'network' }), 300)
          setTimeout(() => this.onend?.(), 310)
          return
        }
        setTimeout(() => this.onaudiostart?.(), 20)
        if (fake.script !== 'good') return
        const mk = (t: string, isFinal: boolean) => ({
          resultIndex: 0,
          results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: t } } },
        })
        setTimeout(() => this.onresult?.(mk('ho', false)), 100)
        setTimeout(() => this.onresult?.(mk('hola', true)), 200)
        setTimeout(() => this.onaudioend?.(), 210)
        setTimeout(() => this.onend?.(), 220)
      }
      stop() {}
      abort() {
        setTimeout(() => this.onend?.(), 5)
      }
    }
    w.webkitSpeechRecognition = FakeRecognition
    w.SpeechRecognition = undefined

    // The iPhone listed every voice three times; the app must show each once.
    const base = [
      { voiceURI: 'es-es-1', name: 'Monica', lang: 'es-ES', localService: true, default: false },
      { voiceURI: 'es-mx-1', name: 'Paulina', lang: 'es-MX', localService: true, default: false },
      { voiceURI: 'en-1', name: 'Alex', lang: 'en-US', localService: true, default: true },
    ]
    const voices = [...base, ...base, ...base]
    const listeners = new Set<() => void>()
    const synth = {
      getVoices: () => voices,
      speak: (u: { onend: (() => void) | null }) => {
        setTimeout(() => u.onend?.(), 30)
      },
      cancel: () => {},
      addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      voice: unknown = null
      lang = ''
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
  }, script)
}

test('voice list is deduped with es-MX first, and a voice choice survives a reload', async ({ page }) => {
  await installFakes(page, 'good')
  await page.goto('./#/settings')
  const options = page.getByLabel('Voice').locator('option')
  await expect(options).toHaveText(['Paulina (es-MX, on device)', 'Monica (es-ES, on device)'])
  await page.getByLabel('Voice').selectOption('es-es-1')
  await page.reload()
  await expect(page.getByLabel('Voice')).toHaveValue('es-es-1')
})

test('Listen shows the transcript', async ({ page }) => {
  await installFakes(page, 'good')
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByTestId('speech-status')).toContainText('Heard: "hola"')
})

test('self-test: every listen passes and shows its event list with results before audioend', async ({ page }) => {
  await installFakes(page, 'good')
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Self-test' }).click()
  const rows = page.getByTestId('selftest-row')
  await expect(rows).toHaveCount(4, { timeout: 10_000 })
  await expect(rows).toHaveText([/A1 listen: pass/, /A2 listen: pass/, /B1 listen: pass/, /B2 listen: pass/])
  const first = await rows.first().locator('pre').innerText()
  expect(first.indexOf('result (final)')).toBeGreaterThan(-1)
  expect(first.indexOf('result (final)')).toBeLessThan(first.indexOf('audioend'))
  expect(first).toMatch(/\d+ ms {2}audiostart/)
  expect(await page.evaluate(() => (window as unknown as { __fake: { instances: number } }).__fake.instances)).toBe(4)
})

test('offline: the network error shows the offline message with the text-box hint', async ({ page }) => {
  await installFakes(page, 'offline')
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Listen' }).click()
  await expect(page.getByTestId('speech-status')).toContainText('needs an internet connection')
  await expect(page.getByTestId('speech-status')).toContainText('Type your answer instead')
})

test('a silent session times out at the real 10 s watchdog and the self-test shows the rule', async ({ page }) => {
  await page.clock.install()
  await installFakes(page, 'silent')
  await page.goto('./#/settings')
  await page.getByRole('button', { name: 'Self-test' }).click()
  await page.clock.runFor(10_100)
  const row = page.getByTestId('selftest-row').first()
  await expect(row).toContainText('A1 listen: FAIL')
  await expect(row).toContainText('No speech was detected in time')
  await expect(row).toContainText('watchdog rule fired: W1')
  await expect(row).toContainText('audiostart')
  await expect(row).toContainText('end')
})
