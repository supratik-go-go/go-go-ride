import { useRef } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { EmptyState } from '../components/ui/States'
import { Button } from '../components/ui/Button'
import { ShieldAlert } from 'lucide-react'

/** Signed-in users only; others go to /login?next=<here>. */
export function RequireAuth({ loginPath = '/login', children }) {
  const { ready, isAuthenticated } = useAuth()
  const location = useLocation()
  if (!ready) return <LoadingSpinner fullPage label="" />
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${loginPath}?next=${next}`} replace />
  }
  return children ?? <Outlet />
}

/**
 * Role gate. The API re-checks every call - this only decides what to render.
 * <RequireRole roles={['ADMIN','SUPER_ADMIN']} loginPath="/admin/login" />
 */
export function RequireRole({ roles, loginPath = '/login', children }) {
  const { ready, user } = useAuth()
  const location = useLocation()
  if (!ready) return <LoadingSpinner fullPage label="" />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${loginPath}?next=${next}`} replace />
  }
  if (!roles.includes(user.role)) {
    return (
      <div className="container page">
        <EmptyState
          icon={<ShieldAlert size={26} />}
          title="You don't have access to this page"
          message="This section is only available to authorised accounts. If you think this is a mistake, contact support."
          action={<Button to="/home">Go to Home</Button>}
        />
      </div>
    )
  }
  return children ?? <Outlet />
}

/**
 * Login / register pages: bounce users who were already signed in when they
 * arrived. Someone who signs in *on* the page is routed by that page itself
 * (register sends owners to Add Bus, drivers to My Cars, OTP asks new users
 * their name), so the guard must not race it.
 */
export function GuestOnly({ children }) {
  const { ready, user, isAdmin } = useAuth()
  const location = useLocation()
  const signedInOnArrival = useRef(null)
  if (ready && signedInOnArrival.current === null) signedInOnArrival.current = Boolean(user)
  if (!ready) return <LoadingSpinner fullPage label="" />
  if (user && signedInOnArrival.current) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={next || (isAdmin && location.pathname.startsWith('/admin') ? '/admin' : '/home')} replace />
  }
  return children ?? <Outlet />
}
