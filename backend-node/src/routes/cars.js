// Local cars (call the driver) and Running Car shared rides (port of app/api/cars.py).
import { Router } from 'express'
import { isAdmin, optionalUser, requireAdmin, requireUser } from '../auth.js'
import { all, at, byId, get, insert, like, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import {
  HHMM,
  Query,
  REQUIRED,
  bool,
  fail,
  float,
  int,
  oneOf,
  optional,
  parseBody,
  parseIsoParts,
  phone,
  pyRound2,
  required,
  saveChanges,
  str,
} from '../pyfields.js'
import { localCarOut, reviewOut, rideOut } from '../serialize.js'
import { publicReview, publicRide } from '../services/privacy.js'
import { singleFile, saveUpload } from '../uploads.js'
import { ENUMS } from '../validate.js'

const router = Router()

/** LocalCarDetails: the car plus its 10 most recent reviews (reviewer names only). */
async function withReviews(car, reviews) {
  const { availabilityLabel, ...fields } = localCarOut(car)
  return { ...fields, reviews: await Promise.all(reviews.map(async (r) => publicReview(await reviewOut(r)))), availabilityLabel }
}

const carOr404 = async (id) => {
  const car = await byId('local_vehicles', id)
  if (!car) throw ApiError.notFound('Local car not found')
  return car
}

const assertCarOwner = (car, user) => {
  if (car.ownerId !== user.id && !isAdmin(user)) throw ApiError.forbidden()
}

// ================================================================ local cars

const LOCAL_TYPES = ENUMS.localVehicleType

/** Local Cars Near You. Driver phone numbers are public by design - the app dials them from 'Call Driver'. */
router.get('/local-cars', async (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const area = q.str('area')
  const verified = q.bool('verified')
  const minRating = q.float('minRating', null, { ge: 0, le: 5 })
  const vehicleType = q.oneOf('vehicleType', LOCAL_TYPES)
  q.done()

  const where = ['status = ?']
  const params = ['ACTIVE']
  if (vehicleType) {
    where.push('vehicle_type = ?')
    params.push(vehicleType)
  }
  if (area) {
    where.push('area LIKE ?')
    params.push(like(area))
  }
  if (verified !== null) {
    where.push('is_verified = ?')
    params.push(verified ? 1 : 0)
  }
  if (minRating !== null) {
    where.push('rating_average >= ?')
    params.push(minRating)
  }
  if (page.search) {
    where.push('(driver_name LIKE ? OR area LIKE ? OR vehicle_model LIKE ?)')
    params.push(like(page.search), like(page.search), like(page.search))
  }
  const sqlWhere = where.join(' AND ')
  const total = Number((await scalar(`SELECT count(id) FROM local_vehicles WHERE ${sqlWhere}`, ...params)) || 0)
  const rows = await all(
    `SELECT * FROM local_vehicles WHERE ${sqlWhere} ORDER BY is_verified DESC, rating_average DESC, created_at, id LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  okPage(res, rows.map(localCarOut), total, page)
})

// Registered before /local-cars/:id.
router.get('/local-cars/mine/list', requireUser, async (req, res) => {
  const rows = await all('SELECT * FROM local_vehicles WHERE owner_id = ? ORDER BY created_at, id', req.user.id)
  ok(res, rows.map(localCarOut))
})

router.get('/local-cars/:id', async (req, res) => {
  const car = await carOr404(req.params.id)
  const reviews = await all('SELECT * FROM reviews WHERE local_vehicle_id = ? AND is_hidden = 0 ORDER BY created_at DESC, id DESC LIMIT 10', car.id)
  ok(res, await withReviews(car, reviews))
})

const STATUS = ENUMS.recordStatus

const LocalCarBody = {
  driverName: required(str({ min: 2, max: 80 })),
  phone: required(phone()),
  area: required(str({ min: 2, max: 80 })),
  vehicleType: oneOf(LOCAL_TYPES, { default: 'CAR' }),
  carModel: optional(str({ max: 80 })),
  carNumber: optional(str({ max: 20 })),
  availableFrom: str({ pattern: HHMM, default: '06:00' }),
  availableTo: str({ pattern: HHMM, default: '22:00' }),
  status: oneOf(STATUS, { default: 'ACTIVE' }),
}

router.post('/local-cars', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, LocalCarBody)
  const admin = isAdmin(req.user)
  const now = Date.now()
  const car = await insert('local_vehicles', {
    id: newId(),
    ownerId: req.user.id,
    driverName: b.driverName,
    phone: b.phone,
    area: b.area,
    vehicleType: b.vehicleType,
    vehicleModel: b.carModel,
    vehicleNumber: b.carNumber,
    pictureUrl: null,
    availableFrom: b.availableFrom,
    availableUntil: b.availableTo,
    ratingAverage: 0,
    ratingCount: 0,
    isVerified: admin ? 1 : 0,
    status: b.status,
    createdAt: now,
    updatedAt: now,
  })
  ok(
    res,
    localCarOut(await byId('local_vehicles', car.id)),
    admin ? 'Local car added' : 'Submitted - our team will verify your details',
    201,
  )
})

// LocalCarUpdateBody: no PhoneMixin here, so the phone is stored as sent (same as Python).
const LocalCarUpdateBody = {
  driverName: optional(str({ min: 2, max: 80 })),
  phone: optional(str()),
  area: optional(str()),
  vehicleType: optional(oneOf(LOCAL_TYPES)),
  carModel: optional(str()),
  carNumber: optional(str()),
  availableFrom: optional(str({ pattern: HHMM })),
  availableTo: optional(str({ pattern: HHMM })),
  status: optional(oneOf(STATUS)),
}

// Request field -> column (camelCase) where the names differ.
const CAR_COLUMNS = { carModel: 'vehicleModel', carNumber: 'vehicleNumber', availableTo: 'availableUntil' }

router.patch('/local-cars/:id', requireUser, async (req, res) => {
  const { data, set } = parseBody(req, LocalCarUpdateBody)
  const car = await carOr404(req.params.id)
  assertCarOwner(car, req.user)
  await saveChanges(update, 'local_vehicles', car, Object.fromEntries(set.map((k) => [CAR_COLUMNS[k] || k, data[k]])))
  ok(res, localCarOut(await byId('local_vehicles', car.id)), 'Local car updated')
})

router.post('/local-cars/:id/photo', requireUser, singleFile, async (req, res) => {
  // FastAPI validates the File() parameter before the handler runs.
  if (!req.file) fail([{ field: 'file', message: REQUIRED }])
  const car = await carOr404(req.params.id)
  assertCarOwner(car, req.user)
  const pictureUrl = saveUpload(req.file, 'cars')
  await saveChanges(update, 'local_vehicles', car, { pictureUrl })
  ok(res, localCarOut(await byId('local_vehicles', car.id)), 'Photo updated')
})

router.delete('/local-cars/:id', requireUser, async (req, res) => {
  const car = await carOr404(req.params.id)
  assertCarOwner(car, req.user)
  await tx(async () => {
    // SQLAlchemy's cascade="all, delete-orphan" removes the car's reviews first.
    await run('DELETE FROM reviews WHERE local_vehicle_id = ?', car.id)
    await run('DELETE FROM local_vehicles WHERE id = ?', car.id)
  })
  ok(res, null, 'Local car removed')
})

router.patch('/local-cars/:id/verify', requireAdmin, async (req, res) => {
  const { data: b } = parseBody(req, { verified: required(bool()) })
  const car = await carOr404(req.params.id)
  await saveChanges(update, 'local_vehicles', car, { isVerified: b.verified })
  ok(res, localCarOut(await byId('local_vehicles', car.id)), b.verified ? 'Driver verified' : 'Verification removed')
})

const ReviewBody = {
  rating: required(int({ ge: 1, le: 5 })),
  comment: optional(str({ max: 500 })),
}

router.post('/local-cars/:id/reviews', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, ReviewBody)
  const car = await carOr404(req.params.id)
  const review = await tx(async () => {
    const row = await insert('reviews', {
      id: newId(),
      userId: req.user.id,
      busId: null,
      localVehicleId: car.id,
      rating: b.rating,
      comment: b.comment,
      createdAt: Date.now(),
    })
    const agg = await get('SELECT avg(rating) AS avg, count(id) AS count FROM reviews WHERE local_vehicle_id = ?', car.id)
    await saveChanges(update, 'local_vehicles', car, {
      ratingAverage: pyRound2(Number(agg.avg || 0)),
      ratingCount: Number(agg.count || 0),
    })
    return row
  })
  ok(res, await reviewOut(await byId('reviews', review.id)), 'Thanks for your feedback', 201)
})

// ================================================================ rides (Running Car)

/** Feature status - drives the 'Coming Soon' card. COMING_SOON until at least one scheduled ride exists, then LIVE. */
router.get('/rides/status', async (req, res) => {
  const active = Number((await scalar('SELECT count(id) FROM shared_rides WHERE status IN (?, ?)', 'SCHEDULED', 'RUNNING')) || 0)
  const waitlist = Number((await scalar('SELECT count(id) FROM ride_waitlist')) || 0)
  ok(res, {
    feature: 'RUNNING_CAR',
    status: active > 0 ? 'LIVE' : 'COMING_SOON',
    activeRides: active,
    waitlistCount: waitlist,
    tagline: 'Book shared rides on your route. Affordable, faster and smarter.',
  })
})

const NotifyMeBody = {
  phone: required(phone()),
  area: optional(str({ max: 80 })),
}

/** Join the launch waitlist - the 'Notify Me' button. */
router.post('/rides/notify-me', optionalUser, async (req, res) => {
  const { data: b } = parseBody(req, NotifyMeBody)
  const user = req.user
  let entry = await get('SELECT * FROM ride_waitlist WHERE phone = ?', b.phone)
  if (!entry) {
    entry = await insert('ride_waitlist', { id: newId(), userId: user ? user.id : null, phone: b.phone, area: b.area, createdAt: Date.now() })
  } else {
    await saveChanges(update, 'ride_waitlist', entry, { area: b.area, userId: user ? user.id : entry.userId }, { touch: false })
    entry = await byId('ride_waitlist', entry.id)
  }
  ok(res, { id: entry.id, phone: entry.phone, area: entry.area ?? null }, 'We will notify you as soon as Running Car goes live', 201)
})

const VEHICLES = ENUMS.vehicleType
const RIDE_STATUS = ENUMS.rideStatus

/**
 * Python's datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None):
 * the written clock time is kept and any offset is dropped (not converted).
 * Python answers an unparseable value with a 500; here it is a 400.
 */
function departureMs(value, field = 'departureAt') {
  const p = parseIsoParts(value)
  if (!p) fail([{ field, message: 'Input should be a valid datetime' }])
  return p.wall
}

router.get('/rides', async (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const fromStopId = q.str('fromStopId')
  const toStopId = q.str('toStopId')
  const date = q.str('date')
  const vehicleType = q.oneOf('vehicleType', VEHICLES)
  const status = q.oneOf('status', RIDE_STATUS)
  q.done()

  const where = ['status = ?']
  const params = [status || 'SCHEDULED']
  if (fromStopId) {
    where.push('from_stop_id = ?')
    params.push(fromStopId)
  }
  if (toStopId) {
    where.push('to_stop_id = ?')
    params.push(toStopId)
  }
  if (vehicleType) {
    where.push('vehicle_type = ?')
    params.push(vehicleType)
  }
  if (date) {
    // datetime.fromisoformat(date): an offset, when given, is honoured here.
    const p = parseIsoParts(date)
    if (!p) fail([{ field: 'date', message: 'Input should be a valid date or datetime' }])
    const dayStart = p.wall - p.offsetMs
    where.push('departs_at >= ?', 'departs_at < ?')
    params.push(at(dayStart), at(dayStart + 86400000))
  } else {
    where.push('departs_at >= ?')
    params.push(at(Date.now()))
  }
  const sqlWhere = where.join(' AND ')
  const total = Number((await scalar(`SELECT count(id) FROM shared_rides WHERE ${sqlWhere}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM shared_rides WHERE ${sqlWhere} ORDER BY departs_at, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map(async (r) => publicRide(await rideOut(r)))), total, page)
})

