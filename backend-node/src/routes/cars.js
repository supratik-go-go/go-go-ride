// Local cars (call the driver) and Running Car shared rides (port of app/api/cars.py).
import { Router } from 'express'
import { isAdmin, optionalUser, requireAdmin, requireUser } from '../auth.js'
import { all, byId, get, insert, like, run, scalar, tx, update } from '../db.js'
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
function withReviews(car, reviews) {
  const { availabilityLabel, ...fields } = localCarOut(car)
  return { ...fields, reviews: reviews.map((r) => publicReview(reviewOut(r))), availabilityLabel }
}

const carOr404 = (id) => {
  const car = byId('LocalCar', id)
  if (!car) throw ApiError.notFound('Local car not found')
  return car
}

const assertCarOwner = (car, user) => {
  if (car.ownerId !== user.id && !isAdmin(user)) throw ApiError.forbidden()
}

// ================================================================ local cars

/** Local Cars Near You. Driver phone numbers are public by design - the app dials them from 'Call Driver'. */
router.get('/local-cars', (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const area = q.str('area')
  const verified = q.bool('verified')
  const minRating = q.float('minRating', null, { ge: 0, le: 5 })
  q.done()

  const where = ['status = ?']
  const params = ['ACTIVE']
  if (area) {
    where.push('area LIKE ?')
    params.push(like(area))
  }
  if (verified !== null) {
    where.push('verified IS ?')
    params.push(verified ? 1 : 0)
  }
  if (minRating !== null) {
    where.push('"ratingAvg" >= ?')
    params.push(minRating)
  }
  if (page.search) {
    where.push('("driverName" LIKE ? OR area LIKE ? OR "carModel" LIKE ?)')
    params.push(like(page.search), like(page.search), like(page.search))
  }
  const sqlWhere = where.join(' AND ')
  const total = Number(scalar(`SELECT count("LocalCar".id) FROM "LocalCar" WHERE ${sqlWhere}`, ...params) || 0)
  const rows = all(
    `SELECT * FROM "LocalCar" WHERE ${sqlWhere} ORDER BY verified DESC, "ratingAvg" DESC LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  okPage(res, rows.map(localCarOut), total, page)
})

// Registered before /local-cars/:id.
router.get('/local-cars/mine/list', requireUser, (req, res) => {
  const rows = all('SELECT * FROM "LocalCar" WHERE "ownerId" = ?', req.user.id)
  ok(res, rows.map(localCarOut))
})

router.get('/local-cars/:id', (req, res) => {
  const car = carOr404(req.params.id)
  const reviews = all('SELECT * FROM "Review" WHERE "localCarId" = ? ORDER BY "createdAt" DESC LIMIT 10', car.id)
  ok(res, withReviews(car, reviews))
})

const STATUS = ENUMS.recordStatus

const LocalCarBody = {
  driverName: required(str({ min: 2, max: 80 })),
  phone: required(phone()),
  area: required(str({ min: 2, max: 80 })),
  carModel: optional(str({ max: 80 })),
  carNumber: optional(str({ max: 20 })),
  availableFrom: str({ pattern: HHMM, default: '06:00' }),
  availableTo: str({ pattern: HHMM, default: '22:00' }),
  status: oneOf(STATUS, { default: 'ACTIVE' }),
}

router.post('/local-cars', requireUser, (req, res) => {
  const { data: b } = parseBody(req, LocalCarBody)
  const admin = isAdmin(req.user)
  const now = Date.now()
  const car = insert('LocalCar', {
    id: newId(),
    ownerId: req.user.id,
    driverName: b.driverName,
    phone: b.phone,
    area: b.area,
    carModel: b.carModel,
    carNumber: b.carNumber,
    photoUrl: null,
    availableFrom: b.availableFrom,
    availableTo: b.availableTo,
    ratingAvg: 0,
    ratingCount: 0,
    verified: admin ? 1 : 0,
    status: b.status,
    createdAt: now,
    updatedAt: now,
  })
  ok(
    res,
    localCarOut(byId('LocalCar', car.id)),
    admin ? 'Local car added' : 'Submitted - our team will verify your details',
    201,
  )
})

// LocalCarUpdateBody: no PhoneMixin here, so the phone is stored as sent (same as Python).
const LocalCarUpdateBody = {
  driverName: optional(str({ min: 2, max: 80 })),
  phone: optional(str()),
  area: optional(str()),
  carModel: optional(str()),
  carNumber: optional(str()),
  availableFrom: optional(str({ pattern: HHMM })),
  availableTo: optional(str({ pattern: HHMM })),
  status: optional(oneOf(STATUS)),
}

router.patch('/local-cars/:id', requireUser, (req, res) => {
  const { data, set } = parseBody(req, LocalCarUpdateBody)
  const car = carOr404(req.params.id)
  assertCarOwner(car, req.user)
  saveChanges(update, 'LocalCar', car, Object.fromEntries(set.map((k) => [k, data[k]])))
  ok(res, localCarOut(byId('LocalCar', car.id)), 'Local car updated')
})

router.post('/local-cars/:id/photo', requireUser, singleFile, (req, res) => {
  // FastAPI validates the File() parameter before the handler runs.
  if (!req.file) fail([{ field: 'file', message: REQUIRED }])
  const car = carOr404(req.params.id)
  assertCarOwner(car, req.user)
  const photoUrl = saveUpload(req.file, 'cars')
  saveChanges(update, 'LocalCar', car, { photoUrl })
  ok(res, localCarOut(byId('LocalCar', car.id)), 'Photo updated')
})

router.delete('/local-cars/:id', requireUser, (req, res) => {
  const car = carOr404(req.params.id)
  assertCarOwner(car, req.user)
  tx(() => {
    // SQLAlchemy's cascade="all, delete-orphan" removes the car's reviews first.
    run('DELETE FROM "Review" WHERE "localCarId" = ?', car.id)
    run('DELETE FROM "LocalCar" WHERE id = ?', car.id)
  })
  ok(res, null, 'Local car removed')
})

router.patch('/local-cars/:id/verify', requireAdmin, (req, res) => {
  const { data: b } = parseBody(req, { verified: required(bool()) })
  const car = carOr404(req.params.id)
  saveChanges(update, 'LocalCar', car, { verified: b.verified })
  ok(res, localCarOut(byId('LocalCar', car.id)), b.verified ? 'Driver verified' : 'Verification removed')
})

const ReviewBody = {
  rating: required(int({ ge: 1, le: 5 })),
  comment: optional(str({ max: 500 })),
}

router.post('/local-cars/:id/reviews', requireUser, (req, res) => {
  const { data: b } = parseBody(req, ReviewBody)
  const car = carOr404(req.params.id)
  const review = tx(() => {
    const row = insert('Review', {
      id: newId(),
      userId: req.user.id,
      busId: null,
      localCarId: car.id,
      rating: b.rating,
      comment: b.comment,
      createdAt: Date.now(),
    })
    const agg = get('SELECT avg(rating) AS avg, count(id) AS count FROM "Review" WHERE "localCarId" = ?', car.id)
    saveChanges(update, 'LocalCar', car, {
      ratingAvg: pyRound2(Number(agg.avg || 0)),
      ratingCount: Number(agg.count || 0),
    })
    return row
  })
  ok(res, reviewOut(byId('Review', review.id)), 'Thanks for your feedback', 201)
})

// ================================================================ rides (Running Car)

/** Feature status - drives the 'Coming Soon' card. COMING_SOON until at least one scheduled ride exists, then LIVE. */
router.get('/rides/status', (req, res) => {
  const active = Number(scalar('SELECT count("Ride".id) FROM "Ride" WHERE status IN (?, ?)', 'SCHEDULED', 'RUNNING') || 0)
  const waitlist = Number(scalar('SELECT count("RideWaitlist".id) FROM "RideWaitlist"') || 0)
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
router.post('/rides/notify-me', optionalUser, (req, res) => {
  const { data: b } = parseBody(req, NotifyMeBody)
  const user = req.user
  let entry = get('SELECT * FROM "RideWaitlist" WHERE phone = ?', b.phone)
  if (!entry) {
    entry = insert('RideWaitlist', { id: newId(), userId: user ? user.id : null, phone: b.phone, area: b.area, createdAt: Date.now() })
  } else {
    saveChanges(update, 'RideWaitlist', entry, { area: b.area, userId: user ? user.id : entry.userId }, { touch: false })
    entry = byId('RideWaitlist', entry.id)
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

router.get('/rides', (req, res) => {
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
    where.push('"fromStopId" = ?')
    params.push(fromStopId)
  }
  if (toStopId) {
    where.push('"toStopId" = ?')
    params.push(toStopId)
  }
  if (vehicleType) {
    where.push('"vehicleType" = ?')
    params.push(vehicleType)
  }
  if (date) {
    // datetime.fromisoformat(date): an offset, when given, is honoured here.
    const p = parseIsoParts(date)
    if (!p) fail([{ field: 'date', message: 'Input should be a valid date or datetime' }])
    const day = p.wall - p.offsetMs
    where.push('"departureAt" >= ?', '"departureAt" < ?')
    params.push(day, day + 86400000)
  } else {
    where.push('"departureAt" >= ?')
    params.push(Date.now())
  }
  const sqlWhere = where.join(' AND ')
  const total = Number(scalar(`SELECT count("Ride".id) FROM "Ride" WHERE ${sqlWhere}`, ...params) || 0)
  const rows = all(`SELECT * FROM "Ride" WHERE ${sqlWhere} ORDER BY "departureAt" LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, rows.map((r) => publicRide(rideOut(r))), total, page)
})

