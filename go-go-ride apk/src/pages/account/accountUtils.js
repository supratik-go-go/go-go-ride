import { BusFront, CarFront, CarTaxiFront } from 'lucide-react'
import { formatDateTime, label } from '../../utils/format'

// ------------------------------------------------------------------ bookings

export const BOOKING_ICON = { BUS: BusFront, RIDE: CarFront, LOCAL_CAR: CarTaxiFront }
export const BOOKING_TONE = { BUS: '', RIDE: 'violet', LOCAL_CAR: 'accent' }

/** What was booked, in one line. */
export function bookingTitle(b) {
  if (b.type === 'BUS') return b.bus ? b.bus.busName || b.bus.route?.name || b.bus.busNumber : 'Bus no longer listed'
  if (b.type === 'RIDE') {
    if (!b.ride) return 'Shared ride'
    return `${b.ride.fromStop?.name || 'Pickup'} → ${b.ride.toStop?.name || 'Drop'}`
  }
  if (b.type === 'LOCAL_CAR') return b.localCar ? b.localCar.driverName : 'Local car'
  return label('bookingType', b.type)
}

export function bookingSubtitle(b) {
  if (b.type === 'BUS' && b.bus) return [b.bus.busNumber, b.bus.route?.name].filter(Boolean).join(' · ')
  if (b.type === 'RIDE' && b.ride) return `Shared ${label('vehicleType', b.ride.vehicleType).toLowerCase()} · departs ${formatDateTime(b.ride.departureAt)}`
  if (b.type === 'LOCAL_CAR' && b.localCar) return ['Local car', b.localCar.carModel, b.localCar.area].filter(Boolean).join(' · ')
  return label('bookingType', b.type)
}

/** Local-car fares are settled with the driver, so the stored amount is 0. */
export const isPayDriver = (b) => b.type === 'LOCAL_CAR' && !b.amount

export const canCancelBooking = (b) => b.status === 'PENDING' || b.status === 'CONFIRMED'

// ------------------------------------------------------------------ recent searches

/** Rebuild the /search URL a recent search came from. */
export function searchHref(s) {
  const p = new URLSearchParams()
  const byStops = s.searchType === 'ROUTE' || (!s.query && (s.fromText || s.toText))
  if (byStops) {
    if (s.fromText) p.set('from', s.fromText)
    if (s.toText) p.set('to', s.toText)
  } else {
    p.set('searchType', s.searchType)
    if (s.query) p.set('q', s.query)
  }
  return `/search?${p}`
}
