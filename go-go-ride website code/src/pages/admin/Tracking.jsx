import { useEffect, useMemo, useState } from 'react'
import {
  BusFront,
  CalendarDays,
  Clock,
  ExternalLink,
  MapPinned,
  Pencil,
  Phone,
  RefreshCw,
  Route,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { busService, trackingService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { useNow } from '../../hooks/useInterval'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  InfoItem,
  RouteBadge,
  SectionHeader,
  Skeleton,
  TrackingStatus,
} from '../../components/ui'
import { BusMarker, MapView, RouteLine, StopMarker } from '../../components/map/MapView'
import { FitOnTrigger, TrackingDisclaimer, TripProgress, UpdatedAgo } from '../../components/tracking/TrackingParts'
import {
  STATUS_META,
  STATUS_ORDER,
  TRACKING_REFRESH_MS,
  inMinutes,
  routeText,
  runsOnDay,
  splitRoute,
  stopKind,
} from '../../components/tracking/trackingUtils'
import { formatServiceDays } from '../../components/owner/ownerUtils'
import { busBadge, formatContact, formatCurrency, formatPhone, to12h, todayISO } from '../../utils/format'

// Marker colour per status. 'trk-*' tones are defined in tracking.css.
const MARKER_TONE = {
  MOVING: 'primary',
  AT_STOP: 'success',
  NOT_STARTED: 'trk-info',
  COMPLETED: 'muted',
  NOT_RUNNING: 'trk-danger',
  NO_DATA: 'muted',
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Every approved bus (the list endpoint caps pages at 100). */
async function loadFleet() {
  const first = await busService.list({ status: 'APPROVED', limit: 100, page: 1 })
  let all = first.data || []
  const pages = Math.min(first.meta?.totalPages || 1, 10)
  for (let p = 2; p <= pages; p += 1) {
    const r = await busService.list({ status: 'APPROVED', limit: 100, page: p })
    all = all.concat(r.data || [])
  }
  return all
}

function nextText(est) {
  const { status, stops, nextIndex, minutesToNext } = est
  if (status === 'MOVING' || status === 'AT_STOP') {
    const next = stops[nextIndex]
    return next ? `Next: ${next.name} · ${inMinutes(minutesToNext)}` : est.label
  }
  if (status === 'NOT_STARTED') return `Departs ${stops[0].departureTime12h} · ${inMinutes(minutesToNext)}`
  return est.label
}

function FleetSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="trk-fleet-item">
          <Skeleton width={56} height={28} radius={8} />
          <div className="grow stack" style={{ '--gap': '6px' }}>
            <Skeleton height={13} width="60%" />
            <Skeleton height={11} width="80%" />
          </div>
        </div>
      ))}
    </div>
  )
}

