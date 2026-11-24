// Bus, ride and local car bookings (port of app/api/bookings.py).
import { Router } from 'express'
import { isAdmin, requireAdmin, requireUser } from '../auth.js'
import { all, byId, get, insert, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId, randomRef } from '../ids.js'
import {
  DATE_ONLY,
  Query,
  fail,
  int,
  oneOf,
  optional,
  parseBody,
  required,
  saveChanges,
  startOfDayStrict,
  str,
} from '../pyfields.js'
import { bookingOut } from '../serialize.js'
import { notify } from '../services/common.js'
import { publicBus, publicRide } from '../services/privacy.js'
import { todayMs } from '../time.js'
import { ENUMS } from '../validate.js'

const router = Router()

/** Admins see everything; passengers don't get the bus owner's or driver's personal details. */
function view(booking, user) {
  const data = bookingOut(booking)
  if (isAdmin(user)) return data
  data.bus = publicBus(data.bus)
  if (data.ride) data.ride = publicRide(data.ride)
  return data
}

const bookingOr404 = (id) => {
  const booking = byId('Booking', id)
  if (!booking) throw ApiError.notFound('Booking not found')
  return booking
}

/** start_of_day() on a query value; Python answers garbage with a 500, here it is a 400. */
function dayParam(q, name) {
  const raw = q.str(name)
  if (!raw) return null
  const ms = startOfDayStrict(raw)
  if (ms === null) q.errors.push({ field: name, message: 'Input should be a valid date or datetime' })
  return ms
}

// ---------------------------------------------------------------- My Bookings (admins see every booking)

