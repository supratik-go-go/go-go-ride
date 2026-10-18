import { useMemo, useState } from 'react'
import { ArrowRight, ArrowUpDown, BellRing, Bike, CalendarDays, CarFront, CarTaxiFront, Clock, IndianRupee, MapPin, Route, Search, ShieldCheck, Users, X } from 'lucide-react'
import { StopInput } from '../../components/navigation/SearchBar'
import { Avatar, Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, useToast } from '../../components/ui'
import { BookingModal, NotifyMeForm, NotifyMeModal, openPicker, useRequireLogin } from '../../components/passenger'
import { rideService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { formatCurrency, formatDateLong, formatNumber, formatTime, label, parseTimestamp, relativeDayLabel, toISODate, todayISO } from '../../utils/format'
import runningCarImg from '../../assets/brand/running-car.jpg'
import './passenger.css'

const VEHICLES = [
  { value: '', label: 'All', icon: null },
  { value: 'CAR', label: 'Car', icon: CarFront },
  { value: 'AUTO', label: 'Auto', icon: CarTaxiFront },
  { value: 'BIKE', label: 'Bike', icon: Bike },
]
const VEHICLE_ICON = { CAR: CarFront, AUTO: CarTaxiFront, BIKE: Bike }

export default function RunningCar() {
  const status = useAsync(() => rideService.status(), [])
  const s = status.data

  if (status.loading && !s) {
    return (
      <div className="px-page px-wide" aria-busy="true">
        <PageHeader title="Running Car" />
        <div className="stack" style={{ '--gap': '16px' }}>
          <Skeleton height={220} radius={20} />
          <Skeleton height={180} radius={16} />
          <Skeleton height={120} radius={16} />
        </div>
      </div>
    )
  }
  if (status.error && !s) {
    return (
      <div className="px-page px-wide">
        <PageHeader title="Running Car" />
        <ErrorState error={status.error} onRetry={() => status.reload()} />
      </div>
    )
  }
  return s?.status === 'LIVE' ? <LiveRides info={s} /> : <ComingSoon info={s} onJoined={() => status.reload({ silent: true })} />
}

// ------------------------------------------------------------------ coming soon

function ComingSoon({ info, onJoined }) {
  const waiting = info?.waitlistCount ?? 0
  return (
    <div className="px-page px-narrow">
      <PageHeader title="Running Car" />
      <section className="px-rc-hero">
        <img src={runningCarImg} alt="" aria-hidden="true" className="px-rc-hero-img" />
        <div className="px-rc-hero-body">
          <span className="badge badge-accent badge-square">Coming Soon</span>
          <h1>Running Car — Coming Soon</h1>
          <p>{info?.tagline || 'Book shared rides on your route. Affordable, faster and smarter.'}</p>
          {waiting > 0 && (
            <p className="px-waiting">
              <Users size={18} /> <strong>{formatNumber(waiting)}</strong> {waiting === 1 ? 'person is' : 'people are'} already waiting
            </p>
          )}
        </div>
      </section>

      <div className="px-rc-grid">
        <section className="card px-card-pad" aria-labelledby="px-notify-title">
          <div className="row" style={{ '--gap': '12px', marginBottom: 14 }}>
            <span className="icon-tile accent">
              <BellRing size={22} />
            </span>
            <div>
              <h2 id="px-notify-title" className="px-section-title">
                Notify me at launch
              </h2>
              <p className="text-sm text-muted">We&apos;ll send one message when shared rides open near you.</p>
            </div>
          </div>
          <NotifyMeForm onDone={onJoined} />
        </section>

        <section className="px-rc-features" aria-label="How Running Car works">
          {[
            { icon: Route, title: 'Rides on your route', text: 'Drivers publish trips between bus stops you already know.' },
            { icon: IndianRupee, title: 'Pay per seat', text: 'Share the car and split the cost with fellow travellers.' },
            { icon: ShieldCheck, title: 'Trusted drivers', text: 'Every booking is tied to a registered GO-GO Ride driver.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="px-rc-feature">
              <span className="icon-tile">
                <Icon size={22} />
              </span>
              <div>
                <div className="fw-600">{title}</div>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ live

function LiveRides({ info }) {
  const toast = useToast()
  const requireLogin = useRequireLogin()
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [date, setDate] = useState('')
  const [applied, setApplied] = useState({})
  const [vehicleType, setVehicleType] = useState('')
  const [page, setPage] = useState(1)
  const [booking, setBooking] = useState(null)
  const [notifyOpen, setNotifyOpen] = useState(false)

  const params = useMemo(() => {
    const p = { status: 'SCHEDULED', page, limit: 10 }
    if (applied.fromStopId) p.fromStopId = applied.fromStopId
    if (applied.toStopId) p.toStopId = applied.toStopId
    if (applied.date) p.date = applied.date
    if (vehicleType) p.vehicleType = vehicleType
    return p
  }, [applied, vehicleType, page])
  const rides = useAsync(() => rideService.list(params), [JSON.stringify(params)])
  const rows = rides.data?.data ?? []
  const meta = rides.data?.meta
  const filtered = Boolean(applied.fromStopId || applied.toStopId || applied.date || vehicleType)

  const search = (e) => {
    e.preventDefault()
    if (from?.name && !from.id) {
      toast.warning('Pick the pickup stop from the suggestions.')
      return
    }
    if (to?.name && !to.id) {
      toast.warning('Pick the drop stop from the suggestions.')
      return
    }
    if (from?.id && from.id === to?.id) {
      toast.warning('Pickup and drop must be different stops.')
      return
    }
    setApplied({ fromStopId: from?.id || '', toStopId: to?.id || '', date })
    setPage(1)
  }

  const reset = () => {
    setFrom(null)
    setTo(null)
    setDate('')
    setVehicleType('')
    setApplied({})
    setPage(1)
  }

  const book = (ride) => {
    if (!requireLogin()) return
    setBooking(ride)
  }

  return (
    <div className="px-page px-wide">
      <PageHeader title="Running Car" />

      <section className="px-rc-live">
        <div className="px-rc-live-text">
          <Badge tone="success" square>
            <span className="dot dot-pulse" /> Live
          </Badge>
          <h1>Find a shared ride</h1>
          <p>{info?.tagline}</p>
          {!filtered && meta?.total > 0 && (
            <span className="px-rc-live-count">
              <CarFront size={16} /> {formatNumber(meta.total)} upcoming ride{meta.total === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <img src={runningCarImg} alt="" aria-hidden="true" className="px-rc-live-img" />
      </section>

      <form className="card px-ride-search" onSubmit={search} aria-label="Find a shared ride">
        <div className="px-search-stops">
          <StopInput
            label="Pickup"
            value={from}
            onChange={setFrom}
            placeholder="Pickup stop"
            icon={<MapPin size={22} className="px-pin-from" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
          />
          <div className="search-bar-sep px-search-sep">
            <button
              type="button"
              className="swap-btn"
              onClick={() => {
                setFrom(to)
                setTo(from)
              }}
              aria-label="Swap pickup and drop"
            >
              <ArrowUpDown size={18} />
            </button>
          </div>
          <StopInput
            label="Drop"
            value={to}
            onChange={setTo}
            placeholder="Drop stop"
            icon={<MapPin size={22} className="px-pin-to" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
          />
        </div>
        <div className="px-ride-filters">
          <label className="px-select-box px-ride-date">
            <span className="px-select-label">Date</span>
            <span className="px-select-value">
              <CalendarDays size={18} />
              <span className="truncate">{date ? formatDateLong(date) : 'Any upcoming date'}</span>
            </span>
            <input
              type="date"
              className="px-overlay-input"
              min={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => openPicker(e.currentTarget)}
              aria-label="Ride date"
            />
          </label>
          {date && (
            <button type="button" className="icon-btn" onClick={() => setDate('')} aria-label="Clear date">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="px-chip-row" role="radiogroup" aria-label="Vehicle type">
          {VEHICLES.map(({ value, label: text, icon: Icon }) => (
            <button
              key={value || 'all'}
              type="button"
              role="radio"
              aria-checked={vehicleType === value}
              className={`chip ${vehicleType === value ? 'active' : ''}`}
              onClick={() => {
                setVehicleType(value)
                setPage(1)
              }}
            >
              {Icon && <Icon size={16} />} {text}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {filtered && (
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          )}
          <Button type="submit" variant="accent" icon={<Search size={18} />}>
            Find rides
          </Button>
        </div>
      </form>

      <section className="px-section" aria-labelledby="px-rides-title" style={{ marginTop: 18 }}>
        <div className="px-section-head">
          <h2 id="px-rides-title" className="px-section-title">
            {filtered ? 'Rides matching your search' : 'Upcoming rides'}
          </h2>
          {meta?.total != null && <span className="text-xs text-muted">{meta.total} found</span>}
        </div>

        {rides.loading && !rides.data ? (
          <div className="stack" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={104} radius={14} />
            ))}
          </div>
        ) : rides.error && !rides.data ? (
          <ErrorState error={rides.error} onRetry={() => rides.reload()} />
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<CarFront size={26} />}
              title={filtered ? 'No rides match your search' : 'No upcoming rides right now'}
              message={filtered ? 'Try another date, vehicle type or nearby stop.' : 'Drivers have not published any upcoming trips yet. Check back soon.'}
              action={
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  {filtered && (
                    <Button variant="outline" size="sm" onClick={reset}>
                      Clear search
                    </Button>
                  )}
                  <Button size="sm" icon={<BellRing size={16} />} onClick={() => setNotifyOpen(true)}>
                    Notify me
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className={`stack ${rides.loading ? 'px-dim' : ''}`} style={{ '--gap': '12px' }}>
            {rows.map((ride) => (
              <RideCard key={ride.id} ride={ride} onBook={() => book(ride)} />
            ))}
            <Pagination meta={meta} onChange={setPage} noun="rides" />
          </div>
        )}
      </section>

      <p className="px-rc-foot text-sm text-muted">
        Don&apos;t see your route?{' '}
        <button type="button" className="link-btn" onClick={() => setNotifyOpen(true)}>
          Get notified when new rides open near you
        </button>
      </p>

      <NotifyMeModal open={notifyOpen} onClose={() => setNotifyOpen(false)} />
      <BookingModal open={Boolean(booking)} onClose={() => setBooking(null)} type="RIDE" ride={booking} />
    </div>
  )
}

function RideCard({ ride, onBook }) {
  const when = parseTimestamp(ride.departureAt)
  const day = relativeDayLabel(toISODate(when))
  const Icon = VEHICLE_ICON[ride.vehicleType] || CarFront
  const left = ride.availableSeats ?? 0
  const full = left < 1
  return (
    <article className="card px-ride">
      <div className="px-ride-time">
        <span className="px-ride-clock">{formatTime(ride.departureAt)}</span>
        <span className="text-xs text-muted">{day}</span>
      </div>
      <div className="px-ride-main">
        <div className="px-ride-route">
          <span className="truncate">{ride.fromStop?.name ?? 'Pickup'}</span>
          <ArrowRight size={15} className="text-accent" />
          <span className="truncate">{ride.toStop?.name ?? 'Drop'}</span>
        </div>
        <div className="px-ride-meta">
          <span className="px-type-chip">
            <Icon size={15} /> {label('vehicleType', ride.vehicleType)}
          </span>
          <span className={`px-seats ${full ? 'is-full' : left <= 2 ? 'is-low' : ''}`}>
            <Users size={14} /> {full ? 'Full' : `${left} of ${ride.totalSeats} seats left`}
          </span>
          {ride.route?.routeNumber && (
            <span className="px-seats">
              <Route size={14} /> {ride.route.routeNumber}
            </span>
          )}
        </div>
        {ride.driver?.name && (
          <div className="px-ride-driver">
            <Avatar src={ride.driver.avatarUrl} name={ride.driver.name} size={24} />
            <span className="text-xs text-2">{ride.driver.name}</span>
            <Clock size={12} className="text-muted" />
            <span className="text-xs text-muted">{formatDateLong(toISODate(when)).split(',')[0]}</span>
          </div>
        )}
      </div>
      <div className="px-ride-side">
        <div className="px-ride-fare">
          {formatCurrency(ride.farePerSeat)}
          <small>/seat</small>
        </div>
        <Button size="sm" variant={full ? 'outline' : 'accent'} onClick={onBook} disabled={full}>
          {full ? 'Full' : 'Book seats'}
        </Button>
      </div>
    </article>
  )
}
