import { NavLink, useLocation } from 'react-router-dom'
import { CarTaxiFront, Gamepad2, House, Newspaper, UserRound } from 'lucide-react'

// Tabs from the passenger app designs (deck pages 4-7).
const TABS = [
  { to: '/home', label: 'Home', icon: House, match: ['/home', '/search', '/bus', '/routes', '/stops', '/track', '/emergency', '/sos', '/my-location', '/my-bus', '/how-to-use'] },
  { to: '/local-cars', label: 'Local Cars', icon: CarTaxiFront, match: ['/local-cars'] },
  { to: '/game', label: 'Game', icon: Gamepad2, match: ['/game'] },
  { to: '/news', label: 'Daily News', icon: Newspaper, match: ['/news'] },
  {
    to: '/profile',
    label: 'Profile',
    icon: UserRound,
    match: ['/profile', '/bookings', '/alarms', '/favorites', '/recent-searches', '/support', '/settings', '/notifications', '/owner', '/driver'],
  },
]

/** Fixed bottom tab bar for phones (hidden from 768px up). */
export function BottomNavigation() {
  const { pathname: path } = useLocation()
  return (
    <nav className="bottom-nav" aria-label="App">
      {TABS.map(({ to, label, icon: Icon, match }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav-item ${isActive || match.some((m) => path.startsWith(m)) ? 'active' : ''}`}
        >
          <Icon size={22} strokeWidth={2} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
