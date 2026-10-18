import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BusFront, CarTaxiFront, Heart, MapPin, Phone, Route as RouteIcon, Search, Signpost, Star, Waypoints } from 'lucide-react'
import { Button, Card, EmptyState, ErrorState, RouteBadge, Skeleton, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services'
import { busBadge, formatCurrency, label } from '../../utils/format'
import { AccountPage } from './accountShared'

const GROUPS = [
  { key: 'buses', type: 'BUS', title: 'Buses', icon: BusFront, empty: 'Tap the heart on a bus to keep its timetable one tap away.' },
  { key: 'routes', type: 'ROUTE', title: 'Routes', icon: Waypoints, empty: 'Save the routes you ride often.' },
  { key: 'stops', type: 'STOP', title: 'Stops', icon: Signpost, empty: 'Save your home and office stops to see buses quickly.' },
  { key: 'localCars', type: 'LOCAL_CAR', title: 'Local Cars', icon: CarTaxiFront, empty: 'Save drivers you trust so you can call them again.' },
]

function Rating({ value }) {
  if (!value) return null
  return (
    <span>
      <Star size={12} fill="#f59e0b" color="#f59e0b" /> {Number(value).toFixed(1)}
    </span>
  )
}

function FavItem({ group, item }) {
  switch (group.type) {
    case 'BUS':
      return (
        <Link to={`/bus/${item.id}`} className="acc-fav-main">
          <RouteBadge>{busBadge(item)}</RouteBadge>
          <span className="acc-fav-text">
            <strong className="truncate">{item.busName || item.busNumber}</strong>
            <span className="acc-fav-meta">
              <span className="truncate">{item.route?.name || item.busNumber}</span>
              {item.type && <span>{label('busType', item.type)}</span>}
              {item.fare != null && <span>{formatCurrency(item.fare)}</span>}
              <Rating value={item.ratingAvg} />
            </span>
          </span>
        </Link>
      )
    case 'ROUTE':
      return (
        <Link to={`/routes/${item.id}`} className="acc-fav-main">
          <span className="icon-tile accent">
            <RouteIcon size={20} />
          </span>
          <span className="acc-fav-text">
            <strong className="truncate">{item.name}</strong>
            <span className="acc-fav-meta">
              {item.routeNumber && <span className="fw-600 text-accent">Route {item.routeNumber}</span>}
              {item.distanceKm ? <span>{item.distanceKm} km</span> : null}
            </span>
          </span>
        </Link>
      )
    case 'STOP':
      return (
        <Link to={`/stops/${item.id}`} className="acc-fav-main">
          <span className="icon-tile success">
            <MapPin size={20} />
          </span>
          <span className="acc-fav-text">
            <strong className="truncate">{item.name}</strong>
            <span className="acc-fav-meta">{item.area && <span>{item.area}</span>}</span>
          </span>
        </Link>
      )
    default:
      return (
        <Link to={`/local-cars/${item.id}`} className="acc-fav-main">
          <span className="icon-tile violet">
            <CarTaxiFront size={20} />
          </span>
          <span className="acc-fav-text">
            <strong className="truncate">{item.driverName}</strong>
            <span className="acc-fav-meta">
              {item.area && (
                <span>
                  <MapPin size={11} /> {item.area}
                </span>
              )}
              <Rating value={item.ratingAvg} />
            </span>
          </span>
        </Link>
      )
  }
}

export default function Favorites() {
  const toast = useToast()
  const q = useAsync(() => profileService.favorites(), [])
  const [filter, setFilter] = useState('all')
  const [removing, setRemoving] = useState({})

  const remove = async (group, item) => {
    const index = (q.data?.[group.key] || []).findIndex((x) => x.id === item.id)
    setRemoving((r) => ({ ...r, [item.id]: true }))
    q.setData((d) => ({ ...d, [group.key]: d[group.key].filter((x) => x.id !== item.id) }))
    try {
      await profileService.removeFavorite(group.type, item.id)
      toast.success('Removed from favourites')
    } catch (err) {
      // put it back where it was
      q.setData((d) => {
        const list = d[group.key].slice()
        list.splice(Math.max(0, index), 0, item)
        return { ...d, [group.key]: list }
      })
      toast.error(err)
    } finally {
      setRemoving((r) => {
        const next = { ...r }
        delete next[item.id]
        return next
      })
    }
  }

  const data = q.data
  const total = data ? GROUPS.reduce((n, g) => n + (data[g.key]?.length || 0), 0) : 0
  const visible = GROUPS.filter((g) => (filter === 'all' ? data?.[g.key]?.length : g.key === filter))

  return (
    <AccountPage title="Favorites">
      {q.loading && !data ? (
        <div className="stack">
          <Skeleton height={38} radius={10} width="80%" />
          <Skeleton height={230} radius={14} />
          <Skeleton height={150} radius={14} />
        </div>
      ) : q.error && !data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : total === 0 ? (
        <EmptyState
          icon={<Heart size={26} />}
          title="No favourites yet"
          message="Tap the heart on a bus, route, stop or local car and it will be saved here for quick access."
          action={
            <Button to="/search" icon={<Search size={17} />}>
              Search buses
            </Button>
          }
        />
      ) : (
        <>
          <div className="acc-chips" role="tablist" aria-label="Filter favourites">
            <button type="button" role="tab" aria-selected={filter === 'all'} className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All <span className="acc-chip-count">{total}</span>
            </button>
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={filter === g.key}
                className={`chip ${filter === g.key ? 'active' : ''}`}
                onClick={() => setFilter(g.key)}
              >
                <g.icon size={15} /> {g.title} <span className="acc-chip-count">{data[g.key]?.length || 0}</span>
              </button>
            ))}
          </div>

          {visible.map((g) => {
            const items = data[g.key] || []
            return (
              <section key={g.key} className="stack" style={{ '--gap': '10px' }} aria-label={g.title}>
                <h2 className="acc-section-title">
                  {g.title} · {items.length}
                </h2>
                {items.length ? (
                  <Card pad={false} className="acc-fav-group">
                    {items.map((item) => (
                      <div key={item.id} className="acc-fav-row">
                        <FavItem group={g} item={item} />
                        {g.type === 'LOCAL_CAR' && item.phone && (
                          <a href={`tel:${item.phone}`} className="acc-call" aria-label={`Call ${item.driverName}`} title="Call driver">
                            <Phone size={17} />
                          </a>
                        )}
                        <button
                          type="button"
                          className="acc-heart"
                          onClick={() => remove(g, item)}
                          disabled={removing[item.id]}
                          aria-label={`Remove ${item.busName || item.name || item.driverName || 'item'} from favourites`}
                          title="Remove from favourites"
                        >
                          <Heart size={20} fill="currentColor" />
                        </button>
                      </div>
                    ))}
                  </Card>
                ) : (
                  <EmptyState compact icon={<g.icon size={24} />} title={`No saved ${g.title.toLowerCase()}`} message={g.empty} />
                )}
              </section>
            )
          })}
        </>
      )}
    </AccountPage>
  )
}
