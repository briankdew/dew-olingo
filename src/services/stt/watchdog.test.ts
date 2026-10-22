import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWatchdog, type WatchdogRule } from './watchdog'

let fired: { rule: WatchdogRule; at: number }[]
let t0: number
const setup = () => {
  fired = []
  t0 = Date.now()
  return createWatchdog((rule) => fired.push({ rule, at: Date.now() - t0 }))
}
const run = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('watchdog', () => {
  it('W0: no audiostart within 20 s of start()', async () => {
    const w = setup()
    w.start()
    await run(19_999)
    expect(fired).toEqual([])
    await run(1)
    expect(fired).toEqual([{ rule: 'W0', at: 20_000 }])
  })

  it('W0 does not consume the speaking budget: W1 runs from audiostart', async () => {
    const w = setup()
    w.start()
    await run(15_000)
    w.audiostart()
    await run(9_999)
    expect(fired).toEqual([])
    await run(1)
    expect(fired).toEqual([{ rule: 'W1', at: 25_000 }])
  })

  it('W1: audiostart then silence expires 10 s later', async () => {
    const w = setup()
    w.start()
    w.audiostart()
    await run(10_000)
    expect(fired).toEqual([{ rule: 'W1', at: 10_000 }])
  })

  it('W2: a result at 9 s moves the deadline to 19 s', async () => {
    const w = setup()
    w.start()
    w.audiostart()
    await run(9_000)
    w.result()
    await run(9_999)
    expect(fired).toEqual([])
    await run(1)
    expect(fired).toEqual([{ rule: 'W2', at: 19_000 }])
  })

  it('W4: repeated results stop extending at 20 s after audiostart', async () => {
    const w = setup()
    w.start()
    w.audiostart()
    for (let i = 0; i < 4; i++) {
      await run(5_000)
      w.result()
    }
    await run(1)
    expect(fired).toEqual([{ rule: 'W4', at: 20_000 }])
  })

  it('W3: audioend at 2 s with no result expires at 7 s', async () => {
    const w = setup()
    w.start()
    w.audiostart()
    await run(2_000)
    w.audioend()
    await run(4_999)
    expect(fired).toEqual([])
    await run(1)
    expect(fired).toEqual([{ rule: 'W3', at: 7_000 }])
  })

  it('W3 does not apply once a result has arrived', async () => {
    const w = setup()
    w.start()
    w.audiostart()
    await run(1_000)
    w.result()
    await run(1_000)
    w.audioend()
    await run(8_999)
    expect(fired).toEqual([])
    await run(1)
    expect(fired).toEqual([{ rule: 'W2', at: 11_000 }])
  })

  it('stop() cancels the timer', async () => {
    const w = setup()
    w.start()
    w.stop()
    await run(60_000)
    expect(fired).toEqual([])
  })
})
