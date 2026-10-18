import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, BusFront, CalendarDays, CarFront, CreditCard, Info, Minus, Plus, QrCode, Ticket, Wallet } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { bookingService } from '../../services'
import { useToast } from '../../context/ToastContext'
import { busBadge, formatCurrency, formatDateLong, formatDateTime, label, parseTimestamp, toISODate, todayISO } from '../../utils/format'
import { runsOnDate, safeDate } from './helpers'
import './passenger-ui.css'

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'UPI', label: 'UPI', icon: QrCode },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'WALLET', label: 'Wallet', icon: Wallet },
]

const TITLES = { BUS: 'Book Seat', RIDE: 'Book shared ride', LOCAL_CAR: 'Request booking' }

/**
 * Booking sheet for all three booking types.
 *
 *   <BookingModal open type="BUS" bus={bus} defaultDate={date} onClose={...} />
 *   <BookingModal open type="RIDE" ride={ride} onClose={...} />
 *   <BookingModal open type="LOCAL_CAR" car={car} onClose={...} />
 *
 * The amount is computed by the server; the estimate shown here is only a guide.
 * On success it toasts and navigates to /bookings/:id.
 */
export function BookingModal({ open, onClose, type = 'BUS', bus, ride, car, defaultDate }) {
  const navigate = useNavigate()
  const toast = useToast()
  const rideDate = ride?.departureAt ? toISODate(parseTimestamp(ride.departureAt)) : null
  const maxSeats = type === 'RIDE' ? Math.max(0, Math.min(10, ride?.availableSeats ?? 0)) : 10
  const unitFare = type === 'BUS' ? bus?.fare : type === 'RIDE' ? ride?.farePerSeat : null

  const [travelDate, setTravelDate] = useState(() => rideDate || safeDate(defaultDate))
  const [seats, setSeats] = useState(1)
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTravelDate(rideDate || safeDate(defaultDate))
    setSeats(1)
    setPaymentMode('CASH')
    setErrors({})
    setFormError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const notRunning = type === 'BUS' && bus?.serviceDays && !runsOnDate(bus.serviceDays, travelDate)
  const estimate = unitFare != null ? unitFare * seats : null

  const target = useMemo(() => {
    if (type === 'BUS' && bus) {
      return {
        icon: <BusFront size={22} />,
        title: `${busBadge(bus)} · ${bus.busName || bus.busNumber}`,
        sub: bus.route?.name || bus.routeName || `${formatCurrency(bus.fare)} per seat`,
      }
    }
    if (type === 'RIDE' && ride) {
      return {
        icon: <CarFront size={22} />,
        title: `${ride.fromStop?.name ?? 'Pickup'} → ${ride.toStop?.name ?? 'Drop'}`,
        sub: `${formatDateTime(ride.departureAt)} · ${label('vehicleType', ride.vehicleType)} · ${ride.availableSeats} seats left`,
      }
    }
    if (type === 'LOCAL_CAR' && car) {
      return {
        icon: <CarFront size={22} />,
        title: car.driverName,
        sub: [car.carModel, car.carNumber, car.area].filter(Boolean).join(' · '),
      }
    }
    return null
  }, [type, bus, ride, car])

  const submit = async (e) => {
    e?.preventDefault()
    const local = {}
    if (!travelDate) local.travelDate = 'Choose a travel date'
    else if (travelDate < todayISO()) local.travelDate = 'Pick today or a future date'
    if (seats < 1 || seats > Math.max(1, maxSeats)) local.seats = `Choose between 1 and ${maxSeats} seats`
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    setBusy(true)
    setErrors({})
    setFormError('')
    try {
      const body = { type, travelDate, seats, paymentMode }
      if (type === 'BUS') body.busId = bus.id
      if (type === 'RIDE') body.rideId = ride.id
      if (type === 'LOCAL_CAR') body.localCarId = car.id
      const booking = await bookingService.create(body)
      toast.success(`Booking ${booking?.bookingRef ?? ''} confirmed`.replace('  ', ' '), 'Booked!')
      onClose?.()
      if (booking?.id) navigate(`/bookings/${booking.id}`)
    } catch (err) {
      const fe = err?.fieldErrors || {}
      setErrors(fe)
      setFormError(Object.keys(fe).length ? '' : err?.message || 'Booking failed')
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const seatNoun = type === 'LOCAL_CAR' ? 'Passengers' : 'Seats'
  const soldOut = type === 'RIDE' && maxSeats < 1

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={TITLES[type]}
      subtitle={type === 'LOCAL_CAR' ? 'The driver will call you to confirm the trip' : 'Reserve your seats in a few taps'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" icon={<Ticket size={18} />} onClick={submit} loading={busy} disabled={notRunning || soldOut}>
            {type === 'LOCAL_CAR' ? 'Send request' : 'Confirm booking'}
          </Button>
        </>
      }
    >
      <form className="stack" style={{ '--gap': '16px' }} onSubmit={submit} noValidate>
        {target && (
          <div className="px-book-target">
            <span className="icon-tile sm">{target.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="fw-600 truncate">{target.title}</div>
              {target.sub && <div className="text-xs text-muted">{target.sub}</div>}
            </div>
          </div>
        )}

        {type === 'RIDE' ? (
          <div className="field">
            <span className="field-label">Travel date</span>
            <div className="row text-sm fw-600" style={{ '--gap': '8px' }}>
              <CalendarDays size={17} className="text-muted" /> {formatDateLong(travelDate)}
            </div>
          </div>
        ) : (
          <Input
            label="Travel date"
            type="date"
            required
            min={todayISO()}
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
            error={errors.travelDate}
            icon={<CalendarDays size={18} />}
            hint={travelDate ? formatDateLong(travelDate) : undefined}
          />
        )}
        {notRunning && (
          <div className="alert alert-danger" role="alert">
            <Info size={18} />
            <span>This bus does not run on {formatDateLong(travelDate).split(',')[0]}s. Pick another date.</span>
          </div>
        )}

        <div className="field">
          <span className="field-label" id="px-seats-label">
            {seatNoun}
          </span>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="px-stepper" role="group" aria-labelledby="px-seats-label">
              <button type="button" onClick={() => setSeats((s) => Math.max(1, s - 1))} disabled={seats <= 1} aria-label={`Fewer ${seatNoun.toLowerCase()}`}>
                <Minus size={18} />
              </button>
              <output aria-live="polite">{seats}</output>
              <button type="button" onClick={() => setSeats((s) => Math.min(Math.max(1, maxSeats), s + 1))} disabled={seats >= maxSeats} aria-label={`More ${seatNoun.toLowerCase()}`}>
                <Plus size={18} />
              </button>
            </div>
            <span className="text-xs text-muted">{type === 'RIDE' ? `${ride?.availableSeats ?? 0} left` : 'Max 10'}</span>
          </div>
          {errors.seats && <span className="field-error">{errors.seats}</span>}
        </div>

        <div className="field">
          <span className="field-label">Payment mode</span>
          <div className="px-pay-grid" role="radiogroup" aria-label="Payment mode">
            {PAYMENT_MODES.map(({ value, label: text, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={paymentMode === value}
                className={`px-pay ${paymentMode === value ? 'active' : ''}`}
                onClick={() => setPaymentMode(value)}
              >
                <Icon size={20} />
                {text}
              </button>
            ))}
          </div>
          {errors.paymentMode && <span className="field-error">{errors.paymentMode}</span>}
          {paymentMode !== 'CASH' && (
            <span className="field-hint">In-app payments are not live yet. Pay the {type === 'BUS' ? 'conductor' : 'driver'} by {label('paymentMode', paymentMode)} when you travel.</span>
          )}
        </div>

        <div className="px-book-total">
          <div>
            <div className="text-sm fw-600">{type === 'LOCAL_CAR' ? 'Fare' : 'Estimated fare'}</div>
            <div className="text-xs text-muted">
              {type === 'LOCAL_CAR' ? 'Agreed directly with the driver' : 'Final amount confirmed by the server'}
            </div>
          </div>
          {estimate != null ? (
            <strong>
              ≈ {formatCurrency(unitFare)} × {seats} = {formatCurrency(estimate)}
            </strong>
          ) : (
            <strong className="text-sm">On request</strong>
          )}
        </div>

        {formError && (
          <div className="alert alert-danger" role="alert">
            <Info size={18} />
            <span>{formError}</span>
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

export default BookingModal