const rideOr404 = async (id) => {
  const ride = await byId('shared_rides', id)
  if (!ride) throw ApiError.notFound('Ride not found')
  return ride
}

router.get('/rides/:id', async (req, res) => {
  ok(res, publicRide(await rideOut(await rideOr404(req.params.id))))
})

const RideBody = {
  fromStopId: required(str()),
  toStopId: required(str()),
  routeId: optional(str()),
  driverId: optional(str()),
  vehicleType: oneOf(VEHICLES, { default: 'CAR' }),
  departureAt: required(str()),
  totalSeats: int({ ge: 1, le: 8, default: 4 }),
  farePerSeat: required(float({ ge: 0 })),
}

router.post('/rides', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, RideBody)
  if (b.fromStopId === b.toStopId) throw ApiError.badRequest('Pick two different stops')
  const now = Date.now()
  const ride = await insert('shared_rides', {
    id: newId(),
    routeId: b.routeId,
    fromStopId: b.fromStopId,
    toStopId: b.toStopId,
    driverId: b.driverId || req.user.id,
    vehicleType: b.vehicleType,
    departsAt: departureMs(b.departureAt),
    totalSeats: b.totalSeats,
    seatsLeft: b.totalSeats,
    farePerSeat: b.farePerSeat,
    status: 'SCHEDULED',
    createdAt: now,
    updatedAt: now,
  })
  ok(res, await rideOut(await byId('shared_rides', ride.id)), 'Ride published', 201)
})

const RideUpdateBody = {
  fromStopId: optional(str()),
  toStopId: optional(str()),
  routeId: optional(str()),
  driverId: optional(str()),
  vehicleType: optional(oneOf(VEHICLES)),
  departureAt: optional(str()),
  totalSeats: optional(int({ ge: 1, le: 8 })),
  farePerSeat: optional(float({ ge: 0 })),
  status: optional(oneOf(RIDE_STATUS)),
}

router.patch('/rides/:id', requireUser, async (req, res) => {
  const { data, set } = parseBody(req, RideUpdateBody)
  const ride = await rideOr404(req.params.id)
  if (ride.driverId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden('You can only edit your own rides')

  const patch = {}
  for (const key of set) if (key !== 'departureAt') patch[key] = data[key]
  if (data.departureAt) patch.departsAt = departureMs(data.departureAt)
  await saveChanges(update, 'shared_rides', ride, patch)
  ok(res, await rideOut(await byId('shared_rides', ride.id)), 'Ride updated')
})

router.delete('/rides/:id', requireAdmin, async (req, res) => {
  const ride = await rideOr404(req.params.id)
  await run('DELETE FROM shared_rides WHERE id = ?', ride.id)
  ok(res, null, 'Ride removed')
})

export default router
