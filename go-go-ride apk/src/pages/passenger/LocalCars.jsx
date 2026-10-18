import { CarFront, ChevronRight, Search, Star, X } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui'
import { LocalCarCard } from '../../components/passenger'
import { localCarService } from '../../services'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { useAuth } from '../../context/AuthContext'
import './passenger.css'

export default function LocalCars() {
  const { user } = useAuth()
  const list = usePagedQuery(localCarService.list, { limit: 12, initialFilters: { verified: '', minRating: '' } })
  const verifiedOnly = list.filters.verified === 'true'
  const topRated = list.filters.minRating === 4
  const filtered = Boolean(list.search || verifiedOnly || topRated)
  const total = list.meta?.total

  const clearAll = () => {
    list.setSearch('')
    list.setFilters({ verified: '', minRating: '' })
  }

  return (
    <div className="px-page px-wide">
      <PageHeader title="Local Cars" subtitle="Call verified local drivers directly" />

      <div className="card px-lc-toolbar">
        <div className="input-wrap has-icon has-suffix">
          <span className="input-icon">
            <Search size={18} />
          </span>
          <input
            className="input"
            type="search"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Search by area, driver or car (e.g. Salt Lake)"
            aria-label="Search local cars by area, driver or car"
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
        <div className="row wrap" style={{ '--gap': '8px' }}>
          <button type="button" role="switch" aria-checked={verifiedOnly} className="px-switch" onClick={() => list.setFilter('verified', verifiedOnly ? '' : 'true')}>
            <span className="px-switch-track" aria-hidden="true" />
            Verified only
          </button>
          <button type="button" className={`chip ${topRated ? 'active' : ''}`} aria-pressed={topRated} onClick={() => list.setFilter('minRating', topRated ? '' : 4)}>
            <Star size={15} color="#f59e0b" fill={topRated ? '#f59e0b' : 'none'} /> 4★ &amp; above
          </button>
          {filtered && (
            <button type="button" className="link-btn" onClick={clearAll} style={{ marginLeft: 'auto' }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {total != null && list.rows.length > 0 && (
        <p className="text-sm text-muted" style={{ margin: '0 2px 10px' }}>
          {total} driver{total === 1 ? '' : 's'} {filtered ? 'match your filters' : 'available'}
        </p>
      )}

      {list.loading && !list.rows.length ? (
        <div className="px-lc-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={176} radius={14} />
          ))}
        </div>
      ) : list.error && !list.rows.length ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.rows.length ? (
        <EmptyState
          icon={<CarFront size={26} />}
          title={filtered ? 'No drivers match your filters' : 'No local cars listed yet'}
          message={filtered ? 'Try a nearby area or turn off a filter.' : 'Local drivers will appear here once they list their cars.'}
          action={
            filtered ? (
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className={`px-lc-grid ${list.loading ? 'is-refreshing' : ''}`}>
            {list.rows.map((car) => (
              <LocalCarCard key={car.id} car={car} showDetails showCar />
            ))}
          </div>
          <Pagination
            meta={list.meta}
            onChange={(p) => {
              list.setPage(p)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            noun="drivers"
          />
        </>
      )}

      <div className="px-lc-cta">
        <span className="icon-tile accent">
          <CarFront size={22} />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="fw-600">Drive a car in your area?</div>
          <div className="text-sm text-muted">List it on GO-GO Ride and get calls from passengers nearby.</div>
        </div>
        <Button to={user ? '/driver/cars' : '/register'} size="sm" variant="outline-accent" iconRight={<ChevronRight size={16} />}>
          {user ? 'List car' : 'Join'}
        </Button>
      </div>
    </div>
  )
}
