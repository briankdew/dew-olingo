import { Link, NavLink, Route, Routes } from 'react-router'
import { NAV_ROUTES } from './routes'
import { Settings } from './Settings'

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h2>{title}</h2>
      <p>Not implemented yet.</p>
    </>
  )
}

function Home() {
  return (
    <>
      <h2>Home</h2>
      <p>Pick a module.</p>
      <ul>
        {NAV_ROUTES.filter((r) => r.path !== '/').map((r) => (
          <li key={r.path}>
            <Link to={r.path}>{r.label}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <h1>Dew O'Lingo</h1>
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {NAV_ROUTES.map((r) => (
          <NavLink
            key={r.path}
            to={r.path}
            end
            style={({ isActive }) => ({ fontWeight: isActive ? 700 : 400 })}
          >
            {r.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scaffolding" element={<Placeholder title="Scaffolding" />} />
        <Route path="/input-sandbox" element={<Placeholder title="Input Sandbox" />} />
        <Route path="/roleplay" element={<Placeholder title="Roleplay" />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="*"
          element={
            <>
              <h2>Not found</h2>
              <p>
                <Link to="/">Back to Home</Link>
              </p>
            </>
          }
        />
      </Routes>
    </main>
  )
}
