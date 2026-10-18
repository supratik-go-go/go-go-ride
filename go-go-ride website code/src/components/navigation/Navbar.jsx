import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Menu, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { Logo } from '../ui/Misc'
import { Button } from '../ui/Button'
import { UserMenu } from './UserMenu'

const LINKS = [
  { to: '/home', label: 'Home', end: true },
  { to: '/search', label: 'Buses' },
  { to: '/stops', label: 'Bus Stops' },
  { to: '/running-car', label: 'Rides' },
  { to: '/local-cars', label: 'Local Cars' },
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact' },
]

/** Website / desktop navigation bar (design: deck page 9). Collapses to a drawer on phones. */
export function Navbar({ transparent }) {
  const { isAuthenticated } = useAuth()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header className={`navbar ${transparent ? 'navbar-transparent' : ''}`}>
      <div className="container navbar-inner">
        <Link to={isAuthenticated ? '/home' : '/'} className="navbar-logo" aria-label="GO-GO Ride home">
          <Logo height={46} />
        </Link>

        <nav className="navbar-links" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          {isAuthenticated ? (
            <>
              <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
                <Bell size={21} />
                {unread > 0 && <span className="icon-btn-badge">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Button to="/login" size="sm" className="hide-mobile">
                Login
              </Button>
              <Button to="/register" variant="accent" size="sm" className="hide-mobile">
                Sign Up
              </Button>
            </>
          )}
          <button type="button" className="icon-btn navbar-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="navbar-drawer fade-in">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `drawer-link ${isActive ? 'active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
          {!isAuthenticated && (
            <div className="row" style={{ marginTop: 8 }}>
              <Button to="/login" block>
                Login
              </Button>
              <Button to="/register" variant="accent" block>
                Sign Up
              </Button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
