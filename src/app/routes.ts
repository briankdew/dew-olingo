export interface AppRoute {
  path: string
  label: string
  hidden?: boolean
}

export const ROUTES: AppRoute[] = [
  { path: '/', label: 'Home' },
  { path: '/scaffolding', label: 'Scaffolding' },
  { path: '/input-sandbox', label: 'Input Sandbox' },
  { path: '/roleplay', label: 'Roleplay' },
  { path: '/settings', label: 'Settings' },
]

export const NAV_ROUTES = ROUTES.filter((r) => !r.hidden)
