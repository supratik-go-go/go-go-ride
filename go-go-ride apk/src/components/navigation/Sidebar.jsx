import { NavLink } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Bus,
  CalendarCheck,
  CarFront,
  CarTaxiFront,
  Headphones,
  LayoutGrid,
  MapPin,
  Navigation,
  Route,
  Settings,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { Logo } from '../ui/Misc'

// Admin navigation (design: deck pages 10-11).
const ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/buses', label: 'Bus Management', icon: Bus },
  { to: '/admin/bus-requests', label: 'Bus Owner Requests', icon: UserCheck, badgeKey: 'pending' },
  { to: '/admin/routes', label: 'Route Management', icon: Route },
  { to: '/admin/stops', label: 'Bus Stops', icon: MapPin },
  { to: '/admin/tracking', label: 'Live Tracking', icon: Navigation },
  { to: '/admin/rides', label: 'Running Car (Rides)', icon: CarFront },
  { to: '/admin/local-cars', label: 'Local Cars', icon: CarTaxiFront },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
  { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/support', label: 'Support & Queries', icon: Headphones },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ open, onClose, badges = {} }) {
  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Logo height={52} />
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-brand">
          <div className="fw-700">GO-GO RIDE</div>
          <div className="sidebar-caption">ADMIN PANEL</div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin">
          {ITEMS.map(({ to, label, icon: Icon, end, badgeKey }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
              <Icon size={19} />
              <span className="grow truncate">{label}</span>
              {badgeKey && badges[badgeKey] > 0 && <span className="sidebar-badge">{badges[badgeKey]}</span>}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/admin/support" className="sidebar-help" onClick={onClose}>
          <Headphones size={22} />
          <div>
            <div className="fw-600">Need Help?</div>
            <div className="text-accent text-sm">Contact Support</div>
          </div>
        </NavLink>
      </aside>
    </>
  )
}
