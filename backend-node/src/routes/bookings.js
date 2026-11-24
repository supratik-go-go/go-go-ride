// Bus, ride and local car bookings (port of app/api/bookings.py).
import { Router } from 'express'
import { isAdmin, requireAdmin, requireUser } from '../auth.js'
import { all, byId, day, get, insert, scalar, tx, update } from '../db.js'
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
async function view(booking, user) {
  const data = await bookingOut(booking)
  if (isAdmin(user)) return data
  data.bus = publicBus(data.bus)
  if (data.ride) data.ride = publicRide(data.ride)
  return data
}

const bookingOr404 = async (id) => {
  const booking = await byId('bookings', id)
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

router.get('/bookings', requireUser, async (req, res) => {
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
      where.push('user_id = ?')
      params.push(userId)
    }
  } else {
    where.push('user_id = ?')
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
    where.push('travel_date >= ?')
    params.push(day(from))
  }
  if (to !== null) {
    where.push('travel_date <= ?')
    params.push(day(to))
  }
  const sqlWhere = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT count(id) FROM bookings${sqlWhere}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM bookings${sqlWhere} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map((b) => view(b, req.user))), total, page)
})

router.get('/bookings/:id', requireUser, async (req, res) => {
  const booking = await bookingOr404(req.params.id)
  if (booking.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  ok(res, await view(booking, req.user))
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
router.post('/bookings', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, BookingCreateBody)
  const expected = { BUS: b.busId, RIDE: b.rideId, LOCAL_CAR: b.localCarId }[b.type]
  if (!expected) fail([{ field: 'body', message: 'Value error, Provide the id matching the booking type' }])
  const user = req.user

  const travelDate = startOfDayStrict(b.travelDate)
  // Python answers an impossible calendar date (2026-02-30) with a 500; a 400 is kinder.
  if (travelDate === null) fail([{ field: 'travelDate', message: 'Input should be a valid date' }])
  if (travelDate < todayMs()) throw ApiError.badRequest('Pick a future date')

  const booking = await tx(async () => {
    let amount = 0

    if (b.type === 'BUS') {
      const bus = await byId('buses', b.busId)
      if (!bus) throw ApiError.notFound('Bus not found')
      if (bus.status !== 'APPROVED') throw ApiError.badRequest('This bus is not active')
      if (await get('SELECT id FROM bus_off_days WHERE bus_id = ? AND off_date = ?', bus.id, day(travelDate))) {
        throw ApiError.badRequest('This bus is not running on the selected date')
      }
      if (bus.fare === null) throw ApiError.badRequest('The fare of this bus is not known yet, so it cannot be booked')
      amount = Number(bus.fare) * b.seats
    } else if (b.type === 'RIDE') {
      const ride = await byId('shared_rides', b.rideId)
      if (!ride) throw ApiError.notFound('Ride not found')
      if (ride.status !== 'SCHEDULED') throw ApiError.badRequest('This ride is no longer open')
      if (ride.seatsLeft < b.seats) throw ApiError.badRequest(`Only ${ride.seatsLeft} seats left on this ride`)
      amount = Number(ride.farePerSeat) * b.seats
      await saveChanges(update, 'shared_rides', ride, { seatsLeft: ride.seatsLeft - b.seats })
    } else {
      const car = await byId('local_vehicles', b.localCarId)
      if (!car) throw ApiError.notFound('Local car not found')
      if (car.status !== 'ACTIVE') throw ApiError.badRequest('This driver is not available')
      // Local cars are settled directly with the driver; fare agreed offline.
    }

    const now = Date.now()
    const row = await insert('bookings', {
      id: newId(),
      bookingNumber: randomRef('GGR'),
      userId: user.id,
      type: b.type,
      busId: b.busId,
      tripId: b.type === 'BUS' && b.busId ? (await get('SELECT id FROM bus_trips WHERE bus_id = ? ORDER BY trip_number LIMIT 1', b.busId))?.id : null,
      sharedRideId: b.rideId,
      localVehicleId: b.localCarId,
      travelDate,
      seats: b.seats,
      amount,
      paymentMethod: b.paymentMode,
      paymentStatus: b.paymentMode === 'CASH' ? 'PENDING' : 'PAID',
      status: 'CONFIRMED',
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
    })
    await notify({
      userId: user.id,
      title: 'Booking confirmed',
      message: `Your booking ${row.bookingNumber} for ${b.travelDate} is confirmed.`,
      type: 'USER',
      link: `/bookings/${row.id}`,
    })
    return row
  })

  ok(res, await view(await byId('bookings', booking.id), user), 'Booking confirmed', 201)
})

// ---------------------------------------------------------------- cancel / admin status

const CancelBody = { reason: optional(str({ max: 200 })) }

/** Cancel a booking: releases ride seats and marks a paid booking REFUNDED. */
router.patch('/bookings/:id/cancel', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, CancelBody)
  const booking = await bookingOr404(req.params.id)
  if (booking.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  if (booking.status === 'CANCELLED') throw ApiError.badRequest('This booking is already cancelled')
  if (booking.status === 'COMPLETED') throw ApiError.badRequest('A completed trip cannot be cancelled')

  await tx(async () => {
    if (booking.sharedRideId) {
      const ride = await byId('shared_rides', booking.sharedRideId)
      if (ride) await saveChanges(update, 'shared_rides', ride, { seatsLeft: ride.seatsLeft + booking.seats })
    }
    const patch = { status: 'CANCELLED', cancelReason: b.reason }
    if (booking.paymentStatus === 'PAID') patch.paymentStatus = 'REFUNDED'
    await saveChanges(update, 'bookings', booking, patch)
  })
  ok(res, await view(await byId('bookings', booking.id), req.user), 'Booking cancelled')
})

const BookingStatusBody = {
  status: required(oneOf(ENUMS.bookingStatus)),
  paymentStatus: optional(oneOf(ENUMS.paymentStatus)),
}

router.patch('/bookings/:id/status', requireAdmin, async (req, res) => {
  const { data: b } = parseBody(req, BookingStatusBody)
  const booking = await bookingOr404(req.params.id)
  const patch = { status: b.status }
  if (b.paymentStatus) patch.paymentStatus = b.paymentStatus
  await saveChanges(update, 'bookings', booking, patch)
  ok(res, await bookingOut(await byId('bookings', booking.id)), 'Booking updated')
})

export default router
