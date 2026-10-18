import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  AlarmClock,
  BusFront,
  CalendarDays,
  ChevronUp,
  Footprints,
  Info,
  LocateFixed,
  Maximize2,
  MapPinOff,
  Navigation,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { busService, locationService, trackingService } from '../../services'
import { DEFAULT_CENTER, formatDistance, haversineKm } from '../../services/locationService'
import { useAsync } from '../../hooks/useAsync'
import { useNow } from '../../hooks/useInterval'
import { Button, ErrorState, IconButton, PageHeader, RouteBadge, Skeleton, TrackingStatus, useToast } from '../../components/ui'
import { BusMarker, FollowPoint, MapView, RouteLine, StopMarker, UserMarker } from '../../components/map/MapView'
import {
  FitOnTrigger,
  StopTimeline,
  TrackingDisclaimer,
  TripProgress,
  UpdatedAgo,
} from '../../components/tracking/TrackingParts'
import {
  STATUS_META,
  TRACKING_REFRESH_MS,
  findStop,
  inMinutes,
  nextRunLabel,
  routeText,
  splitRoute,
  stopKind,
} from '../../components/tracking/trackingUtils'
import { busBadge, formatContact, formatDate, to12h, todayISO } from '../../utils/format'

const cx = (...c) => c.filter(Boolean).join(' ')

const GEO_ERRORS = {
  1: 'Location permission was denied. Allow location access in your browser or phone settings.',
  2: 'Your location could not be determined. Check that GPS is turned on.',
  3: 'Finding your location took too long. Please try again.',
}

/** What the passenger cares about most: when does the bus reach *my* stop? */
function yourStopInfo(est, bus, stop, now) {
  if (!stop || !est || est.status === 'NOT_RUNNING' || est.status === 'NO_DATA') return null
  if (est.status === 'AT_STOP' && est.currentIndex === stop.index) {
    return { tone: 'here', title: `The bus is at your stop ${stop.name} now`, sub: stop.departureTime12h ? `Leaves at ${stop.departureTime12h}` : null }
  }
  const mins = trackingService.minutesUntilStop(bus, stop.id, now)
  if (mins != null) {
    return { tone: 'soon', title: `Arrives at your stop ${stop.name} ${inMinutes(mins)}`, sub: `Scheduled ${stop.index === 0 ? stop.departureTime12h : stop.arrivalTime12h}` }
  }
  return { tone: 'passed', title: `The bus has passed your stop ${stop.name}`, sub: `It was scheduled at ${stop.arrivalTime12h}` }
}

function StatusLine({ est, bus }) {
  const { status, stops, nextIndex, minutesToNext } = est
  if (status === 'NOT_RUNNING') {
    const next = nextRunLabel(bus)
    return (
      <div className="trk-callout danger">
        <CalendarDays size={18} />
        <div>
          <div className="fw-600">Not running today</div>
          <div className="text-sm">{bus.availability?.reason || 'This bus is not in service today.'}</div>
          {next && <div className="text-xs trk-callout-sub">Next scheduled run: {next}</div>}
        </div>
      </div>
    )
  }
  if (status === 'NO_DATA') {
    return (
      <div className="trk-callout muted">
        <Info size={18} />
        <div>
          <div className="fw-600">Timetable unavailable</div>
          <div className="text-sm">This bus doesn&apos;t have timed stops yet, so its position can&apos;t be estimated.</div>
        </div>
      </div>
    )
  }
  if (status === 'NOT_STARTED') {
    return (
      <div className="trk-nextline">
        <span className="trk-nextline-label">Departs</span>
        <span className="fw-600">
          {stops[0].name} at {stops[0].departureTime12h}
        </span>
        <span className="trk-eta">{inMinutes(minutesToNext)}</span>
      </div>
    )
  }
  if (status === 'COMPLETED') {
    const next = nextRunLabel(bus)
    return (
      <div className="trk-callout muted">
        <Info size={18} />
        <div>
          <div className="fw-600">Today&apos;s trip is complete</div>
          <div className="text-sm">{est.label}.</div>
          {next && <div className="text-xs trk-callout-sub">Next scheduled run: {next}</div>}
        </div>
      </div>
    )
  }
  const next = stops[nextIndex]
  return (
    <div className="trk-nextline">
      <span className="trk-nextline-label">Next stop</span>
      <span className="fw-600 truncate">{next?.name}</span>
      <span className="trk-eta">{inMinutes(minutesToNext)}</span>
    </div>
  )
}

