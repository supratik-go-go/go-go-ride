import { Link, useParams } from 'react-router-dom'
import { ArrowRight, BusFront, ChevronRight, MapPin, Route as RouteIcon, Ruler, Search, Star } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui'
import { FavoriteButton, RouteTimeline, ratingText } from '../../components/passenger'
import { busService, routeService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { formatCurrency, label, todayISO } from '../../utils/format'
import './passenger.css'

/**
 * GET /routes/:id returns the route with stops and buses. If it fails on the
 * server side, rebuild the same view from GET /routes + GET /buses?routeId=.
 */
async function loadRoute(id) {
  try {
    return await routeService.get(id)
  } catch (err) {
    if (err?.status === 404 || err?.code === 'NETWORK' || err?.name === 'AbortError') throw err
    try {
      const [routes, buses] = await Promise.all([routeService.list({ limit: 100 }), busService.list({ routeId: id, limit: 50 })])
      const route = routes.data.find((r) => r.id === id)
      if (!route) throw err
      return { ...route, buses: buses.data }
    } catch {
      throw err
    }
  }
}

export default function RouteDetails() {
  const { id } = useParams()
  const q = useAsync(() => loadRoute(id), [id])
  const route = q.data

  if (q.loading && !route) {
    return (
      <div className="px-page px-wide" aria-busy="true">
        <PageHeader title="Route Details" />
        <div className="stack" style={{ '--gap': '16px' }}>
          <Skeleton height={170} radius={20} />
          <div className="px-route-layout">
            <Skeleton height={360} radius={14} />
            <Skeleton height={240} radius={14} />
          </div>
        </div>
      </div>
    )
  }
  if (q.error && !route) {
    return (
      <div className="px-page px-wide">
        <PageHeader title="Route Details" />
        <ErrorState error={q.error} title={q.error.status === 404 ? 'Route not found' : undefined} onRetry={q.error.status === 404 ? undefined : () => q.reload()} />
        <div className="center">
          <Button to="/routes" variant="outline">
            All routes
          </Button>
        </div>
      </div>
    )
  }

  const stops = [...(route.stops ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  const first = stops[0]?.stop || route.fromStop
  const last = stops[stops.length - 1]?.stop || route.toStop
  const buses = route.buses ?? []
  const busCount = buses.length || route.totalBuses || 0
  const searchUrl =
    first && last
      ? `/search?${new URLSearchParams({ searchType: 'ROUTE', from: first.name, to: last.name, fromId: first.id, toId: last.id, date: todayISO() })}`
      : null

  const items = stops.map((s, i) => ({
    key: s.id || `${i}`,
    name: s.stop?.name ?? 'Stop',
    caption: i === 0 ? 'Start Point' : i === stops.length - 1 ? 'End Point' : null,
    meta: s.distanceFromStartKm != null ? `${Number(s.distanceFromStartKm).toFixed(1)} km` : null,
    to: s.stop?.id ? `/stops/${s.stop.id}` : undefined,
  }))

  return (
    <div className="px-page px-wide">
      <PageHeader title="Route Details" actions={<FavoriteButton itemType="ROUTE" itemId={route.id} />} />

      <section className="px-route-hero">
        <div className="px-route-hero-top">
          <span className="px-route-hero-no">{route.routeNumber}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{route.name}</h1>
            {first && last && (
              <p className="px-route-hero-ends">
                {first.name} <ArrowRight size={15} /> {last.name}
              </p>
            )}
          </div>
        </div>
        <div className="px-route-hero-stats">
          <span>
            <Ruler size={16} /> {route.distanceKm != null ? `${Number(route.distanceKm).toFixed(1)} km` : '—'}
          </span>
          <span>
            <MapPin size={16} /> {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
          </span>
          <span>
            <BusFront size={16} /> {busCount} {busCount === 1 ? 'bus' : 'buses'}
          </span>
        </div>
        {searchUrl && (
          <Button to={searchUrl} variant="accent" icon={<Search size={18} />} className="px-route-hero-btn">
            Search buses on this route
          </Button>
        )}
      </section>

      <div className="px-route-layout">
        <section className="card px-card-pad" aria-labelledby="px-route-stops">
          <div className="px-section-head" style={{ marginBottom: 6 }}>
            <h2 id="px-route-stops" className="px-section-title">
              Stops on this route
            </h2>
            <span className="text-xs text-muted">Tap a stop for buses</span>
          </div>
          {items.length ? (
            <RouteTimeline items={items} label={`Stops on route ${route.routeNumber}`} />
          ) : (
            <EmptyState compact icon={<MapPin size={24} />} title="No stops listed" message="Stops for this route haven't been published yet." />
          )}
        </section>

        <section className="px-section" aria-labelledby="px-route-buses">
          <div className="px-section-head">
            <h2 id="px-route-buses" className="px-section-title">
              Buses on this route
            </h2>
            <span className="text-xs text-muted">{buses.length} found</span>
          </div>
          {buses.length === 0 ? (
            <div className="card">
              <EmptyState compact icon={<BusFront size={24} />} title="No buses yet" message="No approved bus is linked to this route right now." />
            </div>
          ) : (
            <div className="stack" style={{ '--gap': '10px' }}>
              {buses.map((b) => (
                <Link key={b.id} to={`/bus/${b.id}`} className="card card-hover px-route-bus">
                  <span className="icon-tile">
                    <BusFront size={22} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="fw-600 truncate">{b.busName || b.busNumber}</div>
                    <div className="text-xs text-muted truncate">
                      {b.busNumber} · {label('busType', b.type)} · {label('busCategory', b.category)}
                    </div>
                  </div>
                  <div className="px-route-bus-side">
                    <span className="fw-700 text-primary">{formatCurrency(b.fare)}</span>
                    <span className="text-xs text-muted">
                      <Star size={12} color="#f59e0b" fill="#f59e0b" style={{ verticalAlign: -1 }} /> {ratingText(b.ratingAvg, b.ratingCount ?? (b.ratingAvg ? 1 : 0))}
                    </span>
                  </div>
                  <ChevronRight size={18} className="text-muted" />
                </Link>
              ))}
            </div>
          )}
          <Link to="/routes" className="link-btn" style={{ alignSelf: 'flex-start' }}>
            <RouteIcon size={15} /> Browse all routes
          </Link>
        </section>
      </div>
    </div>
  )
}
