import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BusFront,
  Footprints,
  Globe,
  LocateFixed,
  Lock,
  MapPin,
  MapPinOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react'
import { locationService, stopService } from '../../services'
import { formatDistance, haversineKm, stopPoint } from '../../services/locationService'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, Pagination, Skeleton } from '../../components/ui'
import { MapView, StopMarker, UserMarker } from '../../components/map/MapView'
import { StopRow } from '../../components/tracking/StopRow'
import { directionsUrl } from '../../components/tracking/trackingUtils'
import '../../components/tracking/tracking.css'

const RADII = [1, 3, 5, 10]

function SearchBox({ value, onChange, placeholder = 'Search any stop by name or area' }) {
  return (
    <div className="trk-searchbox">
      <span className="trk-searchbox-icon">
        <Search size={18} />
      </span>
      <input
        className="input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search bus stops"
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="icon-btn trk-searchbox-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

function ListSkeleton({ count = 5 }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="trk-stoprow">
          <Skeleton width={44} height={44} radius={12} />
          <div className="grow stack" style={{ '--gap': '6px' }}>
            <Skeleton height={14} width={`${55 + ((i * 13) % 30)}%`} />
            <Skeleton height={11} width="40%" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** The stop directory (search / browse), with distances when we know where the user is. */
function BrowseList({ browse, pos, title }) {
  const searching = Boolean(browse.search.trim())
  const rows = useMemo(() => {
    if (!pos) return browse.rows
    const withDist = browse.rows.map((s) => ({ ...s, distanceKm: haversineKm(pos, stopPoint(s)) }))
    return searching ? [...withDist].sort((a, b) => a.distanceKm - b.distanceKm) : withDist
  }, [browse.rows, pos, searching])

  return (
    <Card pad={false} title={title || (searching ? 'Search results' : 'All bus stops')} subtitle={browse.meta?.total != null ? `${browse.meta.total} stops` : undefined}>
      {browse.loading && !browse.rows.length ? (
        <ListSkeleton />
      ) : browse.error && !browse.rows.length ? (
        <ErrorState error={browse.error} onRetry={browse.reload} compact />
      ) : !rows.length ? (
        <EmptyState
          compact
          icon={<Search size={24} />}
          title={searching ? `No stops match “${browse.search.trim()}”` : 'No bus stops yet'}
          message={searching ? 'Check the spelling, or try the area name instead (for example “Howrah”).' : undefined}
        />
      ) : (
        <div style={{ opacity: browse.loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          {rows.map((s) => (
            <StopRow key={s.id} stop={s} distanceKm={Number.isFinite(s.distanceKm) ? s.distanceKm : undefined} />
          ))}
        </div>
      )}
      {browse.meta?.totalPages > 1 && (
        <div style={{ padding: '0 14px 12px' }}>
          <Pagination meta={browse.meta} onChange={browse.setPage} noun="stops" />
        </div>
      )}
    </Card>
  )
}

function StopsMap({ pos, stops, height }) {
  const located = stops.filter((s) => stopPoint(s))
  const fit = useMemo(
    () => [pos && [pos.lat, pos.lng], ...located.map((s) => [s.latitude, s.longitude])].filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos?.lat, pos?.lng, located.map((s) => s.id).join(',')],
  )
  return (
    <MapView center={pos || undefined} zoom={14} height={height} fit={fit}>
      {pos && <UserMarker point={pos} accuracy={pos.accuracy} />}
      {located.map((s) => {
        const point = stopPoint(s)
        const dist = Number.isFinite(s.distanceKm) ? s.distanceKm : pos ? haversineKm(pos, point) : null
        return (
          <StopMarker key={s.id} point={point} name={s.name}>
            <div className="trk-popup">
              <span className="trk-popup-title">{s.name}</span>
              <span className="text-xs text-muted">
                {[s.area, dist != null && Number.isFinite(dist) ? `${formatDistance(dist)} away` : null].filter(Boolean).join(' · ')}
              </span>
              <span className="text-xs">
                {s.busesAvailable ?? 0} buses · {s.routes ?? 0} routes
              </span>
              <div className="trk-popup-links">
                <Link to={`/stops/${s.id}`}>View buses</Link>
                <a href={directionsUrl(point)} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              </div>
            </div>
          </StopMarker>
        )
      })}
    </MapView>
  )
}

export default function NearbyStops() {
  const [perm, setPerm] = useState('checking') // checking | prompt | unsupported | denied | granted
  const [pos, setPos] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState(null)
  const [searchMode, setSearchMode] = useState(false)
  const [radius, setRadius] = useState(3)
  const browse = usePagedQuery(stopService.list, { limit: 12, initialFilters: { status: 'ACTIVE' } })

  const locate = useCallback(async () => {
    setLocating(true)
    setLocError(null)
    try {
      const p = await locationService.getCurrentPosition()
      setPos(p)
      setPerm('granted')
      setSearchMode(false)
    } catch (err) {
      const state = await locationService.permissionState()
      if (state === 'denied' || /denied/i.test(err?.message || '')) setPerm('denied')
      else setLocError(err?.message || 'Could not get your location.')
    } finally {
      setLocating(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    locationService.permissionState().then((state) => {
      if (!alive) return
      setPerm(state)
      if (state === 'granted') locate()
    })
    return () => {
      alive = false
    }
  }, [locate])

  const nearby = useAsync(
    () => (pos ? stopService.nearby(pos.lat, pos.lng, radius, 50) : Promise.resolve(null)),
    [pos?.lat, pos?.lng, radius],
  )

  const searching = Boolean(browse.search.trim())

  let view = 'explain'
  if (pos) view = 'located'
  else if (perm === 'checking' || (locating && !searchMode && perm !== 'denied')) view = 'checking'
  else if (searchMode) view = 'search'
  else if (perm === 'denied') view = 'denied'
  else if (locError) view = 'error'

  const header = (
    <PageHeader
      title="Nearby Bus Stops"
      subtitle={view === 'located' ? `Within ${radius} km of you` : 'Find a stop to catch your bus'}
      actions={
        view === 'located' ? (
          <IconButton label="Refresh my location" onClick={locate} disabled={locating}>
            <RefreshCw size={19} className={locating ? 'trk-spin' : undefined} />
          </IconButton>
        ) : null
      }
    />
  )

  if (view === 'checking') {
    return (
      <div className="page" style={{ paddingTop: 0 }}>
        {header}
        <div className="card trk-explainer" role="status">
          <div className="trk-locate-art">
            <span className="trk-locate-pin">
              <LocateFixed size={30} className="trk-spin-slow" />
            </span>
          </div>
          <h3>Finding your location…</h3>
          <p className="text-sm text-muted">This usually takes a few seconds. Make sure GPS is turned on.</p>
          <Button variant="ghost" onClick={() => setSearchMode(true)} icon={<Search size={17} />}>
            Search stops instead
          </Button>
        </div>
      </div>
    )
  }

  if (view === 'explain') {
    const unsupported = perm === 'unsupported'
    return (
      <div className="page" style={{ paddingTop: 0 }}>
        {header}
        <div className="card trk-explainer">
          <div className="trk-locate-art">
            <span className="trk-locate-pin">
              <MapPin size={30} />
            </span>
          </div>
          <h2>Find bus stops near you</h2>
          <p className="text-2">Allow location access to see the closest bus stops, how far away they are and which buses stop there.</p>
          <ul className="trk-reasons">
            <li>
              <span className="icon-tile">
                <Footprints size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Closest stops first</div>
                <div>Walking distance to every stop around you, nearest first.</div>
              </div>
            </li>
            <li>
              <span className="icon-tile accent">
                <BusFront size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Buses at each stop</div>
                <div>See the buses and routes that serve each stop, with directions.</div>
              </div>
            </li>
            <li>
              <span className="icon-tile success">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Private</div>
                <div>Your location is only used to find stops near you. It isn&apos;t saved to your GO-GO Ride account.</div>
              </div>
            </li>
          </ul>
          {unsupported && (
            <div className="alert alert-warning" style={{ width: '100%', textAlign: 'left' }}>
              <MapPinOff size={16} />
              <span>Location isn&apos;t available on this device or browser. You can still search stops by name.</span>
            </div>
          )}
          <div className="trk-explainer-actions">
            <Button size="lg" block icon={<LocateFixed size={19} />} onClick={locate} loading={locating} disabled={unsupported}>
              Allow location
            </Button>
            <Button variant="outline" block icon={<Search size={18} />} onClick={() => setSearchMode(true)}>
              Search stops instead
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'denied' || view === 'error' || view === 'search') {
    return (
      <div className="page stack" style={{ paddingTop: 0, '--gap': '16px' }}>
        {header}
        {view === 'denied' && (
          <div className="card trk-explainer">
            <div className="trk-locate-art denied">
              <span className="trk-locate-pin">
                <MapPinOff size={30} />
              </span>
            </div>
            <h3>Location access is turned off</h3>
            <p className="text-sm text-2">GO-GO Ride can&apos;t see where you are, so we can&apos;t list the stops around you. You can turn it back on at any time:</p>
            <div className="trk-steps-box">
              <h4>
                <Globe size={16} className="text-primary" /> In your browser
              </h4>
              <ol className="trk-steps">
                <li>
                  Tap the <Lock size={13} style={{ verticalAlign: '-2px' }} /> lock or site-settings icon next to the address bar.
                </li>
                <li>Open Permissions (or Site settings) and set Location to Allow.</li>
                <li>Come back here and tap “Try again”.</li>
              </ol>
            </div>
            <div className="trk-steps-box">
              <h4>
                <Smartphone size={16} className="text-primary" /> In the GO-GO Ride Android app
              </h4>
              <ol className="trk-steps">
                <li>Open your phone&apos;s Settings → Apps → GO-GO Ride.</li>
                <li>Tap Permissions → Location and choose “Allow only while using the app”.</li>
                <li>Make sure Location (GPS) is switched on in quick settings.</li>
              </ol>
            </div>
            <Button block icon={<RefreshCw size={17} />} onClick={locate} loading={locating}>
              Try again
            </Button>
          </div>
        )}

        {view === 'error' && (
          <div className="alert alert-danger" role="alert">
            <MapPinOff size={18} />
            <div className="grow">
              <div className="fw-600">We couldn&apos;t find your location</div>
              <div>{locError}</div>
              <div className="row wrap" style={{ marginTop: 10, '--gap': '8px' }}>
                <Button size="sm" icon={<RefreshCw size={15} />} onClick={locate} loading={locating}>
                  Try again
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === 'search' && perm !== 'denied' && perm !== 'unsupported' && (
          <div className="soft-panel row-between wrap">
            <div className="row" style={{ '--gap': '10px' }}>
              <LocateFixed size={20} className="text-primary" />
              <span className="text-sm text-2">Use your location to see the stops closest to you.</span>
            </div>
            <Button size="sm" onClick={locate} loading={locating} icon={<LocateFixed size={15} />}>
              Use my location
            </Button>
          </div>
        )}

        <SearchBox value={browse.search} onChange={browse.setSearch} />
        <BrowseList browse={browse} pos={null} />
      </div>
    )
  }

  // ---- located --------------------------------------------------------------
  const stops = nearby.data || []
  const mapStops = searching ? browse.rows : stops
  const nextRadius = RADII.find((r) => r > radius)

  return (
    <div className="page stack" style={{ paddingTop: 0, '--gap': '14px' }}>
      {header}
      <SearchBox value={browse.search} onChange={browse.setSearch} />

      {!searching && (
        <div className="row-between wrap" style={{ '--gap': '10px' }}>
          <div>
            <div className="section-title">Bus stops near you</div>
            <div className="section-sub">
              {nearby.loading && !nearby.data
                ? 'Looking around you…'
                : `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} within ${radius} km`}
              {pos.accuracy ? ` · location accurate to ~${Math.round(pos.accuracy)} m` : ''}
            </div>
          </div>
          <div className="trk-radius" role="group" aria-label="Search radius">
            {RADII.map((r) => (
              <button key={r} type="button" className={`chip ${radius === r ? 'active' : ''}`} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                {r} km
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="trk-nearby-grid">
        <div className="trk-nearby-map">
          <StopsMap pos={pos} stops={mapStops} height="clamp(240px, 42vh, 460px)" />
        </div>

        {searching ? (
          <BrowseList browse={browse} pos={pos} />
        ) : (
          <Card pad={false}>
            {nearby.loading && !nearby.data ? (
              <ListSkeleton />
            ) : nearby.error && !nearby.data ? (
              <ErrorState error={nearby.error} onRetry={nearby.reload} compact />
            ) : !stops.length ? (
              <EmptyState
                compact
                icon={<MapPin size={24} />}
                title={`No bus stops within ${radius} km`}
                message={nextRadius ? 'Try a larger area, or search for a stop by name above.' : 'Search for a stop by name above instead.'}
                action={
                  nextRadius ? (
                    <Button size="sm" onClick={() => setRadius(nextRadius)}>
                      Search within {nextRadius} km
                    </Button>
                  ) : null
                }
              />
            ) : (
              <div style={{ opacity: nearby.loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
                {stops.map((s) => (
                  <StopRow key={s.id} stop={s} />
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
