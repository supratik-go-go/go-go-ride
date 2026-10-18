import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Armchair,
  ArrowRight,
  Bell,
  BellRing,
  BusFront,
  CalendarDays,
  CalendarX,
  CircleCheck,
  ChevronRight,
  Gauge,
  Hash,
  IndianRupee,
  Landmark,
  Navigation,
  Phone,
  Share2,
  ShieldAlert,
  Snowflake,
  Star,
  Ticket,
  UserRound,
} from 'lucide-react'
import { Button, ErrorState, Modal, PageHeader, Skeleton, Spinner, StarRating, useToast } from '../../components/ui'
import {
  BookingModal,
  FavoriteButton,
  ReviewForm,
  ReviewList,
  RouteTimeline,
  openPicker,
  ratingText,
  safeDate,
  shareLink,
  timelineFromTimetable,
  useRequireLogin,
} from '../../components/passenger'
import { busService } from '../../services'
import { assetUrl } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { LABELS, busBadge, formatContact, formatCurrency, formatDate, formatDateLong, label, relativeDayLabel, splitDays, to12h, todayISO } from '../../utils/format'
import busSideImg from '../../assets/brand/bus-side.jpg'
import './passenger.css'

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function routeNameOf(bus) {
  if (bus?.route?.name) return bus.route.name
  const tt = bus?.timetable ?? []
  if (tt.length > 1) return `${tt[0].stop?.name} - ${tt[tt.length - 1].stop?.name}`
  return bus?.busName || 'Bus route'
}

