import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AlarmClock,
  ArrowRight,
  BusFront,
  CarFront,
  ChevronRight,
  Clock3,
  Headset,
  MapPin,
  Motorbike,
  Phone,
  Play,
  Search,
  Waypoints,
} from 'lucide-react'
import { Button, Skeleton } from '../../components/ui'
import { SearchBar } from '../../components/navigation/SearchBar'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { rideService, routeService } from '../../services'
import heroBus from '../../assets/brand/hero-bus.jpg'
import heroCity from '../../assets/brand/hero-city.jpg'
import logoWordmark from '../../assets/brand/logo-wordmark.png'
import logoFull from '../../assets/brand/logo-full.png'
import { PlatformStats } from './publicShared'
import { useMediaQuery } from './useMediaQuery'
import './public.css'

/** Phones get the app splash (design 02); tablets and desktops get the website home (design 09). */
export default function Landing() {
  const isPhone = useMediaQuery('(max-width: 767px)')
  return isPhone ? <MobileSplash /> : <WebsiteHome />
}

// ------------------------------------------------------------------ website

function WebsiteHome() {
  const rides = useAsync(() => rideService.status(), [])
  const popular = useAsync(() => routeService.popular(6), [])
  const rideLive = rides.data?.status === 'LIVE'

  const features = [
    { to: '/search?searchType=BUS_NUMBER', icon: BusFront, title: 'Search by', sub: 'Bus Number' },
    { to: '/stops', icon: MapPin, title: 'Bus Stops', sub: 'Near You' },
    { to: '/routes', icon: Waypoints, title: 'Route', sub: 'Search' },
    { to: '/alarms', icon: AlarmClock, title: 'Bus Alarm', sub: '& Reminders' },
    {
      to: '/running-car',
      icon: CarFront,
      title: 'Running Car',
      badge: 'New',
      status: rides.loading && !rides.data ? 'loading' : rides.data ? (rideLive ? 'live' : 'soon') : null,
    },
    { to: '/local-cars', icon: Phone, title: 'Local Cars', sub: '(Call & Book)' },
  ]

  return (
    <div className="pub-home">
      <section className="pub-hero">
        <div className="container pub-hero-grid">
          <div className="pub-hero-copy">
            <span className="pub-eyebrow">
              <MapPin size={14} /> Made for Kolkata &amp; West Bengal
            </span>
            <h1 className="pub-hero-title">
              Your Journey,
              <br />
              Our <span>Responsibility</span>
            </h1>
            <p className="pub-hero-sub">
              Search local buses, set alarms, explore stops, book shared rides, or connect with local car owners.
            </p>
          </div>
          <div className="pub-hero-art">
            <img src={heroBus} alt="A GO-GO Ride bus on a Kolkata road with Howrah Bridge behind it" />
          </div>
          <div className="pub-hero-search">
            <SearchBar />
          </div>
        </div>
      </section>

      <section className="container pub-section-tight" aria-label="What you can do">
        <div className="pub-features">
          {features.map(({ to, icon: Icon, title, sub, badge, status }) => (
            <Link key={to} to={to} className="pub-feature">
              <span className="pub-feature-icon">
                <Icon size={26} strokeWidth={1.9} />
              </span>
              <span className="pub-feature-text">
                {badge && <span className="badge badge-accent pub-feature-badge">{badge}</span>}
                <strong>{title}</strong>
                {sub && <span>{sub}</span>}
                {status === 'loading' && <Skeleton width={70} height={12} style={{ marginTop: 4 }} />}
                {status === 'live' && (
                  <span className="pub-live">
                    <span className="dot dot-pulse" /> Live now
                  </span>
                )}
                {status === 'soon' && <span className="text-muted">Coming Soon</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container pub-section-tight" aria-labelledby="pub-popular-title">
        <div className="card pub-popular">
          <div className="row-between pub-popular-head">
            <h2 id="pub-popular-title" className="section-title">
              Popular Routes
            </h2>
            <Link to="/routes" className="link-btn">
              View All Routes <ChevronRight size={16} />
            </Link>
          </div>
          <PopularRoutes state={popular} />
        </div>
      </section>

      <section className="container pub-section" aria-labelledby="pub-stats-title">
        <div className="pub-stats-wrap">
          <div>
            <h2 id="pub-stats-title" className="pub-h2">
              Kolkata&apos;s bus network, <span className="text-accent">in your pocket</span>
            </h2>
            <p className="text-muted">Live numbers from the GO-GO Ride directory - growing every week as owners list their buses.</p>
          </div>
          <PlatformStats />
        </div>
      </section>

      <section className="container pub-section-tight">
        <AppBanner />
      </section>
    </div>
  )
}

function PopularRoutes({ state }) {
  const { data, loading, error, reload } = state
  if (loading && !data) {
    return (
      <div className="pub-routes">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={70} radius={12} />
        ))}
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="pub-inline-state">
        <span>Popular routes couldn&apos;t be loaded.</span>
        <button type="button" className="link-btn" onClick={() => reload()}>
          Try again
        </button>
      </div>
    )
  }
  if (!data?.length) {
    return (
      <div className="pub-inline-state">
        <span>Popular routes will appear here as riders start searching.</span>
        <Link to="/routes" className="link-btn">
          Browse routes
        </Link>
      </div>
    )
  }
  return (
    <div className="pub-routes">
      {data.map((r) => (
        <Link key={r.id} to={`/search?${new URLSearchParams({ from: r.from || '', to: r.to || '' })}`} className="pub-route">
          <BusFront size={22} className="pub-route-icon" />
          <span className="pub-route-col">
            <strong className="truncate" title={r.from}>
              {r.from}
            </strong>
            <span className="pub-route-num">{r.routeNumber}</span>
          </span>
          <span className="pub-route-col right">
            <span className="text-xs text-muted">To</span>
            <strong className="truncate" title={r.to}>
              {r.to}
            </strong>
          </span>
        </Link>
      ))}
    </div>
  )
}

function AppBanner() {
  const items = [
    { icon: Clock3, label: 'Accurate Timetables' },
    { icon: Search, label: 'Easy Search' },
    { icon: AlarmClock, label: 'Smart Alarms' },
    { icon: Headset, label: 'Local Support' },
  ]
  return (
    <div className="pub-banner">
      <div className="pub-phone" aria-hidden="true">
        <div className="pub-phone-screen">
          <div className="pub-phone-bar" />
          <img src={logoFull} alt="" className="pub-phone-logo" />
          <div className="pub-phone-line w80" />
          <div className="pub-phone-line w60" />
          <div className="pub-phone-card">
            <BusFront size={12} />
            <span />
          </div>
          <div className="pub-phone-card">
            <MapPin size={12} />
            <span />
          </div>
        </div>
      </div>
      <div className="pub-banner-copy">
        <h2>Track. Plan. Travel Smarter.</h2>
        <p>Your all-in-one app for local bus and ride bookings.</p>
      </div>
      <ul className="pub-banner-features">
        {items.map(({ icon: Icon, label }) => (
          <li key={label}>
            <span className="pub-banner-icon">
              <Icon size={22} />
            </span>
            {label}
          </li>
        ))}
      </ul>
      <div className="pub-store" aria-label="Android app coming soon on Google Play">
        <span className="pub-store-badge" aria-disabled="true">
          <Play size={22} fill="currentColor" />
          <span>
            <small>Coming soon on</small>
            <strong>Google Play</strong>
          </span>
        </span>
        <Button to="/home" variant="white" size="sm" iconRight={<ArrowRight size={16} />}>
          Use the web app
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ phone splash

function AutoIcon(props) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3.5 16.5V10a5 5 0 0 1 5-5h5.5l4.5 5.5h1a1.5 1.5 0 0 1 1.5 1.5v4.5" />
      <path d="M3.5 10.5h11" />
      <path d="M14 5v5.5" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M9 17h6.5" />
    </svg>
  )
}

const MODES = [
  { to: '/search', label: 'Bus', icon: (p) => <BusFront size={26} {...p} />, tone: 'navy' },
  { to: '/local-cars', label: 'Car', icon: (p) => <CarFront size={26} {...p} />, tone: 'orange' },
  { to: '/running-car', label: 'Auto', icon: (p) => <AutoIcon {...p} />, tone: 'green' },
  { to: '/running-car', label: 'Bike', icon: (p) => <Motorbike size={26} {...p} />, tone: 'navy' },
]

function MobileSplash() {
  const { user, isAuthenticated } = useAuth()

  // The splash is a full-screen app screen: hide the website navbar/footer while it is shown.
  useEffect(() => {
    document.body.classList.add('pub-splash-active')
    return () => document.body.classList.remove('pub-splash-active')
  }, [])

  return (
    <div className="pub-splash">
      <div className="pub-splash-top">
        <img src={logoWordmark} alt="GO-GO Ride" className="pub-splash-logo" draggable="false" />
        <div className="pub-splash-tagline" lang="bn">
          <p>
            <span className="b">বাস</span>
            <span className="o">-Car</span> , <span className="b">টোটো</span>
            <span className="o">-Bike</span> সব খবর একসাথে।
          </p>
          <p>
            যাত্রা হোক সহজ সরল <span className="o">&quot;GO-GO Ride&quot;</span> অ্যাপে ।।
          </p>
        </div>
        <p className="pub-splash-sub">
          Smart local transport for
          <br />
          <strong>West Bengal</strong>
        </p>
      </div>

      <div className="pub-splash-art">
        <img src={heroCity} alt="A car, a bus, an auto and a bike on a road in Kolkata" />
      </div>

      <div className="pub-splash-sheet">
        <Button to="/home" size="lg" block className="pub-splash-cta">
          {isAuthenticated ? 'Continue' : 'Get Started'}
        </Button>
        {isAuthenticated ? (
          <span className="pub-splash-signed">Signed in as {user?.name}</span>
        ) : (
          <Link to="/login" className="pub-splash-login">
            Login / Register
          </Link>
        )}
        <nav className="pub-modes" aria-label="Travel modes">
          {MODES.map(({ to, label, icon: Icon, tone }) => (
            <Link key={label} to={to} className={`pub-mode ${tone}`}>
              <span className="pub-mode-ring">
                <Icon />
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
