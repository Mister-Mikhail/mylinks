import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { BrandMark } from './components/BrandMark'
import { PublicProfilePage } from './pages/PublicProfilePage'

// Editor, landing page and admin panel are loaded only when they are needed,
// so a visitor of a public profile downloads just the profile page code.
const App = lazy(() => import('./App'))

const RESERVED_PATHS = new Set(['admin', 'auth', 'p'])

const publicHandleFromPath = (pathname: string) => {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length !== 1) return null
  let handle = parts[0]
  try {
    handle = decodeURIComponent(handle)
  } catch {
    return null
  }
  return RESERVED_PATHS.has(handle.toLowerCase()) ? null : handle
}

export default function AppRoot() {
  const { pathname } = useLocation()
  const handle = publicHandleFromPath(pathname)

  if (handle) return <PublicProfilePage key={handle} handle={handle} />

  return (
    <Suspense fallback={<main className="loading-screen"><BrandMark /><LoaderCircle className="spin" size={22} /></main>}>
      <App />
    </Suspense>
  )
}
