import { Link } from 'react-router-dom'
import { BadgeCheck, CarFront, Clock, MapPin, Phone, Star } from 'lucide-react'
import { Button } from '../ui/Button'
import { assetUrl } from '../../api/client'
import { formatPhone } from '../../utils/format'
import { ratingText } from './helpers'
import './passenger-ui.css'

/** Car photo or a branded placeholder. */
export function CarPhoto({ car, className = 'px-car-photo', iconSize = 30 }) {
  const url = assetUrl(car?.photoUrl)
  if (url) return <img src={url} alt={`${car.carModel || 'Car'} driven by ${car.driverName}`} className={className} loading="lazy" />
  return (
    <span className={className} role="img" aria-label="No photo">
      <CarFront size={iconSize} strokeWidth={1.6} />
    </span>
  )
}

/**
 * Local driver card (Home strip + Local Cars grid).
 * `showDetails` adds a Details button next to Call Driver.
 */
export function LocalCarCard({ car, showDetails = false, showCar = false, className = '' }) {
  const tel = `tel:+91${String(car.phone || '').replace(/\D/g, '').slice(-10)}`
  return (
    <article className={`px-car ${className}`}>
      <div className="px-car-top">
        <Link to={`/local-cars/${car.id}`} tabIndex={-1} aria-hidden="true">
          <CarPhoto car={car} />
        </Link>
        <div className="px-car-info">
          <div className="row-between" style={{ gap: 6, alignItems: 'flex-start' }}>
            <div className="px-car-name">
              <span>
                <Link to={`/local-cars/${car.id}`}>{car.driverName}</Link>
              </span>
              {car.verified && (
                <span className="px-verified" title="Verified driver" aria-label="Verified driver">
                  <BadgeCheck size={16} />
                </span>
              )}
            </div>
            <span className="px-car-rating" aria-label={car.ratingCount ? `Rated ${car.ratingAvg} from ${car.ratingCount} reviews` : 'Not rated yet'}>
              <Star size={14} color="var(--accent)" fill="var(--accent)" />
              {ratingText(car.ratingAvg, car.ratingCount)}
              {showCar && car.ratingCount > 0 && <span className="text-xs text-muted fw-500">({car.ratingCount})</span>}
            </span>
          </div>
          <div className="px-car-line">
            <MapPin size={13} />
            <span>{car.area}</span>
          </div>
          {showCar && (car.carModel || car.carNumber) && (
            <div className="px-car-line">
              <CarFront size={13} />
              <span>{[car.carModel, car.carNumber].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          <div className="px-car-line">
            <Phone size={13} />
            <span>{formatPhone(car.phone)}</span>
          </div>
          {car.availabilityLabel && (
            <div className="px-car-line">
              <Clock size={13} />
              <span>{car.availabilityLabel}</span>
            </div>
          )}
        </div>
      </div>
      <div className="px-car-actions">
        <Button href={tel} icon={<Phone size={16} />} aria-label={`Call ${car.driverName}`}>
          Call Driver
        </Button>
        {showDetails && (
          <Button variant="outline" to={`/local-cars/${car.id}`}>
            Details
          </Button>
        )}
      </div>
    </article>
  )
}

export default LocalCarCard
