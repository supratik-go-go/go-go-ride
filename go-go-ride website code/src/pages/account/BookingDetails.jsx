import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CarFront,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  CreditCard,
  Hourglass,
  IndianRupee,
  MapPin,
  Phone,
  ReceiptText,
  RotateCcw,
  Ticket,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card, DataState, InfoItem, Modal, RouteBadge, StatusBadge, Textarea, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { bookingService } from '../../services'
import {
  busBadge,
  formatContact,
  formatCurrency,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatPhone,
  label,
  relativeDayLabel,
  todayISO,
} from '../../utils/format'
import { AccountPage } from './accountShared'
import { BOOKING_ICON, BOOKING_TONE, bookingSubtitle, bookingTitle, canCancelBooking, isPayDriver } from './accountUtils'

const REASONS = ['Change of plans', 'Booked by mistake', 'Found another option', 'Bus timing changed']

function timeline(b) {
  const date = String(b.travelDate).slice(0, 10)
  const steps = [{ key: 'placed', title: 'Booking placed', text: formatDateTime(b.createdAt), state: 'done', icon: Ticket }]
  if (b.status === 'CANCELLED') {
    steps.push({ key: 'cancelled', title: 'Booking cancelled', text: b.cancelReason ? `Reason: ${b.cancelReason}` : 'Cancelled before travel', state: 'cancelled', icon: X })
    if (b.paymentStatus === 'REFUNDED') {
      steps.push({ key: 'refund', title: 'Refund initiated', text: `${formatCurrency(b.amount)} to your original ${label('paymentMode', b.paymentMode)} payment`, state: 'done', icon: RotateCcw })
    }
    return steps
  }
  steps.push(
    b.status === 'PENDING'
      ? { key: 'confirm', title: 'Awaiting confirmation', text: 'The operator will confirm your seats shortly.', state: 'current', icon: Hourglass }
      : { key: 'confirm', title: 'Booking confirmed', text: 'Your seats are reserved.', state: 'done', icon: Check },
  )
  const travelPast = date < todayISO()
  steps.push({
    key: 'travel',
    title: `Travel ${['Today', 'Tomorrow'].includes(relativeDayLabel(date)) ? relativeDayLabel(date).toLowerCase() : `on ${formatDate(date)}`}`,
    text: formatDateLong(date),
    state: b.status === 'COMPLETED' ? 'done' : b.status === 'CONFIRMED' && !travelPast ? 'current' : 'upcoming',
    icon: CalendarDays,
  })
  steps.push({
    key: 'done',
    title: 'Trip completed',
    text: b.status === 'COMPLETED' ? 'Thanks for riding with GO-GO Ride.' : 'Marked complete after your journey.',
    state: b.status === 'COMPLETED' ? 'done' : 'upcoming',
    icon: BadgeCheck,
  })
  return steps
}

