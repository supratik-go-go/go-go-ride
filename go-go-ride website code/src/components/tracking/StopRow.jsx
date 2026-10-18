import { Link } from 'react-router-dom'
import { BusFront, ChevronRight, MapPin, Navigation, Route } from 'lucide-react'
import { formatDistance, stopPoint } from '../../services/locationService'
import { directionsUrl } from './trackingUtils'
import './tracking.css'

/** One bus stop in a list: name, area, counts, distance + a Directions button. */
export function StopRow({ stop, distanceKm }) {
  const point = stopPoint(stop)
  const dir = directionsUrl(point)
  const dist = distanceKm ?? stop.distanceKm
  return (
    <div className="trk-stoprow">
      <Link to={`/stops/${stop.id}`} className="trk-stoprow-main">
        <span className="icon-tile">
          <MapPin size={20} />
        </span>
        <div className="grow">
          <div className="row" style={{ '--gap': '8px' }}>
            <span className="trk-stoprow-name truncate">{stop.name}</span>
            {Number.isFinite(dist) && <span className="trk-dist">{formatDistance(dist)}</span>}
          </div>
          <div className="trk-stoprow-meta">
            {(stop.area || stop.city) && <span>{[...new Set([stop.area, stop.city].filter(Boolean))].join(', ')}</span>}
            <span>
              <BusFront size={12} /> {stop.busesAvailable ?? 0} {stop.busesAvailable === 1 ? 'bus' : 'buses'}
            </span>
            <span>
              <Route size={12} /> {stop.routes ?? 0} {stop.routes === 1 ? 'route' : 'routes'}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted hide-mobile" />
      </Link>
      {dir && (
        <a className="trk-dir-btn" href={dir} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${stop.name}`} title="Directions">
          <Navigation size={18} />
        </a>
      )}
    </div>
  )
}
