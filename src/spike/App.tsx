import { useEffect, useState } from 'react'
import { ResultsPanel } from './ResultsPanel'

const ROUTES = [
  { path: '/speech', label: 'Web Speech (stages b, c)' },
  { path: '/github', label: 'GitHub Contents API (stage d)' },
  { path: '/gemini', label: 'Gemini (stage e)' },
  { path: '/storage', label: 'iOS storage and audio (stage f)' },
]

function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/'
}

export function App() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const route = ROUTES.find((r) => r.path === path)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <h1>Dew O'Lingo spike</h1>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <a href="#/">Index</a>
        {ROUTES.map((r) => (
          <a key={r.path} href={`#${r.path}`}>
            {r.path.slice(1)}
          </a>
        ))}
      </nav>
      {route ? (
        <>
          <h2>{route.label}</h2>
          <p>Not implemented yet.</p>
          <ResultsPanel test={route.path.slice(1)} results={{ status: 'stub' }} />
        </>
      ) : (
        <>
          <p>Environment of this device and browser:</p>
          <ResultsPanel test="index" results={{ route: path }} />
        </>
      )}
    </main>
  )
}
