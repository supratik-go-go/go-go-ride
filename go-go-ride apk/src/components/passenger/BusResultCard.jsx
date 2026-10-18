import { Link } from 'react-router-dom'
import { ArrowRight, BusFront, CalendarDays, ChevronRight, Clock, Clock3, IndianRupee, Info, Star, Timer, CircleX } from 'lucide-react'
import { Button } from '../ui/Button'
import { busBadge, formatDateLong, formatMinutes } from '../../utils/format'
import { ratingText } from './helpers'
import './passenger-ui.css'

/** URL of the bus details page for a search result, carrying the stop pair and date. */
export function busDetailsUrl(bus, date) {
  const q = new URLSearchParams()
  if (date) q.set('date', date)
  if (bus?.from?.id) q.set('from', bus.from.id)
  if (bus?.to?.id) q.set('to', bus.to.id)
  const s = q.toString()
  return `/bus/${bus.id}${s ? `?${s}` : ''}`
}

/**
 * One bus on the Search Results screen (design 05). Running buses get the
 * "Next" chip + View Details; not-running buses are greyed with the reason
 * and Change Date / View Other Buses actions.
 */
export function BusResultCard({ bus, date, onChangeDate, onViewOthers }) {
  const running = bus.isRunning !== false
  const url = busDetailsUrl(bus, date)
  const count = bus.rating?.count ?? 0
  const avg = bus.rating?.average ?? 0
  // Show the boarding -> drop leg only when it differs from the route's own ends.
  const showLeg = Boolean(bus.from?.name && bus.to?.name && `${bus.from.name} - ${bus.to.name}` !== bus.routeName)

  return (
    <article className={`card px-result ${running ? '' : 'is-off'}`} aria-label={`${busBadge(bus)} ${bus.routeName || ''}`}>
      <div className="px-result-top">
        <span className="px-result-icon" aria-hidden="true">
          <BusFront size={28} />
        </span>
        <Link to={url} className="px-result-title">
          <span className="px-result-badge">{busBadge(bus)}</span>
          <span className="px-result-route">{bus.routeName}</span>
          {showLeg && (
            <span className="px-result-leg">
              {bus.from.name} <ArrowRight size={12} /> {bus.to.name}
            </span>
          )}
        </Link>
        {running ? (
          <div className="px-result-rating" aria-label={count ? `Rated ${avg.toFixed(1)} from ${count} reviews` : 'No ratings yet'}>
            <span className="px-result-rating-value">
              <Star size={18} color="#f59e0b" fill="#f59e0b" /> {ratingText(avg, count)}
            </span>
            {count > 0 && <span className="px-result-rating-count">({count})</span>}
          </div>
        ) : (
          <div className="px-off-flag">
            <span className="px-pill-danger">
              <CircleX size={14} /> Not Running
            </span>
            <span className="text-xs text-muted">No service on this date</span>
          </div>
        )}
      </div>

      <div className="px-result-stats">
        <div className="px-stat">
          <span className="px-stat-value">
            <Clock size={15} color="var(--primary)" /> {bus.departureTime12h}
          </span>
          <span className="px-stat-label">Departure</span>
        </div>
        <div className="px-stat">
          <span className="px-stat-value">
            <Clock3 size={15} color="var(--accent)" /> {bus.arrivalTime12h}
          </span>
          <span className="px-stat-label">Arrival</span>
        </div>
        <div className="px-stat">
          <span className="px-stat-value">
            <Timer size={15} color="var(--success)" /> {bus.durationLabel || formatMinutes(bus.durationMinutes)}
          </span>
          <span className="px-stat-label">Duration</span>
        </div>
        <div className="px-stat">
          <span className="px-stat-value">
            <IndianRupee size={15} color="#6d4bd8" /> {Number(bus.fare ?? 0).toLocaleString('en-IN')}
          </span>
          <span className="px-stat-label">Fare</span>
        </div>
      </div>

      {running ? (
        <div className="px-result-foot">
          {bus.nextDepartureInMinutes != null && (
            <span className="px-next-chip">
              <Clock size={15} /> Next: {bus.departureTime12h}
              <small>· in {formatMinutes(bus.nextDepartureInMinutes)}</small>
            </span>
          )}
          <Button to={url} size="sm" iconRight={<ChevronRight size={17} />} style={{ minHeight: 40, padding: '0 16px' }}>
            View Details
          </Button>
        </div>
      ) : (
        <>
          <div className="alert alert-danger" role="note">
            <Info size={18} />
            <div>
              This bus is not running on {formatDateLong(date)}.{' '}
              {bus.notRunningReason ? `${bus.notRunningReason}.`.replace(/\.\.$/, '.') : 'Please select another date or choose a different bus.'}
            </div>
          </div>
          <div className="px-off-actions">
            <Button variant="outline" icon={<CalendarDays size={17} />} onClick={onChangeDate}>
              Change Date
            </Button>
            <Button variant="outline" icon={<BusFront size={17} />} onClick={onViewOthers} style={{ borderColor: 'var(--primary-500)' }}>
              View Other Buses
            </Button>
          </div>
        </>
      )}
    </article>
  )
}

export default BusResultCard
