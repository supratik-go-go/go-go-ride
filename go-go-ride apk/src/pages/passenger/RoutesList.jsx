import { Link } from 'react-router-dom'
import { ArrowRight, BusFront, ChevronRight, MapPin, Route, Ruler, Search, X } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui'
import { routeService } from '../../services'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import './passenger.css'

function endpoints(route) {
  const stops = route.stops ?? []
  const from = route.fromStop?.name || stops[0]?.stop?.name
  const to = route.toStop?.name || stops[stops.length - 1]?.stop?.name
  return { from, to }
}

export default function RoutesList() {
  const list = usePagedQuery(routeService.list, { limit: 10, initialFilters: { status: 'ACTIVE' } })
  const total = list.meta?.total

  return (
    <div className="px-page px-wide">
      <PageHeader title="All Routes" subtitle={total != null ? `${total} route${total === 1 ? '' : 's'} across the city` : 'Bus routes across the city'} />

      <div className="px-routes-search">
        <div className="input-wrap has-icon has-suffix">
          <span className="input-icon">
            <Search size={18} />
          </span>
          <input
            className="input"
            type="search"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Search by route number or name (e.g. S12, Howrah)"
            aria-label="Search routes"
            enterKeyHint="search"
          />
          {list.search && (
            <span className="input-suffix">
              <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => list.setSearch('')} aria-label="Clear search">
                <X size={16} />
              </button>
            </span>
          )}
        </div>
      </div>

      {list.loading && !list.rows.length ? (
        <div className="px-routes-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={128} radius={14} />
          ))}
        </div>
      ) : list.error && !list.rows.length ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.rows.length ? (
        <EmptyState
          icon={<Route size={26} />}
          title={list.search ? 'No routes match your search' : 'No routes yet'}
          message={list.search ? `Nothing found for “${list.search}”. Try a route number like S12 or a stop name.` : 'Routes will appear here once they are published.'}
        />
      ) : (
        <>
          <div className={`px-routes-grid ${list.loading ? 'is-refreshing' : ''}`}>
            {list.rows.map((r) => {
              const { from, to } = endpoints(r)
              const stopCount = r.stops?.length ?? 0
              return (
                <Link key={r.id} to={`/routes/${r.id}`} className="card card-hover px-route-card">
                  <div className="px-route-top">
                    <span className="route-badge px-route-no">{r.routeNumber}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="fw-600 px-route-name">{r.name}</div>
                      {from && to && (
                        <div className="px-route-ends">
                          <MapPin size={13} /> <span className="truncate">{from}</span> <ArrowRight size={13} /> <span className="truncate">{to}</span>
                        </div>
                      )}
                    </div>
                    <ChevronRight size={20} className="text-muted" />
                  </div>
                  <div className="px-route-meta">
                    {r.distanceKm != null && (
                      <span>
                        <Ruler size={14} /> {Number(r.distanceKm).toFixed(1)} km
                      </span>
                    )}
                    <span>
                      <MapPin size={14} /> {stopCount} stop{stopCount === 1 ? '' : 's'}
                    </span>
                    <span>
                      <BusFront size={14} /> {r.totalBuses ?? 0} bus{r.totalBuses === 1 ? '' : 'es'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
          <Pagination meta={list.meta} onChange={(p) => {
            list.setPage(p)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }} noun="routes" />
        </>
      )}
    </div>
  )
}
