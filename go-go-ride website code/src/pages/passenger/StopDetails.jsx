import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BusFront, ChevronRight, Clock, Heart, MapPin, MapPinOff, Navigation, Search, Share2 } from 'lucide-react'
import { locationService, profileService, stopService } from '../../services'
import { formatDistance, haversineKm, stopPoint } from '../../services/locationService'
import { useAsync } from '../../hooks/useAsync'
import { useNow } from '../../hooks/useInterval'
import { useAuth } from '../../context/AuthContext'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  RouteBadge,
  Skeleton,
  useToast,
} from '../../components/ui'
import { MapView, StopMarker, UserMarker } from '../../components/map/MapView'
import { directionsUrl, inMinutes } from '../../components/tracking/trackingUtils'
import { busBadge, formatCurrency, label, to12h } from '../../utils/format'
import '../../components/tracking/tracking.css'

const minutesOf = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function HeroSkeleton() {
  return (
    <div className="card trk-stop-hero">
      <div className="trk-stop-hero-top">
        <Skeleton width={56} height={56} radius={16} />
        <div className="grow stack" style={{ '--gap': '8px' }}>
          <Skeleton height={22} width="70%" />
          <Skeleton height={14} width="45%" />
        </div>
      </div>
      <Skeleton height={200} radius={0} />
      <div className="trk-stop-actions">
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    </div>
  )
}

