import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Globe, Mail, MapPin, Menu, MessageCircle, Phone, Search, Send } from 'lucide-react'
import { Navbar } from '../components/navigation/Navbar'
import { BottomNavigation } from '../components/navigation/BottomNavigation'
import { Sidebar } from '../components/navigation/Sidebar'
import { UserMenu } from '../components/navigation/UserMenu'
import { Logo } from '../components/ui/Misc'
import { useUnreadCount } from '../hooks/useUnreadCount'
import { adminService, platformService } from '../services/adminService'
import { useAuth } from '../context/AuthContext'
// Admin card/table styles are used directly by many admin pages, so load them with the layout.
import '../components/admin/admin-ui.css'

/** Scroll to top on every route change (keeps scroll on query-only changes). */
export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

export function Footer() {
  const year = new Date().getFullYear()
  const [info, setInfo] = useState(null)

  useEffect(() => {
    platformService
      .settings()
      .then(setInfo)
      .catch(() => {})
  }, [])

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="stack" style={{ '--gap': '14px' }}>
          <Logo height={56} />
          <p className="text-sm" style={{ color: '#b9c5ea', maxWidth: 300 }}>
            Smart local transport for West Bengal. Bus timetables, arrival alarms, shared rides and trusted local cars in one app.
          </p>
          <div className="row" style={{ '--gap': '8px' }}>
            {[Globe, MessageCircle, Send].map((Icon, i) => (
              <span key={i} className="footer-social">
                <Icon size={17} />
              </span>
            ))}
          </div>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/search">Search Buses</Link>
          <Link to="/stops">Bus Stops Near You</Link>
          <Link to="/routes">All Routes</Link>
          <Link to="/running-car">Running Car</Link>
          <Link to="/local-cars">Local Cars</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link to="/about">About Us</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/owner/buses/new">List Your Bus</Link>
          <Link to="/admin/login">Admin Login</Link>
        </div>
        <div>
          <h4>Get in touch</h4>
          <span className="footer-line">
            <MapPin size={16} /> {info?.address || 'Kolkata, West Bengal'}
          </span>
          {info?.contactNumber && (
            <a className="footer-line" href={`tel:${info.contactNumber.replace(/\s/g, '')}`}>
              <Phone size={16} /> {info.contactNumber}
            </a>
          )}
          {info?.platformEmail && (
            <a className="footer-line" href={`mailto:${info.platformEmail}`}>
              <Mail size={16} /> {info.platformEmail}
            </a>
          )}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {year} GO-GO Ride. All rights reserved.</span>
        <span>Made for West Bengal</span>
      </div>
    </footer>
  )
}

/** Public website pages: navbar + content + footer. */
export function PublicLayout() {
  return (
    <div className="layout-public">
      <Navbar />
      <main className="layout-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/**
 * Passenger app. Phones: content + bottom tab bar (pages draw their own header).
 * Tablets/desktop: website navbar on top, content centred.
 */
export function AppLayout() {
  return (
    <div className="layout-app">
      <div className="hide-mobile">
        <Navbar />
      </div>
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  )
}

/** Login / register shell - a split screen on desktop, full screen on phones. */
export function AuthLayout() {
  return (
    <div className="layout-auth">
      <Outlet />
    </div>
  )
}

/** Admin panel: sidebar + top bar + content (design: deck pages 10-11). */
export function AdminLayout() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  const [query, setQuery] = useState('')
  const unread = useUnreadCount()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (!isAdmin) return undefined
    const load = () =>
      adminService
        .busRequests({ limit: 1 })
        .then((r) => setPending(r.meta?.total ?? 0))
        .catch(() => {})
    load()
    // Approve / reject actions announce themselves so the badge updates in place.
    window.addEventListener('gogo:bus-requests-changed', load)
    return () => window.removeEventListener('gogo:bus-requests-changed', load)
  }, [isAdmin, pathname])

  const search = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/admin/buses?search=${encodeURIComponent(q)}`)
  }

  return (
    <div className="layout-admin">
      <Sidebar open={open} onClose={() => setOpen(false)} badges={{ pending }} />
      <div className="admin-shell">
        <header className="admin-topbar">
          <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <form className="admin-search hide-mobile" onSubmit={search} role="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buses, routes, users..." aria-label="Search" />
            <button type="submit" aria-label="Search">
              <Search size={18} />
            </button>
          </form>
          <div className="row" style={{ marginLeft: 'auto', '--gap': '14px' }}>
            <Link to="/admin/notifications?tab=mine" className="icon-btn" aria-label="Notifications">
              <Bell size={21} />
              {unread > 0 && <span className="icon-btn-badge">{unread}</span>}
            </Link>
            <UserMenu variant="admin" />
          </div>
        </header>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
