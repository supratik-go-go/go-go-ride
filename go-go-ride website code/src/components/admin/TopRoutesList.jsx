import { Route } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from '../ui/LoadingSpinner'
import { EmptyState } from '../ui/States'
import { RouteBadge } from '../ui/Badge'
import { formatNumber } from '../../utils/format'
import './admin-ui.css'

/**
 * Ranked "Top Routes by Bookings" with proportional bars, from the
 * `topRoutes[]` array of /admin/dashboard or /admin/reports
 * ({ routeId, name, routeNumber, bookings } - bookings = seats booked).
 */
export function TopRoutesList({ routes, loading, limit = 5, unit = 'seats' }) {
  if (loading && !routes) {
    return (
      <div className="stack" style={{ '--gap': '16px' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={30} />
        ))}
      </div>
    )
  }
  const list = (routes || []).slice(0, limit)
  if (!list.length) {
    return <EmptyState icon={<Route size={24} />} title="No route bookings" message="No bus bookings were made on linked routes in this period." compact />
  }
  const max = Math.max(...list.map((r) => r.bookings || 0), 1)
  return (
    <ol className="adm-toproutes">
      {list.map((r, i) => (
        <li key={r.routeId || i}>
          <span className="rank">{i + 1}</span>
          <span className="row" style={{ '--gap': '8px', minWidth: 0 }}>
            {r.routeNumber && <RouteBadge size="sm">{r.routeNumber}</RouteBadge>}
            <Link to="/admin/routes" className="truncate fw-500 text-sm" style={{ color: 'var(--text)' }} title={r.name}>
              {r.name}
            </Link>
          </span>
          <span className="fw-600 text-sm tabular" title={`${formatNumber(r.bookings)} ${unit} booked`}>
            {formatNumber(r.bookings)}
          </span>
          <span className="adm-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(4, ((r.bookings || 0) / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  )
}

export default TopRoutesList