export default function BusDetails() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, isAdmin } = useAuth()
  const requireLogin = useRequireLogin()

  const date = safeDate(params.get('date'))
  const fromId = params.get('from') || ''
  const toId = params.get('to') || ''

  const q = useAsync(() => busService.get(id, date), [id, date])
  const bus = q.data
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)

  const trip = useMemo(() => {
    const p = new URLSearchParams({ date })
    if (fromId) p.set('from', fromId)
    if (toId) p.set('to', toId)
    return p.toString()
  }, [date, fromId, toId])

  const setDate = (iso) => {
    const next = new URLSearchParams(params)
    next.set('date', safeDate(iso))
    setParams(next, { replace: true })
  }

  const share = async () => {
    try {
      const result = await shareLink({
        title: `${busBadge(bus)} · ${routeNameOf(bus)} | GO-GO Ride`,
        text: `Bus ${busBadge(bus)} (${routeNameOf(bus)}) - timings, fare and stops on GO-GO Ride`,
        url: window.location.href,
      })
      if (result === 'copied') toast.success('Link copied - paste it anywhere to share.')
    } catch (err) {
      toast.error(err)
    }
  }

  const goAlarm = () => {
    if (!requireLogin()) return
    navigate(`/bus/${id}/alarm?${trip}`)
  }
  const goBook = () => {
    if (!requireLogin()) return
    setBookOpen(true)
  }

  if (q.loading && !bus) return <BusDetailsSkeleton />
  if (q.error && !bus) {
    return (
      <div className="px-page px-narrow">
        <PageHeader title="Bus Details" />
        <ErrorState error={q.error} title={q.error.status === 404 ? 'Bus not found' : undefined} onRetry={q.error.status === 404 ? undefined : () => q.reload()} />
        {q.error.status === 404 && (
          <div className="center">
            <Button to="/search" variant="outline">
              Search buses
            </Button>
          </div>
        )}
      </div>
    )
  }

  const timetable = bus.timetable ?? []
  const items = timelineFromTimetable(timetable, fromId, toId)
  const first = timetable[0]
  const last = timetable[timetable.length - 1]
  const boarding = timetable.find((t) => (t.stop?.id ?? t.stopId) === fromId)
  const dropping = timetable.find((t) => (t.stop?.id ?? t.stopId) === toId)
  const availability = bus.availability ?? { isRunning: true }
  const running = availability.isRunning !== false
  const days = splitDays(bus.serviceDays)
  const daily = ALL_DAYS.every((d) => days.includes(d))
  const canManage = Boolean(user && (user.id === bus.ownerId || isAdmin))
  const upcoming = (bus.exceptions ?? []).filter((e) => String(e.date).slice(0, 10) >= todayISO())
  const photo = assetUrl(bus.imageUrl) || busSideImg
  const contactDigits = String(bus.contactNumber || '').replace(/\D/g, '')

  const info = [
    { icon: <Hash size={20} />, label: 'Bus No.', value: bus.busNumber },
    { icon: <UserRound size={20} />, label: 'Operator', value: bus.operator || '—' },
    { icon: <Armchair size={20} />, label: 'Total Seats', value: bus.totalSeats ? `${bus.totalSeats} Seats` : '—' },
    { icon: <BusFront size={20} />, label: 'Bus Type', value: label('busType', bus.type) },
    { icon: <Gauge size={20} />, label: 'Bus Category', value: label('busCategory', bus.category) },
    { icon: <IndianRupee size={20} />, label: 'Fare', value: formatCurrency(bus.fare) },
  ]

  const Notice = canManage ? Link : 'div'

  return (
    <div className="px-page px-bus px-wide">
      <PageHeader
        title="Bus Details"
        actions={
          <div className="row" style={{ '--gap': '0px' }}>
            <FavoriteButton itemType="BUS" itemId={bus.id} />
            <button type="button" className="icon-btn" onClick={share} aria-label="Share this bus" title="Share">
              <Share2 size={21} />
            </button>
          </div>
        }
      />

      {bus.status && bus.status !== 'APPROVED' && (
        <div className="alert alert-warning" role="note" style={{ marginBottom: 14 }}>
          <ShieldAlert size={18} />
          <span>
            This bus is <strong>{label('busStatus', bus.status)}</strong>. Passengers will see it once an admin approves it.
            {bus.rejectionReason ? ` Reason: ${bus.rejectionReason}` : ''}
          </span>
        </div>
      )}

      <div className="px-bus-layout">
        <div className="px-bus-col">
          {/* hero */}
          <section className="px-bus-hero px-o1">
            <div className="px-bus-hero-text">
              <span className="px-bus-badge">{busBadge(bus)}</span>
              <h1>{routeNameOf(bus)}</h1>
              {bus.busName && <p className="text-sm text-muted">{bus.busName}</p>}
            </div>
            <img src={photo} alt={`${busBadge(bus)} bus`} className="px-bus-hero-img" />
            <div className="px-chip-row px-bus-chips">
              <span className="px-type-chip">
                <Snowflake size={16} /> {label('busType', bus.type)}
              </span>
              <span className="px-type-chip accent">
                <Gauge size={16} /> {label('busCategory', bus.category)}
              </span>
              {bus.operator && (
                <span className="px-type-chip green">
                  <Landmark size={16} /> {bus.operator}
                </span>
              )}
            </div>
          </section>

          {/* key facts */}
          <section className="card px-info-grid px-o2" aria-label="Bus information">
            {info.map((it) => (
              <div key={it.label} className="px-info-cell">
                <span className="px-info-icon">{it.icon}</span>
                <div className="px-info-text">
                  <span className="text-xs text-muted">{it.label}</span>
                  <span className="fw-600">{it.value}</span>
                </div>
              </div>
            ))}
          </section>

          {/* contact + rating */}
          <section className="card px-cr px-o3">
            <div className="px-cr-cell">
              <span className="px-cr-icon">
                <Phone size={24} />
              </span>
              <div className="px-cr-text">
                <span className="text-sm text-muted">Contact for Booking</span>
                {bus.contactNumber ? (
                  <a href={`tel:${contactDigits}`} className="px-cr-phone">
                    {formatContact(bus.contactNumber)}
                  </a>
                ) : (
                  <span className="fw-600 text-muted">Not provided</span>
                )}
                {(bus.contactStart || bus.contactEnd) && (
                  <span className="text-sm text-muted">
                    {to12h(bus.contactStart)} - {to12h(bus.contactEnd)}
                  </span>
                )}
              </div>
            </div>
            <button type="button" className="px-cr-cell px-cr-rating" onClick={() => setReviewsOpen(true)} aria-label={`User rating ${ratingText(bus.ratingAvg, bus.ratingCount)}, view reviews`}>
              <span className="px-cr-icon">
                <Star size={24} fill="currentColor" />
              </span>
              <div className="px-cr-text">
                <span className="text-sm text-muted">User Rating</span>
                <span className="px-cr-value">{ratingText(bus.ratingAvg, bus.ratingCount)}</span>
                <StarRating value={bus.ratingAvg || 0} size={15} />
                <span className="text-xs text-muted">({bus.ratingCount || 0} Reviews)</span>
              </div>
              <ChevronRight size={22} className="px-cr-chev" />
            </button>
          </section>

          {/* timeline */}
          <section className="card px-card-pad px-o5" aria-labelledby="px-tt-title">
            <div className="px-section-head" style={{ marginBottom: 6 }}>
              <h2 id="px-tt-title" className="px-section-title">
                Stops &amp; Timings
              </h2>
              <span className="text-xs text-muted">{timetable.length} stops</span>
            </div>
            {first && last && (
              <p className="px-journey">
                <span>
                  {first.departureTime12h} <ArrowRight size={14} /> {last.arrivalTime12h}
                </span>
                {bus.journey?.durationLabel && <span>· {bus.journey.durationLabel}</span>}
                {bus.journey?.totalDistanceKm != null && <span>· {Number(bus.journey.totalDistanceKm).toFixed(1)} km</span>}
              </p>
            )}
            {boarding && dropping && (boarding.sequence ?? 0) < (dropping.sequence ?? 0) && (
              <div className="px-mytrip">
                <span className="text-xs fw-600 text-accent">YOUR TRIP</span>
                <span className="fw-600 text-sm">
                  {boarding.stop?.name} {boarding.departureTime12h} <ArrowRight size={13} /> {dropping.stop?.name} {dropping.arrivalTime12h}
                </span>
              </div>
            )}
            {items.length ? (
              <RouteTimeline items={items} label={`Stops for ${busBadge(bus)}`} />
            ) : (
              <p className="text-sm text-muted">The timetable for this bus has not been published yet.</p>
            )}
          </section>
        </div>

        <aside className="px-bus-col px-bus-aside">
          {/* availability */}
          <section className={`px-avail ${running ? 'is-ok' : 'is-off'} px-o4 px-d1`} aria-live="polite">
            <span className="px-avail-icon">{running ? <CircleCheck size={22} /> : <CalendarX size={22} />}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="fw-600">
                {running ? 'Running' : 'Not running'} on {formatDateLong(date)}
                {q.loading && <Spinner size={13} className="px-inline-spin" />}
              </div>
              {!running && availability.reason && <div className="text-sm">{availability.reason}</div>}
              <div className="text-xs px-avail-days">
                {daily ? 'Runs every day' : days.length ? `Runs on ${days.map((d) => LABELS.day[d] || d).join(' · ')}` : 'Service days not published'}
              </div>
            </div>
            <label className="px-date-chip">
              <CalendarDays size={16} />
              <span>{relativeDayLabel(date)}</span>
              <input
                type="date"
                className="px-overlay-input"
                min={todayISO()}
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                onClick={(e) => openPicker(e.currentTarget)}
                aria-label="Change date"
              />
            </label>
          </section>
          {upcoming.length > 0 && (
            <div className="alert alert-warning px-o4 px-d1" role="note">
              <CalendarX size={18} />
              <div>
                <div className="fw-600">Upcoming non-operating dates</div>
                <ul className="px-exc-list">
                  {upcoming.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      Not running on {formatDate(e.date)}
                      {e.reason ? ` – ${e.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* primary actions (sticky bar on phones) */}
          <div className="px-bus-actions px-o8 px-d2">
            <Button icon={<Navigation size={18} />} onClick={() => navigate(`/bus/${id}/track?${trip}`)}>
              Track Live
            </Button>
            <Button variant="accent" icon={<Ticket size={18} />} onClick={goBook}>
              Book Seat
            </Button>
          </div>

          {/* alarm row */}
          <button type="button" className="px-alarm-row px-o7 px-d3" onClick={goAlarm}>
            <span className="px-alarm-icon">
              <Bell size={22} />
            </span>
            <span className="grow">
              <span className="fw-600 d-block">Add Alarm</span>
              <span className="text-xs text-muted d-block">Get notified before your bus arrival</span>
            </span>
            <ChevronRight size={20} className="text-muted" />
          </button>

          {/* owner notice */}
          <Notice {...(canManage ? { to: '/owner/buses' } : {})} className={`px-notice px-o6 px-d4 ${canManage ? 'is-link' : ''}`}>
            <span className="px-notice-icon">
              <BellRing size={20} />
            </span>
            <span className="grow">Please update in our app at least 5 days in advance if the bus will not operate on any specific date.</span>
            {canManage && <ChevronRight size={20} />}
          </Notice>
        </aside>
      </div>

      <ReviewsModal open={reviewsOpen} onClose={() => setReviewsOpen(false)} bus={bus} onRated={() => q.reload({ silent: true })} />
      <BookingModal open={bookOpen} onClose={() => setBookOpen(false)} type="BUS" bus={bus} defaultDate={date} />
    </div>
  )
}

function ReviewsModal({ open, onClose, bus, onRated }) {
  const { user } = useAuth()
  const toast = useToast()
  const [state, setState] = useState({ items: [], meta: null, loading: false, error: null })

  const load = useCallback(
    async (page) => {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const { data, meta } = await busService.reviews(bus.id, { page, limit: 10 })
        setState((s) => ({ items: page === 1 ? data : [...s.items, ...data], meta, loading: false, error: null }))
      } catch (error) {
        setState((s) => ({ ...s, loading: false, error }))
      }
    },
    [bus?.id],
  )

  useEffect(() => {
    if (open) load(1)
  }, [open, load])

  const mine = user ? state.items.find((r) => r.user?.id === user.id) : null
  const meta = state.meta
  const hasMore = meta && meta.page < meta.totalPages

  const submit = async (rating, comment) => {
    try {
      await busService.review(bus.id, rating, comment)
      toast.success(mine ? 'Your review has been updated.' : 'Thanks for rating this bus!')
      load(1)
      onRated?.()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ratings & Reviews" subtitle={`${busBadge(bus)} · ${routeNameOf(bus)}`} size="md">
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="px-rating-summary">
          <span className="px-rating-big">{ratingText(bus.ratingAvg, bus.ratingCount)}</span>
          <div className="stack" style={{ '--gap': '2px' }}>
            <StarRating value={bus.ratingAvg || 0} size={18} />
            <span className="text-sm text-muted">Based on {bus.ratingCount || 0} ratings</span>
          </div>
        </div>
        <ReviewForm
          key={mine?.id || 'new'}
          initialRating={mine?.rating || 0}
          initialComment={mine?.comment || ''}
          isUpdate={Boolean(mine)}
          title="Rate this bus"
          onSubmit={submit}
        />
        <div className="divider" />
        <div>
          <div className="px-section-head">
            <h4>What passengers say</h4>
            {meta?.total > 0 && <span className="text-xs text-muted">{meta.total} written reviews</span>}
          </div>
          {state.loading && !state.items.length ? (
            <div className="stack" style={{ marginTop: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={64} radius={10} />
              ))}
            </div>
          ) : state.error && !state.items.length ? (
            <ErrorState compact error={state.error} onRetry={() => load(1)} />
          ) : (
            <ReviewList reviews={state.items} emptyMessage="No written reviews yet. Be the first to share your experience." />
          )}
          {hasMore && (
            <div className="center" style={{ marginTop: 8 }}>
              <Button variant="outline" size="sm" loading={state.loading} onClick={() => load(meta.page + 1)}>
                Load more reviews
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function BusDetailsSkeleton() {
  return (
    <div className="px-page px-wide" aria-busy="true" aria-label="Loading bus details">
      <PageHeader title="Bus Details" />
      <div className="px-bus-layout">
        <div className="stack" style={{ '--gap': '16px' }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ '--gap': '10px', flex: 1 }}>
              <Skeleton width={96} height={52} radius={12} />
              <Skeleton width="70%" height={26} />
              <div className="row">
                <Skeleton width={80} height={28} radius={8} />
                <Skeleton width={80} height={28} radius={8} />
                <Skeleton width={70} height={28} radius={8} />
              </div>
            </div>
            <Skeleton width="38%" height={110} radius={14} />
          </div>
          <Skeleton height={150} radius={14} />
          <Skeleton height={120} radius={14} />
          <Skeleton height={280} radius={14} />
        </div>
        <div className="stack hide-mobile" style={{ '--gap': '16px' }}>
          <Skeleton height={90} radius={14} />
          <Skeleton height={60} radius={14} />
          <Skeleton height={70} radius={14} />
        </div>
      </div>
    </div>
  )
}

