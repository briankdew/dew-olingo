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
  // Kept until M3 replaces it with the speech services, then deleted.
  { path: '/spike/speech', label: 'Speech test (spike)', hidden: true },
]

export const NAV_ROUTES = ROUTES.filter((r) => !r.hidden)
