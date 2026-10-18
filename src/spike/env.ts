export type RunMode = 'home-screen' | 'browser-tab'

export interface EnvInfo {
  runMode: RunMode
  browser: string
  browserVersion: string
  os: string
  online: boolean
  userAgent: string
  origin: string
}

// Parsed from the UA string, so treat as a best guess. The raw UA is recorded alongside.
function parseBrowser(ua: string): { name: string; version: string } {
  const rules: [string, RegExp][] = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]
  for (const [name, re] of rules) {
    const m = ua.match(re)
    if (m) return { name, version: m[1] }
  }
  return { name: 'unknown', version: 'unknown' }
}

function parseOs(ua: string): string {
  const ios = ua.match(/(?:iPhone|CPU) OS ([\d_]+)/)
  if (/iPhone/.test(ua) && ios) return `iOS ${ios[1].replace(/_/g, '.')}`
  if (/iPad/.test(ua) && ios) return `iPadOS ${ios[1].replace(/_/g, '.')}`
  if (/CrOS/.test(ua)) return 'ChromeOS'
  const mac = ua.match(/Mac OS X ([\d_]+)/)
  // iPadOS 13+ Safari reports a Mac UA; maxTouchPoints distinguishes it.
  if (mac && navigator.maxTouchPoints > 1) return 'iPadOS (reports as Mac)'
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`
  return 'unknown'
}

export function getEnvInfo(): EnvInfo {
  const ua = navigator.userAgent
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  const { name, version } = parseBrowser(ua)
  return {
    runMode: standalone ? 'home-screen' : 'browser-tab',
    browser: name,
    browserVersion: version,
    os: parseOs(ua),
    online: navigator.onLine,
    userAgent: ua,
    origin: location.origin,
  }
}
