import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMap } from 'react-leaflet'
import {
  Copy,
  Crosshair,
  Footprints,
  Globe,
  LocateFixed,
  Lock,
  MapPin,
  MapPinOff,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import { locationService, stopService } from '../../services'
import { haversineKm, stopPoint } from '../../services/locationService'
import { useAsync } from '../../hooks/useAsync'
import { useNow } from '../../hooks/useInterval'
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '../../components/ui'
import { FollowPoint, MapView, StopMarker, UserMarker } from '../../components/map/MapView'
import { StopRow } from '../../components/tracking/StopRow'
import { secondsAgo } from '../../components/tracking/trackingUtils'
import { formatTime } from '../../utils/format'
import '../../components/tracking/tracking.css'
import './passenger.css'
import './extras.css'

// Ask the server for nearby stops again only after moving this far (km);
// GPS fixes arrive every few seconds and would otherwise hammer it.
const STOPS_REFRESH_KM = 0.2

const mapLink = (pos) => `https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older Android WebViews have no async clipboard; fall back to a hidden textarea.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** Stop following the user as soon as they pan the map themselves. */
function DragWatcher({ onDrag }) {
  const map = useMap()
  useEffect(() => {
    map.on('dragstart', onDrag)
    return () => {
      map.off('dragstart', onDrag)
    }
  }, [map, onDrag])
  return null
}

function LiveMap({ pos, stops }) {
  const [follow, setFollow] = useState(true)
  const stopFollowing = useCallback(() => setFollow(false), [])
  return (
    <div className="px-x-map">
      {/* MapView reads `center` once; FollowPoint keeps it on the user afterwards. */}
      <MapView center={pos} zoom={16} height="clamp(260px, 45vh, 460px)">
        <UserMarker point={pos} accuracy={pos.accuracy} />
        {stops.map((s) => (
          <StopMarker key={s.id} point={stopPoint(s)} name={s.name}>
            <div className="trk-popup">
              <span className="trk-popup-title">{s.name}</span>
              {s.area && <span className="text-xs text-muted">{s.area}</span>}
              <div className="trk-popup-links">
                <Link to={`/stops/${s.id}`}>View buses</Link>
              </div>
            </div>
          </StopMarker>
        ))}
        {follow && <FollowPoint point={pos} />}
        <DragWatcher onDrag={stopFollowing} />
      </MapView>
      {!follow && (
        <Button size="sm" variant="outline" className="px-x-recenter" icon={<Crosshair size={16} />} onClick={() => setFollow(true)}>
          Centre on me
        </Button>
      )}
    </div>
  )
}

/** Own clock so only this line re-renders, not the map. */
function UpdatedAgo({ at }) {
  const now = useNow(5000)
  return <span>{secondsAgo(at, now)}</span>
}

function ListSkeleton({ count = 3 }) {
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

export default function LiveLocation() {
  const toast = useToast()
  const [perm, setPerm] = useState('checking') // checking | prompt | unsupported | denied | granted
  const [tracking, setTracking] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pos, setPos] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [locError, setLocError] = useState(null)
  const [anchor, setAnchor] = useState(null) // where nearby stops were last fetched

  useEffect(() => {
    let alive = true
    locationService.permissionState().then((state) => {
      if (!alive) return
      setPerm(state)
      if (state === 'granted') setTracking(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!tracking) return undefined
    return locationService.watch(
      (p) => {
        setPos(p)
        setUpdatedAt(new Date())
        setPerm('granted')
        setLocError(null)
        setAnchor((a) => (a && haversineKm(a, p) <= STOPS_REFRESH_KM ? a : { lat: p.lat, lng: p.lng }))
      },
      (err) => {
        if (err?.code === 1) {
          setPerm('denied')
          setTracking(false)
        } else {
          setLocError(err?.code === 3 ? 'Finding your location is taking longer than usual.' : 'Your location could not be found. Check that Location (GPS) is turned on.')
        }
      },
    )
  }, [tracking, attempt])

  const start = useCallback(() => {
    setLocError(null)
    setTracking(true)
    setAttempt((n) => n + 1)
  }, [])

  const nearby = useAsync(() => (anchor ? stopService.nearby(anchor.lat, anchor.lng, 3, 5) : Promise.resolve(null)), [anchor?.lat, anchor?.lng])

  // Distances follow the live position even between fetches.
  const stops = useMemo(() => {
    if (!pos || !nearby.data) return []
    return nearby.data
      .map((s) => {
        const point = stopPoint(s)
        return { ...s, liveKm: point ? haversineKm(pos, point) : s.distanceKm }
      })
      .sort((a, b) => (a.liveKm ?? Infinity) - (b.liveKm ?? Infinity))
  }, [nearby.data, pos])

  const copyLink = async () => {
    if (await copyText(mapLink(pos))) toast.success('Location link copied. Paste it in any chat.')
    else toast.error('Could not copy the link on this phone.')
  }

  let view = 'live'
  if (!pos) {
    if (perm === 'checking') view = 'finding'
    else if (perm === 'denied') view = 'denied'
    else if (tracking) view = 'finding'
    else view = 'explain'
  }

  const header = <PageHeader title="Live Location Track" subtitle={view === 'live' ? 'Updates as you move' : 'See where you are on the map'} />

  if (view === 'finding') {
    return (
      <div className="px-page px-narrow">
        {header}
        <div className="card trk-explainer" role="status">
          <div className="trk-locate-art">
            <span className="trk-locate-pin">
              <LocateFixed size={30} className="trk-spin-slow" />
            </span>
          </div>
          <h3>Finding your location…</h3>
          <p className="text-sm text-muted">This usually takes a few seconds. Make sure Location (GPS) is turned on.</p>
          {locError && (
            <div className="alert alert-warning" style={{ width: '100%', textAlign: 'left' }}>
              <MapPinOff size={16} />
              <div className="grow">
                <div>{locError}</div>
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" icon={<RefreshCw size={15} />} onClick={start}>
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'explain') {
    const unsupported = perm === 'unsupported'
    return (
      <div className="px-page px-narrow">
        {header}
        <div className="card trk-explainer">
          <div className="trk-locate-art">
            <span className="trk-locate-pin">
              <MapPin size={30} />
            </span>
          </div>
          <h2>See where you are, live</h2>
          <p className="text-2">Allow location access to follow yourself on the map, share where you are and see the bus stops around you.</p>
          <ul className="trk-reasons">
            <li>
              <span className="icon-tile">
                <Footprints size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Moves with you</div>
                <div>Your dot on the map updates as you walk or ride.</div>
              </div>
            </li>
            <li>
              <span className="icon-tile accent">
                <MessageCircle size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Share in one tap</div>
                <div>Send your location to family on WhatsApp, or copy a map link.</div>
              </div>
            </li>
            <li>
              <span className="icon-tile success">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="fw-600 text-primary">Private</div>
                <div>Your location is only used on this screen. It isn&apos;t saved to your GO-GO Ride account.</div>
              </div>
            </li>
          </ul>
          {unsupported && (
            <div className="alert alert-warning" style={{ width: '100%', textAlign: 'left' }}>
              <MapPinOff size={16} />
              <span>Location isn&apos;t available on this device or browser.</span>
            </div>
          )}
          <div className="trk-explainer-actions">
            <Button size="lg" block icon={<LocateFixed size={19} />} onClick={start} disabled={unsupported}>
              Allow location
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'denied') {
    return (
      <div className="px-page px-narrow">
        {header}
        <div className="card trk-explainer">
          <div className="trk-locate-art denied">
            <span className="trk-locate-pin">
              <MapPinOff size={30} />
            </span>
          </div>
          <h3>Location access is turned off</h3>
          <p className="text-sm text-2">GO-GO Ride can&apos;t see where you are, so the map can&apos;t follow you. You can turn it back on at any time:</p>
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
          <Button block icon={<RefreshCw size={17} />} onClick={start}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  // ---- live ------------------------------------------------------------------
  const waText = `My location: ${mapLink(pos)} — shared from GO-GO Ride`
  const stopsLoading = nearby.data == null && !nearby.error

  return (
    <div className="px-page px-narrow">
      {header}
      <div className="stack" style={{ '--gap': '14px' }}>
        {!tracking ? (
          <div className="alert alert-warning" role="alert">
            <TriangleAlert size={18} />
            <div className="grow">
              <div className="fw-600">Location was turned off</div>
              <div>This is the last place we saw you.</div>
              <div style={{ marginTop: 10 }}>
                <Button size="sm" icon={<RefreshCw size={15} />} onClick={start}>
                  Turn on again
                </Button>
              </div>
            </div>
          </div>
        ) : (
          locError && (
            <div className="alert alert-warning" role="status">
              <TriangleAlert size={18} />
              <span>{locError} Showing the last place we saw you.</span>
            </div>
          )
        )}

        <LiveMap pos={pos} stops={stops} />

        <Card>
          <div className="px-x-live-head">
            <span className={`px-x-live ${tracking ? '' : 'off'}`}>
              <span className={`dot ${tracking ? 'dot-pulse' : ''}`} /> {tracking ? 'Live' : 'Paused'}
            </span>
            <span className="text-xs text-muted">
              Updated <UpdatedAgo at={updatedAt} />
            </span>
          </div>
          <dl className="px-x-facts">
            <div className="px-x-fact wide">
              <dt>Latitude, longitude</dt>
              <dd className="tabular">
                {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
              </dd>
            </div>
            <div className="px-x-fact">
              <dt>Accuracy</dt>
              <dd>{pos.accuracy ? `About ${Math.round(pos.accuracy)} m` : 'Unknown'}</dd>
            </div>
            <div className="px-x-fact">
              <dt>Last updated</dt>
              <dd>{formatTime(updatedAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Share my location" subtitle="Sends where you are right now. Share again after you move.">
          <div className="px-x-two">
            <Button href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" variant="success" icon={<MessageCircle size={18} />}>
              WhatsApp
            </Button>
            <Button variant="outline" icon={<Copy size={18} />} onClick={copyLink}>
              Copy link
            </Button>
          </div>
        </Card>

        <Card pad={false} title="Bus stops near you" subtitle="Within 3 km, nearest first">
          {stopsLoading ? (
            <ListSkeleton />
          ) : nearby.error && !nearby.data ? (
            <ErrorState error={nearby.error} onRetry={nearby.reload} compact />
          ) : !stops.length ? (
            <EmptyState
              compact
              icon={<MapPin size={24} />}
              title="No bus stops within 3 km"
              message="Search for a stop by name instead."
              action={
                <Button to="/stops" size="sm" variant="outline">
                  Find bus stops
                </Button>
              }
            />
          ) : (
            <div style={{ opacity: nearby.loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
              {stops.map((s) => (
                <StopRow key={s.id} stop={s} distanceKm={Number.isFinite(s.liveKm) ? s.liveKm : undefined} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