router.get('/bookings', requireUser, (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const status = q.oneOf('status', ENUMS.bookingStatus)
  const type = q.oneOf('type', ENUMS.bookingType)
  const from = dayParam(q, 'from')
  const to = dayParam(q, 'to')
  const userId = q.str('userId')
  q.done()

  const where = []
  const params = []
  if (isAdmin(req.user)) {
    if (userId) {
      where.push('"userId" = ?')
      params.push(userId)
    }
  } else {
    where.push('"userId" = ?')
    params.push(req.user.id)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (type) {
    where.push('type = ?')
    params.push(type)
  }
  if (from !== null) {
    where.push('"travelDate" >= ?')
    params.push(from)
  }
  if (to !== null) {
    where.push('"travelDate" <= ?')
    params.push(to)
  }
  const sqlWhere = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number(scalar(`SELECT count("Booking".id) FROM "Booking"${sqlWhere}`, ...params) || 0)
  const rows = all(`SELECT * FROM "Booking"${sqlWhere} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, rows.map((b) => view(b, req.user)), total, page)
})

router.get('/bookings/:id', requireUser, (req, res) => {
  const booking = bookingOr404(req.params.id)
  if (booking.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  ok(res, view(booking, req.user))
})

// ---------------------------------------------------------------- book

const BookingCreateBody = {
  type: required(oneOf(ENUMS.bookingType)),
  busId: optional(str()),
  rideId: optional(str()),
  localCarId: optional(str()),
  travelDate: required(str({ pattern: DATE_ONLY })),
  seats: int({ ge: 1, le: 10, default: 1 }),
  paymentMode: oneOf(ENUMS.paymentMode, { default: 'CASH' }),
}

/** Book a bus seat, a shared ride, or a local car. Bus bookings re-check non-operating dates; ride bookings decrement seats. */
router.post('/bookings', requireUser, (req, res) => {
  const { data: b } = parseBody(req, BookingCreateBody)
  const expected = { BUS: b.busId, RIDE: b.rideId, LOCAL_CAR: b.localCarId }[b.type]
  if (!expected) fail([{ field: 'body', message: 'Value error, Provide the id matching the booking type' }])
  const user = req.user

  const travelDate = startOfDayStrict(b.travelDate)
  // Python answers an impossible calendar date (2026-02-30) with a 500; a 400 is kinder.
  if (travelDate === null) fail([{ field: 'travelDate', message: 'Input should be a valid date' }])
  if (travelDate < todayMs()) throw ApiError.badRequest('Pick a future date')

  const booking = tx(() => {
    let amount = 0

    if (b.type === 'BUS') {
      const bus = byId('Bus', b.busId)
      if (!bus) throw ApiError.notFound('Bus not found')
      if (bus.status !== 'APPROVED') throw ApiError.badRequest('This bus is not active')
      if (get('SELECT id FROM "BusException" WHERE "busId" = ? AND date = ?', bus.id, travelDate)) {
        throw ApiError.badRequest('This bus is not running on the selected date')
      }
      amount = Number(bus.fare) * b.seats
    } else if (b.type === 'RIDE') {
      const ride = byId('Ride', b.rideId)
      if (!ride) throw ApiError.notFound('Ride not found')
      if (ride.status !== 'SCHEDULED') throw ApiError.badRequest('This ride is no longer open')
      if (ride.availableSeats < b.seats) throw ApiError.badRequest(`Only ${ride.availableSeats} seats left on this ride`)
      amount = Number(ride.farePerSeat) * b.seats
      saveChanges(update, 'Ride', ride, { availableSeats: ride.availableSeats - b.seats })
    } else {
      const car = byId('LocalCar', b.localCarId)
      if (!car) throw ApiError.notFound('Local car not found')
      if (car.status !== 'ACTIVE') throw ApiError.badRequest('This driver is not available')
      // Local cars are settled directly with the driver; fare agreed offline.
    }

    const now = Date.now()
    const row = insert('Booking', {
      id: newId(),
      bookingRef: randomRef('GGR'),
      userId: user.id,
      type: b.type,
      busId: b.busId,
      rideId: b.rideId,
      localCarId: b.localCarId,
      travelDate,
      seats: b.seats,
      amount,
      paymentMode: b.paymentMode,
      paymentStatus: b.paymentMode === 'CASH' ? 'PENDING' : 'PAID',
      status: 'CONFIRMED',
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
    })
    notify({
      userId: user.id,
      title: 'Booking confirmed',
      message: `Your booking ${row.bookingRef} for ${b.travelDate} is confirmed.`,
      type: 'USER',
      link: `/bookings/${row.id}`,
    })
    return row
  })

  ok(res, view(byId('Booking', booking.id), user), 'Booking confirmed', 201)
})

// ---------------------------------------------------------------- cancel / admin status

const CancelBody = { reason: optional(str({ max: 200 })) }

/** Cancel a booking: releases ride seats and marks a paid booking REFUNDED. */
router.patch('/bookings/:id/cancel', requireUser, (req, res) => {
  const { data: b } = parseBody(req, CancelBody)
  const booking = bookingOr404(req.params.id)
  if (booking.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  if (booking.status === 'CANCELLED') throw ApiError.badRequest('This booking is already cancelled')
  if (booking.status === 'COMPLETED') throw ApiError.badRequest('A completed trip cannot be cancelled')

  tx(() => {
    if (booking.rideId) {
      const ride = byId('Ride', booking.rideId)
      if (ride) saveChanges(update, 'Ride', ride, { availableSeats: ride.availableSeats + booking.seats })
    }
    const patch = { status: 'CANCELLED', cancelReason: b.reason }
    if (booking.paymentStatus === 'PAID') patch.paymentStatus = 'REFUNDED'
    saveChanges(update, 'Booking', booking, patch)
  })
  ok(res, view(byId('Booking', booking.id), req.user), 'Booking cancelled')
})

const BookingStatusBody = {
  status: required(oneOf(ENUMS.bookingStatus)),
  paymentStatus: optional(oneOf(ENUMS.paymentStatus)),
}

router.patch('/bookings/:id/status', requireAdmin, (req, res) => {
  const { data: b } = parseBody(req, BookingStatusBody)
  const booking = bookingOr404(req.params.id)
  const patch = { status: b.status }
  if (b.paymentStatus) patch.paymentStatus = b.paymentStatus
  saveChanges(update, 'Booking', booking, patch)
  ok(res, bookingOut(byId('Booking', booking.id)), 'Booking updated')
})

export default router