function TrackingSkeleton() {
  return (
    <div className="trk-sheet-head">
      <Skeleton height={28} width="60%" />
      <Skeleton height={16} width="80%" />
      <Skeleton height={44} />
      <Skeleton height={10} />
    </div>
  )
}

export default function LiveTracking() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const toast = useToast()
  const today = todayISO()
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const dateParam = params.get('date')

  const q = useAsync(() => busService.get(id, today), [id, today])
  const bus = q.data
  const now = useNow(TRACKING_REFRESH_MS)
  const isRunning = bus?.availability?.isRunning !== false

  const est = useMemo(() => (bus ? trackingService.estimate(bus, { now, isRunning }) : null), [bus, now, isRunning])

  const [expanded, setExpanded] = useState(false)
  const [follow, setFollow] = useState(false)
  const [routeFitTick, setRouteFitTick] = useState(0)
  const [meFitTick, setMeFitTick] = useState(0)

  // --- device location (opt-in) -------------------------------------------
  const [locOn, setLocOn] = useState(false)
  const [locating, setLocating] = useState(false)
  const [myLoc, setMyLoc] = useState(null)
  const stopWatch = useRef(null)
  const firstFix = useRef(false)

  const stopLocation = () => {
    stopWatch.current?.()
    stopWatch.current = null
    setLocOn(false)
    setLocating(false)
    setMyLoc(null)
  }

  const toggleLocation = () => {
    if (locOn) {
      stopLocation()
      return
    }
    if (!locationService.isSupported()) {
      toast.error('Location is not supported on this device.')
      return
    }
    firstFix.current = false
    setLocOn(true)
    setLocating(true)
    stopWatch.current = locationService.watch(
      (pos) => {
        setMyLoc(pos)
        setLocating(false)
        if (!firstFix.current) {
          firstFix.current = true
          setMeFitTick((t) => t + 1)
        }
      },
      (err) => {
        toast.error(GEO_ERRORS[err?.code] || 'Could not get your location.')
        stopLocation()
      },
    )
  }

  useEffect(() => () => stopWatch.current?.(), [])

  // --- derived --------------------------------------------------------------
  const fromStop = findStop(est, fromParam)
  const toStop = findStop(est, toParam)
  const routePoints = useMemo(() => (est ? est.stops.map((s) => s.point).filter(Boolean) : []), [est])
  const fitPoints = useMemo(() => routePoints.map((p) => [p.lat, p.lng]), [routePoints])
  const missingCoords = est ? est.stops.some((s) => !s.point) : false
  const hasRoute = routePoints.length > 0

  // Re-fit once the screen has settled: the map mounts while the bottom sheet is
  // still sizing itself, so the first fit can be computed for the wrong height.
  useEffect(() => {
    if (!hasRoute) return undefined
    const t = setTimeout(() => setRouteFitTick((n) => n + 1), 400)
    return () => clearTimeout(t)
  }, [hasRoute])
  const { travelled, upcoming } = splitRoute(est)
  const nearest = useMemo(() => (bus && myLoc ? trackingService.nearestStopOnRoute(bus, myLoc) : null), [bus, myLoc])
  const busDistance = myLoc && est?.point ? haversineKm(myLoc, est.point) : null
  const nearestEta = nearest ? trackingService.minutesUntilStop(bus, nearest.id, now) : null
  const yourStop = est?.status === 'COMPLETED' ? null : yourStopInfo(est, bus, fromStop, now)

  const totalKm = est?.stops?.length ? est.stops[est.stops.length - 1].distanceKm || 0 : 0
  const stopsProgress =
    est && est.stops.length > 1 ? Math.min(1, (est.currentIndex + (est.segmentProgress || 0)) / (est.stops.length - 1)) : 0
  const progress = est ? (totalKm > 0 ? est.progress : est.status === 'COMPLETED' ? 1 : stopsProgress) : 0

  const qs = new URLSearchParams()
  qs.set('date', dateParam || today)
  if (fromParam) qs.set('from', fromParam)
  if (toParam) qs.set('to', toParam)

  const badge = busBadge(bus)
  const meta = est ? STATUS_META[est.status] : null
  const center = routePoints[0] || DEFAULT_CENTER

  const header = (
    <PageHeader
      title="Live Tracking"
      subtitle={bus ? `${badge}${bus.busName ? ` · ${bus.busName}` : ''}` : q.error ? undefined : 'Loading bus…'}
      actions={
        <IconButton label="Reload bus details" onClick={() => q.reload()} disabled={q.loading}>
          <RefreshCw size={19} className={q.loading ? 'trk-spin' : undefined} />
        </IconButton>
      }
      className="trk-pageheader"
    />
  )

  if (q.error && !bus) {
    return (
      <div className="trk-page">
        {header}
        <ErrorState error={q.error} onRetry={q.error.status === 404 ? undefined : q.reload} title={q.error.status === 404 ? 'Bus not found' : undefined} />
        <div className="center">
          <Button variant="outline" to="/home" icon={<BusFront size={17} />}>
            Search buses
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="trk-page">
      <div className="trk-screen">
        {header}
        <TrackingDisclaimer variant="strip" />

        <div className="trk-layout">
          <div className="trk-stage">
            {est && routePoints.length > 0 ? (
              <MapView center={center} zoom={13} height="100%" fit={fitPoints} className="trk-map">
                <RouteLine points={travelled} color="#a9b2c9" weight={5} dashed />
                <RouteLine points={upcoming} color="#0b2a7a" weight={6} />
                {est.stops.map((s, i) => (
                  <StopMarker
                    key={`${s.id}-${i}`}
                    point={s.point}
                    kind={stopKind(est, i, { fromId: fromStop?.id, toId: toStop?.id })}
                    name={`${s.name} · ${i === 0 ? s.departureTime12h : s.arrivalTime12h}`}
                  />
                ))}
                <BusMarker
                  point={est.point}
                  label={badge}
                  tone={meta?.tone}
                  selected={est.status === 'MOVING' || est.status === 'AT_STOP'}
                  tooltip={`${badge} · ${meta?.label} (estimated)`}
                />
                {myLoc && <UserMarker point={myLoc} accuracy={myLoc.accuracy} />}
                {follow && est.point && <FollowPoint point={est.point} />}
                <FitOnTrigger points={routePoints} trigger={routeFitTick} />
                <FitOnTrigger points={[myLoc, est.point, nearest?.point]} trigger={meFitTick} />
              </MapView>
            ) : est ? (
              <div className="trk-map-empty">
                <MapPinOff size={28} />
                <p className="fw-600">Map not available for this route</p>
                <p className="text-sm text-muted">The stops on this route don&apos;t have map locations yet. The timetable below still works.</p>
              </div>
            ) : (
              <div className="trk-map-empty">
                <Skeleton height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
              </div>
            )}

            {est && routePoints.length > 0 && (
              <div className="trk-map-controls">
                <button
                  type="button"
                  className={cx('trk-ctrl', follow && 'active')}
                  aria-pressed={follow}
                  onClick={() => setFollow((f) => !f)}
                  disabled={!est.point}
                >
                  <Navigation size={16} />
                  <span>{follow ? 'Following' : 'Follow bus'}</span>
                </button>
                <button type="button" className={cx('trk-ctrl', locOn && 'active blue')} aria-pressed={locOn} onClick={toggleLocation}>
                  <LocateFixed size={16} className={locating ? 'trk-spin-slow' : undefined} />
                  <span>{locating ? 'Locating…' : locOn ? 'My location' : 'Show me'}</span>
                </button>
                <button type="button" className="trk-ctrl icon" onClick={() => setRouteFitTick((t) => t + 1)} aria-label="Show whole route" title="Show whole route">
                  <Maximize2 size={16} />
                </button>
              </div>
            )}
          </div>

          <section className={cx('trk-sheet', expanded && 'expanded')} aria-label="Trip status">
            <button type="button" className="trk-sheet-handle" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
              <span className="trk-grabber" aria-hidden="true" />
              <span className="trk-sheet-handle-text">
                {expanded ? 'Show less' : 'Stops, timetable & more'}
                <ChevronUp size={15} className={cx('trk-chevron', expanded && 'open')} />
              </span>
            </button>

            {!est ? (
              <TrackingSkeleton />
            ) : (
              <>
                <div className="trk-sheet-scroll">
                  <div className="trk-sheet-head">
                    <div className="trk-bus-row">
                      <RouteBadge>{badge}</RouteBadge>
                      <div className="grow">
                        <div className="fw-700 truncate">{routeText(bus)}</div>
                        <div className="text-xs text-muted truncate">
                          {bus.busNumber}
                          {bus.busName ? ` · ${bus.busName}` : ''}
                        </div>
                      </div>
                      <TrackingStatus status={est.status} />
                    </div>

                    {est.status !== 'NOT_RUNNING' && est.status !== 'NO_DATA' && est.status !== 'COMPLETED' && (
                      <p className="trk-label">
                        <BusFront size={15} /> {est.label}
                      </p>
                    )}

                    <StatusLine est={est} bus={bus} />

                    {(est.status === 'MOVING' || est.status === 'AT_STOP') && (
                      <TripProgress
                        value={progress}
                        label="Trip progress (estimated)"
                        right={totalKm > 0 ? `${formatDistance(progress * totalKm)} of ${formatDistance(totalKm)}` : undefined}
                      />
                    )}

                    {yourStop && (
                      <div className={cx('trk-yourstop', yourStop.tone)}>
                        <span className="trk-yourstop-icon">
                          <Footprints size={18} />
                        </span>
                        <div className="grow">
                          <div className="fw-600">{yourStop.title}</div>
                          {yourStop.sub && <div className="text-xs">{yourStop.sub}</div>}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="trk-sheet-body">
                    {dateParam && dateParam !== today && (
                      <div className="alert alert-info">
                        <Info size={16} />
                        <span>
                          Live tracking shows <strong>today&apos;s</strong> trip. You searched for {formatDate(dateParam)}.
                        </span>
                      </div>
                    )}

                    {locOn && (
                      <div className="trk-me-card">
                        <div className="trk-me-title">
                          <LocateFixed size={16} /> Your location
                        </div>
                        {!myLoc ? (
                          <p className="text-sm text-muted">Finding your location…</p>
                        ) : (
                          <div className="stack" style={{ '--gap': '6px' }}>
                            {nearest && Number.isFinite(nearest.distanceKm) ? (
                              <p className="text-sm">
                                Nearest stop on this route: <strong>{nearest.name}</strong>, {formatDistance(nearest.distanceKm)} from you
                                {nearestEta != null && est.status !== 'NOT_RUNNING' ? ` · bus due ${inMinutes(nearestEta)}` : ''}.
                              </p>
                            ) : (
                              <p className="text-sm text-muted">Stops on this route have no map locations to compare with.</p>
                            )}
                            {busDistance != null && Number.isFinite(busDistance) && (
                              <p className="text-sm">
                                The bus is about <strong>{formatDistance(busDistance)}</strong> from you (estimated).
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="trk-section-title">
                      <span>Stops</span>
                      <span className="text-xs text-muted">{est.stops.length} stops</span>
                    </div>
                    <StopTimeline estimate={est} fromId={fromStop?.id} toId={toStop?.id} />

                    {missingCoords && routePoints.length > 0 && (
                      <p className="text-xs text-muted">Some stops on this route have no map location yet, so the map line may be incomplete.</p>
                    )}

                    <TrackingDisclaimer />

                    <div className="row-between text-xs text-muted">
                      <UpdatedAgo at={now} />
                      <span>Refreshes every {Math.round(TRACKING_REFRESH_MS / 1000)} s</span>
                    </div>
                  </div>
                </div>

                <div className="trk-actions">
                  <Button variant="accent" icon={<AlarmClock size={18} />} to={`/bus/${id}/alarm?${qs}`}>
                    Set Alarm
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Phone size={17} />}
                    href={bus.contactNumber ? `tel:${bus.contactNumber}` : undefined}
                    disabled={!bus.contactNumber}
                    title={bus.contactNumber ? `Call ${formatContact(bus.contactNumber)} (${to12h(bus.contactStart)} – ${to12h(bus.contactEnd)})` : 'No booking number'}
                  >
                    Call
                  </Button>
                  <Button variant="soft" icon={<BusFront size={17} />} to={`/bus/${id}?${qs}`}>
                    Details
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