function TripDetails({ b }) {
  if (b.type === 'BUS') {
    const bus = b.bus
    if (!bus) return <p className="text-sm text-muted">This bus is no longer listed on GO-GO Ride.</p>
    return (
      <div className="stack" style={{ '--gap': '14px' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <RouteBadge size="lg">{busBadge(bus)}</RouteBadge>
          <div className="grow">
            <strong>{bus.busName || bus.busNumber}</strong>
            <p className="text-sm text-muted">{bus.route?.name || 'Route not linked yet'}</p>
            <div className="row wrap" style={{ '--gap': '6px', marginTop: 6 }}>
              <Badge tone="neutral">{bus.busNumber}</Badge>
              {bus.type && <Badge tone="info">{label('busType', bus.type)}</Badge>}
              {bus.category && <Badge tone="primary">{label('busCategory', bus.category)}</Badge>}
              {bus.operator && <Badge tone="neutral">{bus.operator}</Badge>}
            </div>
          </div>
        </div>
        <div className="row wrap" style={{ '--gap': '8px' }}>
          <Button to={`/bus/${bus.id}`} variant="soft" size="sm" iconRight={<ArrowRight size={15} />}>
            View bus & timetable
          </Button>
          {bus.contactNumber && (
            <Button href={`tel:${bus.contactNumber}`} variant="outline" size="sm" icon={<Phone size={15} />}>
              {formatContact(bus.contactNumber)}
            </Button>
          )}
        </div>
      </div>
    )
  }
  if (b.type === 'RIDE') {
    const ride = b.ride
    if (!ride) return <p className="text-sm text-muted">This ride is no longer available.</p>
    return (
      <div className="stack" style={{ '--gap': '14px' }}>
        <div className="acc-stops">
          <div className="acc-stop from">
            <span className="acc-stop-text">
              <small>Pickup</small>
              <strong>{ride.fromStop?.name || '-'}</strong>
            </span>
            <span className="acc-stop-time">{formatDateTime(ride.departureAt).split(', ')[1]}</span>
          </div>
          <div className="acc-stop to">
            <span className="acc-stop-text">
              <small>Drop</small>
              <strong>{ride.toStop?.name || '-'}</strong>
            </span>
          </div>
        </div>
        <div className="acc-info-grid">
          <InfoItem icon={<CarFront size={18} />} label="Vehicle" value={`Shared ${label('vehicleType', ride.vehicleType).toLowerCase()}`} />
          <InfoItem icon={<IndianRupee size={18} />} label="Fare per seat" value={formatCurrency(ride.farePerSeat)} />
          {ride.driver && <InfoItem icon={<Users size={18} />} label="Driver" value={ride.driver.name} />}
        </div>
        {ride.driver?.phone && (
          <Button href={`tel:${ride.driver.phone}`} variant="outline" size="sm" icon={<Phone size={15} />} style={{ alignSelf: 'flex-start' }}>
            Call driver · {formatPhone(ride.driver.phone)}
          </Button>
        )}
      </div>
    )
  }
  const car = b.localCar
  if (!car) return <p className="text-sm text-muted">This local car listing has been removed.</p>
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="acc-info-grid">
        <InfoItem icon={<Users size={18} />} label="Driver" value={car.driverName} />
        <InfoItem icon={<CarFront size={18} />} label="Car" value={[car.carModel, car.carNumber].filter(Boolean).join(' · ') || '-'} />
        <InfoItem icon={<MapPin size={18} />} label="Area" value={car.area} />
        <InfoItem icon={<Clock3 size={18} />} label="Available" value={car.availabilityLabel} />
      </div>
      <div className="row wrap" style={{ '--gap': '8px' }}>
        <Button href={`tel:${car.phone}`} variant="success" size="sm" icon={<Phone size={15} />}>
          Call {car.driverName.split(' ')[0]}
        </Button>
        <Button to={`/local-cars/${car.id}`} variant="soft" size="sm" iconRight={<ArrowRight size={15} />}>
          View listing
        </Button>
      </div>
    </div>
  )
}

function CancelDialog({ open, booking, onClose, onCancelled }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const paid = booking?.paymentStatus === 'PAID'

  const confirm = async () => {
    setBusy(true)
    try {
      const updated = await bookingService.cancel(booking.id, reason.trim() || undefined)
      toast.success(updated?.paymentStatus === 'REFUNDED' ? 'Booking cancelled - refund initiated' : 'Booking cancelled')
      onCancelled(updated)
      setReason('')
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Cancel this booking?"
      subtitle={booking ? `#${booking.bookingRef}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep booking
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            Cancel booking
          </Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '14px' }}>
        <p className="text-2 text-sm">
          Your seats will be released for other riders. This can&apos;t be undone - you&apos;d need to book again.
        </p>
        {paid && (
          <div className="alert alert-info">
            <RotateCcw size={18} />
            <span>
              You paid <strong>{formatCurrency(booking.amount)}</strong> by {label('paymentMode', booking.paymentMode)}. Cancelling marks it for a refund to the same payment method.
            </span>
          </div>
        )}
        <div className="acc-reason-chips" role="group" aria-label="Quick reasons">
          {REASONS.map((r) => (
            <button key={r} type="button" className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason((x) => (x === r ? '' : r))}>
              {r}
            </button>
          ))}
        </div>
        <Textarea
          label="Reason (optional)"
          placeholder="Tell us why - it helps operators plan better"
          rows={3}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint={`${reason.length}/200`}
        />
      </div>
    </Modal>
  )
}

export default function BookingDetails() {
  const { id } = useParams()
  const toast = useToast()
  const q = useAsync(() => bookingService.get(id), [id])
  const [cancelOpen, setCancelOpen] = useState(false)

  const copyRef = async (ref) => {
    try {
      await navigator.clipboard.writeText(ref)
      toast.success('Booking reference copied')
    } catch {
      toast.info(`Booking reference: ${ref}`)
    }
  }

  return (
    <AccountPage title="Booking Details" subtitle={q.data ? `#${q.data.bookingRef}` : undefined}>
      <DataState state={q} skeleton skeletonCount={3} skeletonHeight={160}>
        {(b) => {
          const Icon = BOOKING_ICON[b.type] || Ticket
          const date = String(b.travelDate).slice(0, 10)
          return (
            <>
              <Card>
                <div className="acc-detail-hero">
                  <div className="acc-detail-head">
                    <span className={`icon-tile lg ${BOOKING_TONE[b.type] || ''}`}>
                      <Icon size={26} />
                    </span>
                    <div className="grow">
                      <span className="text-xs text-muted">{label('bookingType', b.type)} booking</span>
                      <h2>{bookingTitle(b)}</h2>
                      <p className="text-sm text-muted">{bookingSubtitle(b)}</p>
                    </div>
                    <StatusBadge value={b.status} group="bookingStatus" size="lg" />
                  </div>
                  <div className="row wrap" style={{ '--gap': '8px' }}>
                    <button type="button" className="acc-ref-chip" onClick={() => copyRef(b.bookingRef)} title="Copy booking reference">
                      <ReceiptText size={14} /> <span className="acc-ref">{b.bookingRef}</span> <Copy size={13} />
                    </button>
                    <span className="text-xs text-muted">Booked {formatDateTime(b.createdAt)}</span>
                  </div>
                  <div className="acc-info-grid">
                    <InfoItem icon={<CalendarDays size={18} />} label="Travel date" value={formatDate(date)} />
                    <InfoItem icon={<Users size={18} />} label="Seats" value={`${b.seats} ${b.seats === 1 ? 'seat' : 'seats'}`} />
                    <InfoItem icon={<CreditCard size={18} />} label="Payment mode" value={label('paymentMode', b.paymentMode)} />
                  </div>
                  <div className="acc-total">
                    <div className="stack" style={{ '--gap': '2px' }}>
                      <span className="text-xs text-muted">{isPayDriver(b) ? 'Fare' : 'Total amount'}</span>
                      <strong className="tabular">{isPayDriver(b) ? 'Agree with driver' : formatCurrency(b.amount)}</strong>
                    </div>
                    <StatusBadge value={b.paymentStatus} group="paymentStatus" size="lg" />
                  </div>
                  {b.paymentStatus === 'REFUNDED' && (
                    <div className="alert alert-success">
                      <RotateCcw size={18} />
                      <span>
                        {formatCurrency(b.amount)} has been marked for refund to your {label('paymentMode', b.paymentMode)} payment. It goes back to the same payment method.
                      </span>
                    </div>
                  )}
                  {b.paymentStatus === 'PENDING' && b.paymentMode === 'CASH' && b.status !== 'CANCELLED' && !isPayDriver(b) && (
                    <div className="alert alert-warning">
                      <IndianRupee size={18} />
                      <span>Pay {formatCurrency(b.amount)} in cash when you board.</span>
                    </div>
                  )}
                </div>
              </Card>

              <Card title={b.type === 'BUS' ? 'Bus' : b.type === 'RIDE' ? 'Ride' : 'Local car'}>
                <TripDetails b={b} />
              </Card>

              <Card title="Booking status">
                <ol className="acc-timeline">
                  {timeline(b).map(({ key, title, text, state, icon: StepIcon }) => (
                    <li key={key} className={`acc-tl-item ${state}`}>
                      <span className="acc-tl-dot">
                        <StepIcon size={14} strokeWidth={2.5} />
                      </span>
                      <span className="acc-tl-body">
                        <strong>{title}</strong>
                        {text && <span className="text-xs text-muted">{text}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>

              {canCancelBooking(b) && (
                <Card>
                  <div className="row-between wrap">
                    <div className="stack" style={{ '--gap': '2px' }}>
                      <strong>Need to change plans?</strong>
                      <span className="text-sm text-muted">
                        {b.paymentStatus === 'PAID' ? 'Cancel now and your payment is marked for refund.' : 'You can cancel any time before your trip.'}
                      </span>
                    </div>
                    <Button variant="outline-danger" icon={<XCircle size={17} />} onClick={() => setCancelOpen(true)}>
                      Cancel booking
                    </Button>
                  </div>
                </Card>
              )}

              <Link to="/support?tab=new" className="row text-sm" style={{ justifyContent: 'center', '--gap': '6px' }}>
                <CircleHelp size={16} /> Need help with this booking?
              </Link>

              <CancelDialog
                open={cancelOpen}
                booking={b}
                onClose={() => setCancelOpen(false)}
                onCancelled={(updated) => q.setData((cur) => ({ ...cur, ...updated }))}
              />
            </>
          )
        }}
      </DataState>
    </AccountPage>
  )
}
