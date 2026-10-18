import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, CalendarCheck, CarFront, CircleCheck, Clock, Hash, MapPin, MessageSquareText, Phone, ShieldAlert } from 'lucide-react'
import { Button, ErrorState, InfoItem, PageHeader, Skeleton, StarRating, useToast } from '../../components/ui'
import { BookingModal, CarPhoto, FavoriteButton, ReviewForm, ReviewList, ratingText, toMinutes, useRequireLogin } from '../../components/passenger'
import { localCarService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import { formatPhone } from '../../utils/format'
import './passenger.css'

/** Is "now" inside the driver's HH:mm window (handles overnight shifts)? */
function availableNow(from, to) {
  const a = toMinutes(from)
  const b = toMinutes(to)
  if (a == null || b == null) return null
  const d = new Date()
  const now = d.getHours() * 60 + d.getMinutes()
  return a <= b ? now >= a && now <= b : now >= a || now <= b
}

export default function LocalCarDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const requireLogin = useRequireLogin()
  const q = useAsync(() => localCarService.get(id), [id])
  const car = q.data
  const [bookOpen, setBookOpen] = useState(false)

  if (q.loading && !car) {
    return (
      <div className="px-page px-wide" aria-busy="true">
        <PageHeader title="Driver Details" />
        <div className="px-lcd-layout">
          <Skeleton height={460} radius={20} />
          <Skeleton height={300} radius={16} />
        </div>
      </div>
    )
  }
  if (q.error && !car) {
    return (
      <div className="px-page px-wide">
        <PageHeader title="Driver Details" />
        <ErrorState error={q.error} title={q.error.status === 404 ? 'Driver not found' : undefined} onRetry={q.error.status === 404 ? undefined : () => q.reload()} />
        <div className="center">
          <Button to="/local-cars" variant="outline">
            All local cars
          </Button>
        </div>
      </div>
    )
  }

  const digits = String(car.phone || '').replace(/\D/g, '').slice(-10)
  const smsBody = encodeURIComponent(`Hi ${car.driverName}, I found you on GO-GO Ride. Are you available for a trip?`)
  const isNow = availableNow(car.availableFrom, car.availableTo)
  const reviews = car.reviews ?? []
  const mine = user ? reviews.find((r) => r.user?.id === user.id) : null
  const isOwner = user && car.ownerId && user.id === car.ownerId

  const submitReview = async (rating, comment) => {
    try {
      await localCarService.review(car.id, rating, comment)
      toast.success(`Thanks for rating ${car.driverName}!`)
      q.reload({ silent: true })
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  return (
    <div className="px-page px-wide">
      <PageHeader title="Driver Details" actions={<FavoriteButton itemType="LOCAL_CAR" itemId={car.id} />} />

      <div className="px-lcd-layout">
        <section className="card px-lcd-hero">
          <CarPhoto car={car} className="px-lcd-photo" iconSize={64} />
          <div className="px-lcd-body">
            <div className="px-lcd-name">
              <h1>{car.driverName}</h1>
              {car.verified ? (
                <span className="badge badge-success">
                  <BadgeCheck size={14} /> Verified
                </span>
              ) : (
                <span className="badge badge-neutral">Not verified</span>
              )}
            </div>
            <div className="px-lcd-rating">
              <StarRating value={car.ratingAvg || 0} size={18} />
              <strong>{ratingText(car.ratingAvg, car.ratingCount)}</strong>
              <span className="text-muted">({car.ratingCount || 0} reviews)</span>
              {isNow != null && (
                <span className={`px-avail-now ${isNow ? 'on' : 'off'}`}>
                  {isNow ? <CircleCheck size={13} /> : <Clock size={13} />} {isNow ? 'Available now' : 'Off duty now'}
                </span>
              )}
            </div>

            <div className="px-lcd-facts">
              <InfoItem icon={<MapPin size={18} />} label="Area" value={car.area} />
              <InfoItem icon={<Clock size={18} />} label="Available" value={car.availabilityLabel} />
              <InfoItem icon={<CarFront size={18} />} label="Car" value={car.carModel || '—'} />
              <InfoItem icon={<Hash size={18} />} label="Car number" value={car.carNumber || '—'} />
              <InfoItem icon={<Phone size={18} />} label="Phone" value={formatPhone(car.phone)} />
            </div>

            {!car.verified && (
              <div className="alert alert-warning">
                <ShieldAlert size={18} />
                <span>GO-GO Ride hasn&apos;t verified this driver yet. Check the car number before you get in.</span>
              </div>
            )}

            <div className="px-lcd-actions">
              <Button href={`tel:+91${digits}`} icon={<Phone size={18} />} aria-label={`Call ${car.driverName}`}>
                Call
              </Button>
              <Button href={`sms:+91${digits}?body=${smsBody}`} variant="outline" icon={<MessageSquareText size={18} />} aria-label={`Send SMS to ${car.driverName}`}>
                SMS
              </Button>
              {!isOwner && (
                <Button
                  variant="accent"
                  icon={<CalendarCheck size={18} />}
                  className="px-lcd-book"
                  onClick={() => {
                    if (requireLogin()) setBookOpen(true)
                  }}
                >
                  Request booking
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">Fares are agreed directly with the driver. Calls and SMS go straight to their phone.</p>
          </div>
        </section>

        <section className="card px-card-pad stack" style={{ '--gap': '14px' }} aria-labelledby="px-lcd-reviews">
          <div className="px-section-head">
            <h2 id="px-lcd-reviews" className="px-section-title">
              Reviews
            </h2>
            {reviews.length > 0 && <span className="text-xs text-muted">Latest {reviews.length}</span>}
          </div>
          {isOwner ? (
            <div className="soft-panel text-sm text-2">This is your listing — passengers&apos; reviews will appear below.</div>
          ) : mine ? (
            <div className="soft-panel px-reviewed">
              <CircleCheck size={20} className="text-success" />
              <span className="text-sm text-2">You rated this driver {mine.rating}★. Thanks for helping other passengers!</span>
            </div>
          ) : (
            <ReviewForm title="Rate this driver" submitLabel="Submit rating" onSubmit={submitReview} />
          )}
          <div className="divider" />
          <ReviewList reviews={reviews} emptyMessage="No one has reviewed this driver yet." />
        </section>
      </div>

      <BookingModal open={bookOpen} onClose={() => setBookOpen(false)} type="LOCAL_CAR" car={car} />
    </div>
  )
}
