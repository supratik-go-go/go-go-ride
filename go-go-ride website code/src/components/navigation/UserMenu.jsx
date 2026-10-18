import { startTransition, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Bus, CalendarCheck, ChevronDown, LayoutDashboard, LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services/authService'
import { Avatar } from '../ui/Misc'
import { label } from '../../utils/format'

/** Avatar + name dropdown used by the website navbar and the admin topbar. */
export function UserMenu({ variant = 'site' }) {
  const { user, isAdmin, isOwner, setUser } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user) return null

  const doLogout = async () => {
    setOpen(false)
    await authService.logout()
    // Clear the user and leave in one transition; otherwise RequireAuth sees the
    // signed-out state first and bounces to /login?next=<this page>.
    startTransition(() => {
      setUser(null)
      navigate(variant === 'admin' ? '/admin/login' : '/')
    })
  }

  const items =
    variant === 'admin'
      ? [
          { to: '/admin/profile', icon: User, text: 'My Profile' },
          { to: '/admin/settings', icon: Settings, text: 'Settings' },
          { to: '/home', icon: Bus, text: 'Open passenger app' },
        ]
      : [
          { to: '/profile', icon: User, text: 'My Profile' },
          { to: '/bookings', icon: CalendarCheck, text: 'My Bookings' },
          { to: '/alarms', icon: Bell, text: 'My Alarms' },
          ...(isOwner ? [{ to: '/owner/buses', icon: Bus, text: 'My Buses' }] : []),
          ...(isAdmin ? [{ to: '/admin', icon: LayoutDashboard, text: 'Admin Panel' }] : []),
        ]

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar src={user.avatarUrl} name={user.name} size={36} />
        <span className="user-menu-name hide-mobile">
          <span className="fw-600 truncate">{user.name || 'Guest'}</span>
          <span className="text-xs text-muted">{label('role', user.role)}</span>
        </span>
        <ChevronDown size={16} className="hide-mobile" />
      </button>
      {open && (
        <div className="dropdown" role="menu">
          {items.map(({ to, icon: Icon, text }) => (
            <Link key={to} to={to} className="dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              <Icon size={17} /> {text}
            </Link>
          ))}
          <div className="divider" style={{ margin: '4px 0' }} />
          <button type="button" className="dropdown-item danger" role="menuitem" onClick={doLogout}>
            <LogOut size={17} /> Logout
          </button>
        </div>
      )}
    </div>
  )
}
