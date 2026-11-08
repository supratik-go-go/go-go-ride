import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpDown,
  Bell,
  BusFront,
  CarFront,
  CaseSensitive,
  ChevronRight,
  FileText,
  Hash,
  MapPin,
  Route,
  Search,
} from 'lucide-react'
import { AddViaButton, StopInput, ViaInput } from '../../components/navigation/SearchBar'
import { Avatar, Badge, Button, EmptyState, Logo, Skeleton, Spinner, useToast } from '../../components/ui'
import { LocalCarCard, NotifyMeModal, firstName, openPicker } from '../../components/passenger'
import { localCarService, locationService, rideService, routeService, stopService } from '../../services'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { formatDate, todayISO } from '../../utils/format'
import runningCarImg from '../../assets/brand/running-car.jpg'
import './passenger.css'

const MODES = [
  { value: 'BUS_NUMBER', label: 'Bus Number', icon: BusFront },
  { value: 'BUS_NAME', label: 'Bus Name', icon: FileText },
  { value: 'ROUTE', label: 'Route', icon: Route },
]

/** "2026-11-07" -> "7 Nov 26" */
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function Home() {
  const { user, ready, isAuthenticated } = useAuth()
  const unread = useUnreadCount()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState('ROUTE')
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [via, setVia] = useState(null)
  const [viaOpen, setViaOpen] = useState(false)
  const [q, setQ] = useState('')
  const [date, setDate] = useState(todayISO())
  const [locating, setLocating] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const searchRef = useRef(null)
  const qRef = useRef(null)
  const focusQ = useRef(false)

  const rides = useAsync(() => rideService.status(), [])
  const cars = useAsync(() => localCarService.list({ verified: true, limit: 3 }), [])
  const popular = useAsync(() => routeService.popular(6), [])

  useEffect(() => {
    if (mode !== 'ROUTE' && focusQ.current) {
      focusQ.current = false
      qRef.current?.focus()
    }
  }, [mode])

  const pickMode = (value, { focus } = {}) => {
    setMode(value)
    if (value !== 'ROUTE' && focus) {
      focusQ.current = true
      searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (value === mode) qRef.current?.focus()
    }
  }

  const locate = async () => {
    if (locating) return
    setLocating(true)
    try {
      const pos = await locationService.getCurrentPosition()
      const stops = await stopService.nearby(pos.lat, pos.lng, 3, 1)
      const nearest = stops?.[0]
      if (nearest) {
        setFrom({ id: nearest.id, name: nearest.name, area: nearest.area })
        toast.success(`Nearest stop: ${nearest.name}${nearest.distanceKm != null ? ` (${nearest.distanceKm} km away)` : ''}`)
      } else {
        toast.info('No bus stop found within 3 km of you. Type your stop instead.')
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setLocating(false)
    }
  }

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  const submit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams({ searchType: mode, date })
    if (mode === 'ROUTE') {
      if (!from?.name?.trim() || !to?.name?.trim()) {
        toast.warning('Enter both a starting point and a destination.')
        return
      }
      if (from.id && from.id === to.id) {
        toast.warning('Starting point and destination must be different.')
        return
      }
      params.set('from', from.name.trim())
      params.set('to', to.name.trim())
      if (from.id) params.set('fromId', from.id)
      if (to.id) params.set('toId', to.id)
      if (viaOpen && via?.name?.trim()) {
        params.set('via', via.name.trim())
        if (via.id) params.set('viaId', via.id)
      }
    } else {
      const text = q.trim()
      if (!text) {
        toast.warning(mode === 'BUS_NUMBER' ? 'Enter a bus number, e.g. WB 01 AB 1234.' : 'Enter a bus name to search.')
        qRef.current?.focus()
        return
      }
      params.set('q', text)
    }
    navigate(`/search?${params}`)
  }

  const greetingName = ready ? (isAuthenticated ? firstName(user?.name) || 'there' : 'Traveller') : ''
  const status = rides.data?.status
  const isLive = status === 'LIVE'

  return (
    <div className="px-page px-home">
      {/* phone header (website navbar takes over from 768px) */}
      <header className="px-home-top">
        {isAuthenticated ? (
          <Link to="/profile" className="px-home-avatar" aria-label="Your profile">
            <Avatar src={user?.avatarUrl} name={user?.name} size={40} />
          </Link>
        ) : (
          <Button to="/login" size="sm" variant="soft">
            Login
          </Button>
        )}
        <Link to="/home" aria-label="GO-GO Ride home" className="px-home-logo">
          <Logo height={46} />
        </Link>
        <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell size={24} />
          {unread > 0 && <span className="icon-btn-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      </header>

      <section className="px-hello">
        <div>
          <h1>
            Hello{greetingName ? `, ${greetingName}` : ''} <span aria-hidden="true">👋</span>
          </h1>
          <p>Where do you want to go today?</p>
        </div>
        <label className="px-date-badge">
          {shortDate(date)}
          <input
            type="date"
            className="px-overlay-input"
            value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
            onClick={(e) => openPicker(e.currentTarget)}
            aria-label={`Travel date, ${formatDate(date)}. Tap to change.`}
          />
        </label>
      </section>

      <div className="px-home-grid">
        <div className="px-home-col">
          {/* ---------------- search card ---------------- */}
          <form className="card px-search" onSubmit={submit} ref={searchRef} aria-label="Search buses" style={{ order: 1 }}>
            {mode === 'ROUTE' ? (
              <div className="px-search-stops">
                <StopInput
                  label="From"
                  value={from}
                  onChange={setFrom}
                  placeholder="Enter starting point"
                  icon={<MapPin size={22} className="px-pin-from" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
                  onLocate={locate}
                />
                {locating && (
                  <span className="px-locating" role="status">
                    <Spinner size={13} /> Finding the nearest stop…
                  </span>
                )}
                <div className="search-bar-sep px-search-sep">
                  {!viaOpen && <AddViaButton onClick={() => setViaOpen(true)} />}
                  <button type="button" className="swap-btn" onClick={swap} aria-label="Swap from and to">
                    <ArrowUpDown size={18} />
                  </button>
                </div>
                {viaOpen && (
                  <ViaInput
                    value={via}
                    onChange={setVia}
                    onRemove={() => {
                      setVia(null)
                      setViaOpen(false)
                    }}
                  />
                )}
                <StopInput
                  label="To"
                  value={to}
                  onChange={setTo}
                  placeholder="Enter destination"
                  icon={<MapPin size={22} className="px-pin-to" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
                />
              </div>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor="px-home-q">
                  {mode === 'BUS_NUMBER' ? 'Bus number' : 'Bus name'}
                </label>
                <div className="input-wrap has-icon">
                  <span className="input-icon">{mode === 'BUS_NUMBER' ? <Hash size={18} /> : <CaseSensitive size={18} />}</span>
                  <input
                    id="px-home-q"
                    ref={qRef}
                    className="input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={mode === 'BUS_NUMBER' ? 'e.g. WB 01 AB 1234' : 'e.g. Howrah Express'}
                    autoCapitalize={mode === 'BUS_NUMBER' ? 'characters' : 'words'}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </div>
              </div>
            )}

            <div className="px-search-by">
              <span className="px-label" id="px-search-by">
                Search By
              </span>
              <div className="px-mode-grid" role="radiogroup" aria-labelledby="px-search-by">
                {MODES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    className={`px-mode ${mode === value ? 'active' : ''}`}
                    onClick={() => pickMode(value, { focus: true })}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" variant="accent" size="lg" block icon={<Search size={22} />} className="px-search-submit">
              Search Buses
            </Button>
          </form>

          {/* ---------------- quick actions ---------------- */}
          <nav className="px-quick" aria-label="Quick actions" style={{ order: 2 }}>
            <Link to="/emergency" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">☎️</span>
              <span>Emergency Call List</span>
            </Link>
            <Link to="/sos" className="px-quick-tile" aria-label="SOS, one click help">
              <span className="px-quick-emoji" aria-hidden="true">🆘</span>
              <span>1 Click Help</span>
            </Link>
            <Link to="/my-location" className="px-quick-tile">
              <MapPin size={26} />
              <span>Live Location Track</span>
            </Link>
            <Link to="/my-bus" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">🚍</span>
              <span>My Bus</span>
            </Link>
            <Link to="/how-to-use" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">🎬</span>
              <span>Watch How to Use GO-GO Ride</span>
            </Link>
          </nav>
        </div>

        <div className="px-home-col">
          {/* ---------------- running car ---------------- */}
          <nav className="px-contrib-links" aria-label="Add information" style={{ order: 3 }}>
            <Link to="/owner/buses/new" className="card px-contrib-link">
              <span className="icon-tile sm">
                <BusFront size={20} />
              </span>
              <span className="grow px-contrib-text">
                <span className="px-contrib-tag">+ Add Bus Info...</span>
                <span className="px-contrib-sub" lang="bn">
                  আপনিও পারবেন বাসের নাম নথিভুক্ত করতে
                </span>
              </span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/add-route" className="card px-contrib-link">
              <span className="icon-tile sm">
                <Route size={20} />
              </span>
              <span className="grow px-contrib-text">
                <span className="px-contrib-tag">+ Add Route Info...</span>
                <span className="px-contrib-sub" lang="bn">
                  আপনিও পারবেন রুটের তথ্য যোগ করতে
                </span>
              </span>
              <ArrowRight size={18} />
            </Link>
          </nav>

          <section className="px-rc" aria-labelledby="px-rc-title" style={{ order: 3 }}>
            <div className="px-rc-text">
              <div className="row px-rc-head" style={{ '--gap': '12px' }}>
                <span className="px-rc-icon">
                  <CarFront size={24} />
                </span>
                <div className="stack" style={{ '--gap': '4px', alignItems: 'flex-start' }}>
                  <h2 id="px-rc-title">Running Car</h2>
                  {rides.loading && !rides.data ? (
                    <Skeleton width={90} height={20} radius={6} />
                  ) : isLive ? (
                    <Badge tone="success" square>
                      <span className="dot dot-pulse" /> Live
                    </Badge>
                  ) : status === 'COMING_SOON' ? (
                    <span className="badge badge-accent badge-square">Coming Soon</span>
                  ) : null}
                </div>
              </div>
              <p className="px-rc-tagline">{rides.data?.tagline || 'Book shared rides on your route. Affordable, faster and smarter.'}</p>
              {isLive ? (
                <Button to="/running-car" size="sm" iconRight={<ArrowRight size={16} />}>
                  Find a ride
                </Button>
              ) : status === 'COMING_SOON' ? (
                <Button size="sm" onClick={() => setNotifyOpen(true)}>
                  Notify Me
                </Button>
              ) : (
                <Button to="/running-car" size="sm" variant="outline">
                  Learn more
                </Button>
              )}
            </div>
            <img src={runningCarImg} alt="" className="px-rc-img" aria-hidden="true" />
          </section>

          {/* ---------------- popular routes ---------------- */}
          <section className="px-section" aria-labelledby="px-popular-title" style={{ order: 5 }}>
            <div className="px-section-head">
              <h2 id="px-popular-title" className="px-section-title">
                Popular Routes
              </h2>
              <Link to="/routes" className="link-btn">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            {popular.loading && !popular.data ? (
              <div className="px-popular">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} height={64} radius={12} />
                ))}
              </div>
            ) : popular.error && !popular.data ? (
              <div className="alert alert-danger">
                <span className="grow">{popular.error.message}</span>
                <button type="button" className="link-btn" onClick={() => popular.reload()}>
                  Retry
                </button>
              </div>
            ) : !popular.data?.length ? (
              <EmptyState compact icon={<Route size={24} />} title="No routes yet" message="Routes will appear here once they are added." />
            ) : (
              <div className="px-popular">
                {popular.data.map((r) => (
                  <Link
                    key={r.id}
                    className="px-popular-item"
                    to={`/search?${new URLSearchParams({ from: r.from || '', to: r.to || '', searchType: 'ROUTE', date: todayISO() })}`}
                    title={r.name}
                  >
                    <span className="icon-tile sm">
                      <BusFront size={18} />
                    </span>
                    <span className="px-popular-text">
                      <span className="truncate fw-600">{r.from}</span>
                      <span className="truncate text-2">→ {r.to}</span>
                    </span>
                    {r.routeNumber && <span className="px-popular-no">{r.routeNumber}</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ---------------- local cars ---------------- */}
        <section className="card px-cars-panel" aria-labelledby="px-cars-title" style={{ order: 4 }}>
          <div className="px-section-head">
            <div className="row" style={{ '--gap': '12px', minWidth: 0 }}>
              <span className="icon-tile">
                <CarFront size={24} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 id="px-cars-title" className="px-section-title">
                  Local Cars Near You
                </h2>
                <p className="text-sm text-muted">Call verified local drivers directly.</p>
              </div>
            </div>
            <Link to="/local-cars" className="link-btn nowrap">
              View All <ChevronRight size={16} />
            </Link>
          </div>
          {cars.loading && !cars.data ? (
            <div className="px-cars-row">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height={170} radius={14} className="px-cars-skel" />
              ))}
            </div>
          ) : cars.error && !cars.data ? (
            <div className="alert alert-danger">
              <span className="grow">{cars.error.message}</span>
              <button type="button" className="link-btn" onClick={() => cars.reload()}>
                Retry
              </button>
            </div>
          ) : !cars.data?.data?.length ? (
            <EmptyState
              compact
              icon={<CarFront size={24} />}
              title="No verified drivers yet"
              message="Verified local drivers will show up here soon."
              action={
                <Button to="/local-cars" size="sm" variant="outline">
                  Browse all drivers
                </Button>
              }
            />
          ) : (
            <div className="px-cars-row">
              {cars.data.data.map((car) => (
                <LocalCarCard key={car.id} car={car} />
              ))}
            </div>
          )}
        </section>
      </div>

      <NotifyMeModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        onDone={() => {
          rides.reload({ silent: true })
        }}
      />
    </div>
  )
}
