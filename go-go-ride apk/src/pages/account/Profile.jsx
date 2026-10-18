import { startTransition, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  BellRing,
  BusFront,
  CalendarCheck,
  CarTaxiFront,
  ChevronRight,
  CircleHelp,
  Info,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  SquarePlus,
  Star,
} from 'lucide-react'
import { Avatar, ConfirmDialog, IconButton, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { authService } from '../../services'
import { formatPhone, label } from '../../utils/format'
import { AccountPage } from './accountShared'

function MenuRow({ to, icon: Icon, children, hint, count }) {
  return (
    <Link to={to} className="acc-menu-row">
      <Icon size={24} strokeWidth={1.9} />
      <span className="acc-menu-label">
        {children}
        {hint && <small>{hint}</small>}
      </span>
      {count > 0 && (
        <span className="acc-count" aria-label={`${count} unread`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      <ChevronRight size={20} className="acc-menu-chevron" />
    </Link>
  )
}

export default function Profile() {
  const { user, isAdmin, setUser } = useAuth()
  const unread = useUnreadCount()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmOut, setConfirmOut] = useState(false)

  if (!user) return null
  const role = user.role

  const doLogout = async () => {
    await authService.logout()
    toast.success('You have been logged out')
    // Clear the user and leave the protected page in one render, so the auth guard doesn't bounce to /login.
    startTransition(() => {
      setUser(null)
      navigate('/', { replace: true })
    })
  }

  return (
    <AccountPage
      title="My Account"
      back={false}
      actions={
        <IconButton label={`Notifications${unread ? ` (${unread} unread)` : ''}`} badge={unread} onClick={() => navigate('/notifications')}>
          <Bell size={21} />
        </IconButton>
      }
    >
      <Link to="/profile/edit" className="acc-hero" aria-label="Edit profile">
        <Avatar src={user.avatarUrl} name={user.name} size={76} />
        <div className="acc-hero-text">
          <span className="acc-hero-name">{user.name}</span>
          <span className="acc-hero-phone">{formatPhone(user.phone)}</span>
          {user.email && <span className="acc-hero-email truncate">{user.email}</span>}
          <span className="acc-role-pill">
            {isAdmin ? <ShieldCheck size={12} /> : null}
            {label('role', role)}
          </span>
        </div>
        <ChevronRight size={26} className="acc-hero-chevron" />
      </Link>

      <nav className="card acc-menu" aria-label="Account">
        <MenuRow to="/bookings" icon={CalendarCheck}>
          My Bookings
        </MenuRow>
        <MenuRow to="/alarms" icon={BellRing}>
          My Alarms
        </MenuRow>
        <MenuRow to="/favorites" icon={Star}>
          Favorites
        </MenuRow>
        <MenuRow to="/recent-searches" icon={Search}>
          Recent Searches
        </MenuRow>
        <MenuRow to="/notifications" icon={Bell} count={unread}>
          Notifications
        </MenuRow>
        <MenuRow to="/support" icon={CircleHelp}>
          Help &amp; Support
        </MenuRow>
        <MenuRow to="/settings" icon={Settings}>
          Settings
        </MenuRow>
        <MenuRow to="/about" icon={Info}>
          About Us
        </MenuRow>
      </nav>

      {(role === 'BUS_OWNER' || role === 'DRIVER' || isAdmin) && (
        <>
          <h2 className="acc-section-title">{isAdmin ? 'Administration' : role === 'BUS_OWNER' ? 'For bus owners' : 'For drivers'}</h2>
          <nav className="card acc-menu" aria-label="Partner tools">
            {role === 'BUS_OWNER' && (
              <>
                <MenuRow to="/owner/buses" icon={BusFront} hint="Track approval status and timetables">
                  My Buses
                </MenuRow>
                <MenuRow to="/owner/buses/new" icon={SquarePlus} hint="List a new bus with its route and documents">
                  Add Bus
                </MenuRow>
              </>
            )}
            {role === 'DRIVER' && (
              <MenuRow to="/driver/cars" icon={CarTaxiFront} hint="Manage your local car listings">
                My Car Listings
              </MenuRow>
            )}
            {isAdmin && (
              <MenuRow to="/admin" icon={LayoutDashboard} hint="Approvals, buses, users and reports">
                Admin Panel
              </MenuRow>
            )}
          </nav>
        </>
      )}

      <button type="button" className="acc-logout" onClick={() => setConfirmOut(true)}>
        <LogOut size={19} /> Logout
      </button>
      <p className="acc-version">GO-GO Ride · version 1.0.0</p>

      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={doLogout}
        title="Log out of GO-GO Ride?"
        message="Your alarms and bookings stay saved on your account. You can sign back in any time."
        confirmLabel="Logout"
      />
    </AccountPage>
  )
}