const rideOr404 = (id) => {
  const ride = byId('Ride', id)
  if (!ride) throw ApiError.notFound('Ride not found')
  return ride
}

router.get('/rides/:id', (req, res) => {
  ok(res, publicRide(rideOut(rideOr404(req.params.id))))
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

router.post('/rides', requireUser, (req, res) => {
  const { data: b } = parseBody(req, RideBody)
  if (b.fromStopId === b.toStopId) throw ApiError.badRequest('Pick two different stops')
  const now = Date.now()
  const ride = insert('Ride', {
    id: newId(),
    routeId: b.routeId,
    fromStopId: b.fromStopId,
    toStopId: b.toStopId,
    driverId: b.driverId || req.user.id,
    vehicleType: b.vehicleType,
    departureAt: departureMs(b.departureAt),
    totalSeats: b.totalSeats,
    availableSeats: b.totalSeats,
    farePerSeat: b.farePerSeat,
    status: 'SCHEDULED',
    createdAt: now,
    updatedAt: now,
  })
  ok(res, rideOut(byId('Ride', ride.id)), 'Ride published', 201)
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

router.patch('/rides/:id', requireUser, (req, res) => {
  const { data, set } = parseBody(req, RideUpdateBody)
  const ride = rideOr404(req.params.id)
  if (ride.driverId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden('You can only edit your own rides')

  const patch = {}
  for (const key of set) if (key !== 'departureAt') patch[key] = data[key]
  if (data.departureAt) patch.departureAt = departureMs(data.departureAt)
  saveChanges(update, 'Ride', ride, patch)
  ok(res, rideOut(byId('Ride', ride.id)), 'Ride updated')
})

router.delete('/rides/:id', requireAdmin, (req, res) => {
  const ride = rideOr404(req.params.id)
  run('DELETE FROM "Ride" WHERE id = ?', ride.id)
  ok(res, null, 'Ride removed')
})

export default router