export default function StopDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { isAuthenticated } = useAuth()
  const now = useNow(30000)
  const [filter, setFilter] = useState('upcoming')
  const [favBusy, setFavBusy] = useState(false)

  const q = useAsync(() => stopService.get(id), [id])
  const fav = useAsync(() => (isAuthenticated ? profileService.favorites() : Promise.resolve(null)), [isAuthenticated])
  const isFav = Boolean(fav.data?.raw?.some((f) => f.itemType === 'STOP' && f.itemId === id))

  const stop = q.data
  const point = stopPoint(stop)
  const lastKnown = useMemo(() => locationService.lastKnown(), [])
  const distance = point && lastKnown ? haversineKm(lastKnown, point) : null

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const buses = useMemo(() => {
    const list = (stop?.buses || []).map((b) => {
      const t = b.departureTime || b.arrivalTime
      const mins = minutesOf(t)
      return { ...b, time: t, minsAway: mins != null ? mins - nowMin : null }
    })
    return list.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }, [stop, nowMin])
  const upcoming = buses.filter((b) => b.minsAway == null || b.minsAway >= 0)
  const shown = filter === 'upcoming' ? upcoming : buses
  const nextBusId = upcoming[0]?.id

  const toggleFavorite = async () => {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(location.pathname)}`)
      return
    }
    setFavBusy(true)
    try {
      if (isFav) {
        await profileService.removeFavorite('STOP', id)
        fav.setData((d) => (d ? { ...d, raw: d.raw.filter((f) => !(f.itemType === 'STOP' && f.itemId === id)) } : d))
        toast.success('Removed from favourites')
      } else {
        await profileService.addFavorite('STOP', id)
        fav.setData((d) => ({ ...(d || {}), raw: [...(d?.raw || []), { id: `tmp-${id}`, itemType: 'STOP', itemId: id }] }))
        toast.success('Stop saved to favourites')
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setFavBusy(false)
    }
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${stop.name} bus stop`, url })
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch {
      /* user cancelled */
    }
  }

  const header = (
    <PageHeader
      title="Bus Stop"
      actions={
        stop ? (
          <IconButton
            label={isFav ? 'Remove from favourites' : 'Save to favourites'}
            onClick={toggleFavorite}
            disabled={favBusy || (isAuthenticated && fav.loading)}
            className={`trk-fav-btn ${isFav ? 'active' : ''}`}
            aria-pressed={isFav}
          >
            <Heart size={21} />
          </IconButton>
        ) : null
      }
    />
  )

  if (q.error && !stop) {
    return (
      <div className="page" style={{ paddingTop: 0 }}>
        {header}
        <ErrorState error={q.error} onRetry={q.reload} title={q.error.status === 404 ? 'Bus stop not found' : undefined} />
        <div className="center">
          <Button variant="outline" to="/stops" icon={<MapPin size={17} />}>
            Find stops near you
          </Button>
        </div>
      </div>
    )
  }

  const searchQs = stop ? new URLSearchParams({ fromId: stop.id, from: stop.name }) : null

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      {header}
      <div className="trk-stop-layout stack" style={{ '--gap': '16px' }}>
        {!stop ? (
          <HeroSkeleton />
        ) : (
          <div className="card trk-stop-hero">
            <div className="trk-stop-hero-top">
              <span className="icon-tile lg">
                <MapPin size={26} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <h1 className="trk-stop-name">{stop.name}</h1>
                <p className="text-sm text-muted">{[...new Set([stop.area, stop.city].filter(Boolean))].join(', ') || 'Kolkata'}</p>
                <div className="row wrap" style={{ '--gap': '6px', marginTop: 8 }}>
                  <Badge tone="primary" icon={<BusFront size={12} />}>
                    {buses.length} {buses.length === 1 ? 'bus' : 'buses'}
                  </Badge>
                  {distance != null && Number.isFinite(distance) && (
                    <Badge tone="info" icon={<Navigation size={12} />}>
                      {formatDistance(distance)} from your last location
                    </Badge>
                  )}
                  {stop.status === 'INACTIVE' && <Badge tone="danger">Inactive stop</Badge>}
                </div>
              </div>
              <IconButton label="Share this stop" onClick={share}>
                <Share2 size={19} />
              </IconButton>
            </div>

            {point ? (
              <MapView center={point} zoom={16} height={210} scrollWheelZoom={false}>
                <StopMarker point={point} kind="board" name={stop.name} />
                {lastKnown && distance != null && distance < 5 && <UserMarker point={lastKnown} />}
              </MapView>
            ) : (
              <div className="trk-map-empty" style={{ position: 'relative', height: 140 }}>
                <MapPinOff size={24} />
                <span className="text-sm">No map location for this stop yet</span>
              </div>
            )}

            <div className="trk-stop-actions">
              <Button
                variant="outline"
                icon={<Navigation size={17} />}
                href={point ? directionsUrl(point) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                disabled={!point}
              >
                Directions
              </Button>
              <Button icon={<Search size={17} />} to={`/search?${searchQs}`}>
                Buses from here
              </Button>
            </div>
          </div>
        )}

        <Card
          pad={false}
          className="trk-buses-card"
          title="Buses at this stop"
          subtitle={stop ? 'Scheduled times at this stop. Check a bus for its running days.' : undefined}
          action={
            stop && buses.length > 0 ? (
              <div className="segmented" role="group" aria-label="Filter buses">
                <button type="button" className={filter === 'upcoming' ? 'active' : ''} onClick={() => setFilter('upcoming')} aria-pressed={filter === 'upcoming'}>
                  Upcoming
                </button>
                <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>
                  All day
                </button>
              </div>
            ) : null
          }
        >
          {!stop ? (
            <div className="stack" style={{ padding: 16 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={64} radius={12} />
              ))}
            </div>
          ) : !buses.length ? (
            <EmptyState
              compact
              icon={<BusFront size={24} />}
              title="No buses stop here yet"
              message="No approved bus timetable includes this stop. Try a nearby stop instead."
              action={
                <Button size="sm" variant="outline" to="/stops">
                  Nearby stops
                </Button>
              }
            />
          ) : !shown.length ? (
            <EmptyState
              compact
              icon={<Clock size={24} />}
              title="No more buses today"
              message="All scheduled buses have already left this stop today."
              action={
                <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
                  Show all day
                </Button>
              }
            />
          ) : (
            <div>
              {shown.map((b) => {
                const past = b.minsAway != null && b.minsAway < 0
                const sameTime = b.arrivalTime === b.departureTime
                return (
                  <Link key={`${b.id}-${b.time}`} to={`/bus/${b.id}?from=${id}`} className={`trk-busrow ${past ? 'past' : ''}`}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row" style={{ '--gap': '8px' }}>
                        <RouteBadge size="sm">{busBadge(b)}</RouteBadge>
                        <span className="fw-600 truncate">{b.busName || b.busNumber}</span>
                      </div>
                      <div className="text-xs text-muted truncate" style={{ marginTop: 4 }}>
                        {b.route?.name || b.busNumber}
                      </div>
                      <div className="trk-busrow-meta">
                        <Badge tone="info">
                          {label('busType', b.type)}
                        </Badge>
                        <Badge tone="neutral">{label('busCategory', b.category)}</Badge>
                        <Badge tone="neutral">{formatCurrency(b.fare)}</Badge>
                        {b.id === nextBusId && b.minsAway != null && (
                          <Badge tone="accent">Next · {inMinutes(b.minsAway)}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="trk-busrow-time">
                      <div className="t tabular">{to12h(b.time)}</div>
                      <div className="text-xs text-muted">{sameTime ? (past ? 'Departed' : 'Departs') : `Arrives ${to12h(b.arrivalTime)}`}</div>
                    </div>
                    <ChevronRight size={18} className="text-muted hide-mobile" />
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