function SelectedCard({ item, details, onClose }) {
  const { bus, est, reason } = item
  const moving = est.status === 'MOVING' || est.status === 'AT_STOP'
  const totalKm = est.stops[est.stops.length - 1]?.distanceKm || 0
  return (
    <Card
      title={
        <span className="row" style={{ '--gap': '10px' }}>
          <RouteBadge>{busBadge(bus)}</RouteBadge>
          <span className="truncate">{bus.busNumber}</span>
        </span>
      }
      subtitle={routeText(bus)}
      action={
        <IconButton label="Close details" onClick={onClose}>
          <X size={18} />
        </IconButton>
      }
    >
      <div className="stack" style={{ '--gap': '14px' }}>
        <div className="row wrap" style={{ '--gap': '8px' }}>
          <TrackingStatus status={est.status} />
          <span className="text-sm text-2">{est.label}</span>
        </div>

        {moving && (
          <TripProgress
            value={est.progress}
            label="Trip progress (estimated)"
            right={totalKm > 0 ? `${(est.progress * totalKm).toFixed(1)} / ${totalKm.toFixed(1)} km` : undefined}
          />
        )}

        {est.status === 'NOT_RUNNING' && (
          <div className="alert alert-danger">
            <CalendarDays size={16} />
            <span>{reason || 'Not in service today.'}</span>
          </div>
        )}

        <div className="soft-panel row" style={{ '--gap': '10px' }}>
          <Clock size={18} className="text-primary" />
          <span className="text-sm fw-500">{nextText(est)}</span>
        </div>

        <div className="trk-detail-grid">
          <InfoItem icon={<UserRound size={18} />} label="Owner" value={bus.owner?.name || '-'} />
          <InfoItem
            icon={<Phone size={18} />}
            label="Owner phone"
            value={bus.owner?.phone ? <a href={`tel:${bus.owner.phone}`}>{formatPhone(bus.owner.phone)}</a> : '-'}
          />
          <InfoItem
            icon={<Phone size={18} />}
            label={`Booking (${to12h(bus.contactStart)}–${to12h(bus.contactEnd)})`}
            value={bus.contactNumber ? <a href={`tel:${bus.contactNumber}`}>{formatContact(bus.contactNumber)}</a> : '-'}
          />
          <InfoItem icon={<CalendarDays size={18} />} label="Service days" value={formatServiceDays(bus.serviceDays)} />
          <InfoItem icon={<Route size={18} />} label="Stops" value={`${est.stops.length} stops${totalKm ? ` · ${totalKm} km` : ''}`} />
          <InfoItem icon={<BusFront size={18} />} label="Fare" value={formatCurrency(bus.fare)} />
        </div>

        {!details && <p className="text-xs text-muted">Checking today&apos;s non-operating dates…</p>}

        <div className="trk-detail-actions">
          <Button size="sm" variant="outline" icon={<ExternalLink size={15} />} to={`/bus/${bus.id}`}>
            View bus
          </Button>
          <Button size="sm" variant="outline" icon={<MapPinned size={15} />} to={`/bus/${bus.id}/track`}>
            Passenger view
          </Button>
          <Button size="sm" icon={<Pencil size={15} />} to={`/admin/buses/${bus.id}/edit`}>
            Edit
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function Tracking() {
  const q = useAsync(loadFleet, [])
  const now = useNow(TRACKING_REFRESH_MS)
  const [details, setDetails] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [selectTick, setSelectTick] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const today = todayISO()

  // The list endpoint has no availability; the weekly schedule decides, and the
  // selected bus's details (fetched below) add declared non-operating dates.
  const fleet = useMemo(
    () =>
      (q.data || []).map((bus) => {
        const d = details[bus.id]
        const isRunning = d ? d.availability?.isRunning !== false : runsOnDay(bus, now)
        const est = trackingService.estimate(bus, { now, isRunning })
        const reason = d?.availability?.reason || (!isRunning ? `Not scheduled on ${WEEKDAY[now.getDay()]}s` : null)
        return { bus, est, reason }
      }),
    [q.data, details, now],
  )

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]))
    for (const f of fleet) c[f.est.status] += 1
    return c
  }, [fleet])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return fleet
      .filter((f) => !statusFilter || f.est.status === statusFilter)
      .filter((f) => {
        if (!term) return true
        const b = f.bus
        return [b.busNumber, b.busName, busBadge(b), routeText(b), b.owner?.name, b.operator].some((v) =>
          String(v || '').toLowerCase().includes(term),
        )
      })
      .sort((a, b) => STATUS_ORDER.indexOf(a.est.status) - STATUS_ORDER.indexOf(b.est.status) || busBadge(a.bus).localeCompare(busBadge(b.bus)))
  }, [fleet, statusFilter, search])

  const selected = fleet.find((f) => f.bus.id === selectedId) || null

  useEffect(() => {
    if (!selectedId || details[selectedId]) return
    let alive = true
    busService
      .get(selectedId, today)
      .then((d) => alive && setDetails((m) => ({ ...m, [selectedId]: d })))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [selectedId, details, today])

  const select = (id) => {
    setSelectedId((cur) => (cur === id ? null : id))
    setSelectTick((t) => t + 1)
  }

  const allStopPoints = useMemo(() => {
    const seen = new Map()
    for (const bus of q.data || []) {
      for (const s of bus.stopages || []) {
        if (s.stop?.latitude != null && s.stop?.longitude != null) seen.set(s.stop.id, [s.stop.latitude, s.stop.longitude])
      }
    }
    return [...seen.values()]
  }, [q.data])

  const route = selected ? splitRoute(selected.est) : null
  const selectedPoints = selected ? [...selected.est.stops.map((s) => s.point), selected.est.point] : []

  return (
    <div>
      <SectionHeader
        title="Live Tracking"
        subtitle="Estimated positions of today's approved buses, calculated from their timetables."
        actions={
          <>
            {q.data && (
              <span className="text-xs text-muted">
                <UpdatedAgo at={now} prefix="Positions updated" />
              </span>
            )}
            <Button variant="outline" size="sm" icon={<RefreshCw size={15} className={q.loading ? 'trk-spin' : undefined} />} onClick={() => { setDetails({}); q.reload() }} disabled={q.loading}>
              Reload buses
            </Button>
          </>
        }
      />

      <TrackingDisclaimer />
      <div style={{ height: 16 }} />

      <div className="trk-stats" role="group" aria-label="Filter by status">
        {STATUS_ORDER.filter((s) => s !== 'NO_DATA' || counts.NO_DATA > 0).map((s) => (
          <button
            key={s}
            type="button"
            className={`trk-stat ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter((cur) => (cur === s ? '' : s))}
            aria-pressed={statusFilter === s}
          >
            <span className={`trk-stat-dot trk-c-${s}`} />
            <span>
              <span className="trk-stat-value tabular">{q.data ? counts[s] : '–'}</span>
              <span className="trk-stat-label" style={{ display: 'block' }}>
                {STATUS_META[s].label}
              </span>
            </span>
          </button>
        ))}
      </div>

      {q.error && !q.data ? (
        <Card>
          <ErrorState error={q.error} onRetry={q.reload} />
        </Card>
      ) : (
        <div className="trk-admin-grid">
          <div className="trk-admin-map">
            <MapView height="clamp(380px, 62vh, 640px)" zoom={12} fit={allStopPoints}>
              {route && (
                <>
                  <RouteLine points={route.travelled} color="#a9b2c9" weight={5} dashed />
                  <RouteLine points={route.upcoming} color="#0b2a7a" weight={6} />
                  {selected.est.stops.map((s, i) => (
                    <StopMarker key={`${s.id}-${i}`} point={s.point} kind={stopKind(selected.est, i)} name={`${s.name} · ${s.arrivalTime12h}`} />
                  ))}
                </>
              )}
              {filtered.map(({ bus, est }) => (
                <BusMarker
                  key={bus.id}
                  point={est.point}
                  label={busBadge(bus)}
                  tone={MARKER_TONE[est.status]}
                  selected={bus.id === selectedId}
                  tooltip={`${busBadge(bus)} · ${STATUS_META[est.status].label} (estimated)`}
                  onClick={() => select(bus.id)}
                />
              ))}
              <FitOnTrigger points={selectedPoints} trigger={selected ? selectTick : 0} />
            </MapView>
            <div className="trk-admin-legend" aria-hidden="true">
              {STATUS_ORDER.filter((st) => st !== 'NO_DATA').map((st) => (
                <span key={st}>
                  <i className={`trk-c-${st}`} /> {STATUS_META[st].label}
                </span>
              ))}
            </div>
          </div>

          <div className="stack" style={{ '--gap': '16px' }}>
            {selected && <SelectedCard item={selected} details={details[selected.bus.id]} onClose={() => setSelectedId(null)} />}

            <Card pad={false}>
              <div className="trk-fleet-toolbar">
                <div className="row-between">
                  <span className="card-title">Buses</span>
                  <span className="text-xs text-muted">
                    {filtered.length} of {fleet.length}
                  </span>
                </div>
                <div className="input-wrap has-icon">
                  <span className="input-icon">
                    <Search size={16} />
                  </span>
                  <input
                    className="input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Bus number, route or owner"
                    aria-label="Search buses"
                  />
                </div>
                <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label} ({counts[s]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="trk-fleet-list">
                {q.loading && !q.data ? (
                  <FleetSkeleton />
                ) : !filtered.length ? (
                  <EmptyState
                    compact
                    icon={<BusFront size={24} />}
                    title={fleet.length ? 'No buses match' : 'No approved buses yet'}
                    message={fleet.length ? 'Clear the search or status filter to see every bus.' : 'Approved buses appear here with their estimated positions.'}
                    action={
                      fleet.length ? (
                        <Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('') }}>
                          Clear filters
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  filtered.map(({ bus, est }) => (
                    <button
                      key={bus.id}
                      type="button"
                      className={`trk-fleet-item ${bus.id === selectedId ? 'active' : ''}`}
                      onClick={() => select(bus.id)}
                      aria-pressed={bus.id === selectedId}
                    >
                      <RouteBadge>{busBadge(bus)}</RouteBadge>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="fw-600 truncate" style={{ display: 'block' }}>
                          {bus.busNumber}
                          {bus.busName ? <span className="text-muted fw-500"> · {bus.busName}</span> : null}
                        </span>
                        <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
                          {nextText(est)}
                        </span>
                      </span>
                      <span className={`trk-stat-dot trk-c-${est.status}`} title={STATUS_META[est.status].label} />
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
