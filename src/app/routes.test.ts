import { describe, it, expect } from 'vitest'
import { NAV_ROUTES, ROUTES } from './routes'

describe('route table', () => {
  it('has unique paths', () => {
    const paths = ROUTES.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('shows exactly the five main screens in the nav', () => {
    expect(NAV_ROUTES.map((r) => r.label)).toEqual([
      'Home',
      'Scaffolding',
      'Input Sandbox',
      'Roleplay',
      'Settings',
    ])
  })
})
