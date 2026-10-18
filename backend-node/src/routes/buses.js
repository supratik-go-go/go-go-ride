// Search, details, owner submission and verification documents (port of app/api/buses.py).
import { Router } from 'express'
import { isAdmin, optionalUser, requireOwner, requireUser } from '../auth.js'
import { all, byId, get, insert, run, scalar, tx } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { busById, busDocumentOut, busExceptionOut, busOut, reviewOut } from '../serialize.js'
import * as busService from '../services/buses.js'
import { logActivity, notify } from '../services/common.js'
import {
  bool,
  enumOf,
  field,
  float,
  int,
  list,
  model,
  optional,
  pageParams,
  parseBody,
  q,
  raise,
  str,
  withDefault,
} from '../services/pydantic.js'
import { publicBus, publicReview } from '../services/privacy.js'
import { dateOnly } from '../time.js'
import { singleFile, saveUpload } from '../uploads.js'
import { ENUMS } from '../validate.js'

const router = Router()

// ---------------------------------------------------------------- request bodies (schemas/requests.py)

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const hhmm = str({ pattern: HHMM })

const StopageBody = model(
  {
    stopId: optional(str()),
    stopName: optional(str({ min: 2 })),
    arrivalTime: hhmm,
    departureTime: hhmm,
    distanceKm: withDefault(float(), 0),
  },
  { after: (v) => (!v.stopId && !v.stopName ? 'Each stopage needs either stopId or stopName' : null) },
)

const BusCreateBody = model({
  busNumber: str({ min: 4, max: 20, upper: true }),
  busName: optional(str({ min: 2, max: 80 })),
  type: enumOf(ENUMS.busType),
  category: enumOf(ENUMS.busCategory),
  operator: optional(str({ max: 80 })),
  totalSeats: withDefault(int({ ge: 1, le: 120 }), 45),
  fare: withDefault(float({ ge: 0 }), 0),
  contactNumber: str({ min: 6, max: 20 }),
  contactStart: withDefault(hhmm, '06:00'),
  contactEnd: withDefault(hhmm, '22:00'),
  serviceDays: list(enumOf(ENUMS.day), { min: 1 }),
  routeId: optional(str()),
  stopages: list(StopageBody, { min: 2 }),
})

const BusUpdateBody = model({
  busName: optional(str()),
  type: optional(enumOf(ENUMS.busType)),
  category: optional(enumOf(ENUMS.busCategory)),
  operator: optional(str()),
  totalSeats: optional(int({ ge: 1, le: 120 })),
  fare: optional(float({ ge: 0 })),
  contactNumber: optional(str()),
  contactStart: optional(hhmm),
  contactEnd: optional(hhmm),
  serviceDays: optional(list(enumOf(ENUMS.day))),
  routeId: optional(str()),
  stopages: optional(list(StopageBody, { min: 2 })),
})

const BusExceptionBody = model({
  date: str({ pattern: DATE_ONLY }),
  reason: optional(str({ max: 200 })),
})

const ReviewBody = model({
  rating: int({ ge: 1, le: 5 }),
  comment: optional(str({ max: 500 })),
})

/** ",".join(dict.fromkeys(days)) - de-duplicated, first occurrence order. */
const serviceDaysCsv = (days) => [...new Set(days)].join(',')

// ---------------------------------------------------------------- search

router.get('/buses/search', optionalUser, (req, res) => {
  const d = []
  const query = req.query
  const from = q(d, query, 'from', str())
  const to = q(d, query, 'to', str())
  const fromStopId = q(d, query, 'fromStopId', str())
  const toStopId = q(d, query, 'toStopId', str())
  const text = q(d, query, 'q', str())
  const searchType = q(d, query, 'searchType', enumOf(ENUMS.searchType), { fallback: 'ROUTE' })
  const date = q(d, query, 'date', str())
  const time = q(d, query, 'time', str())
  const type = q(d, query, 'type', enumOf(ENUMS.busType))
  const category = q(d, query, 'category', enumOf(ENUMS.busCategory))
  const maxFare = q(d, query, 'maxFare', float())
  const sort = q(d, query, 'sort', str({ pattern: /^(departure|fare|duration|rating)$/ }), { fallback: 'departure' })
  const includeNotRunning = q(d, query, 'includeNotRunning', bool(), { fallback: true })
  raise(d)

  const result = busService.searchBuses({
    fromText: from,
    toText: to,
    fromStopId,
    toStopId,
    q: text,
    searchType,
    date,
    time,
    busType: type,
    category,
    maxFare,
    sort,
    includeNotRunning,
  })

  if (req.user) {
    insert('RecentSearch', {
      id: newId(),
      userId: req.user.id,
      searchType,
      fromText: from,
      toText: to,
      query: text,
      searchedAt: Date.now(),
    })
  }

  ok(res, result, `${result.total} buses found`)
})

// ---------------------------------------------------------------- lists

router.get('/buses', optionalUser, (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const status = q(d, req.query, 'status', enumOf(ENUMS.busStatus))
  const type = q(d, req.query, 'type', enumOf(ENUMS.busType))
  const category = q(d, req.query, 'category', enumOf(ENUMS.busCategory))
  const routeId = q(d, req.query, 'routeId', str())
  const ownerId = q(d, req.query, 'ownerId', str())
  raise(d)

  const admin = isAdmin(req.user)
  const where = []
  const params = []
  // Passengers only ever see approved buses.
  const effectiveStatus = admin ? status : 'APPROVED'
  if (effectiveStatus) {
    where.push('"Bus".status = ?')
    params.push(effectiveStatus)
  }
  if (type) {
    where.push('"Bus".type = ?')
    params.push(type)
  }
  if (category) {
    where.push('"Bus".category = ?')
    params.push(category)
  }
  if (routeId) {
    where.push('"Bus"."routeId" = ?')
    params.push(routeId)
  }
  if (ownerId) {
    where.push('"Bus"."ownerId" = ?')
    params.push(ownerId)
  }
  if (page.search) {
    const [sql, p] = busService.searchFilter(page.search)
    where.push(sql)
    params.push(...p)
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const total = Number(scalar(`SELECT COUNT("Bus".id) FROM "Bus"${clause}`, ...params) || 0)
  let items = all(`SELECT * FROM "Bus"${clause} ORDER BY "Bus"."createdAt" DESC LIMIT ? OFFSET ?`, ...params, page.limit, page.skip).map(busOut)
  // Owners' personal contact details and ownership documents are not public.
  if (!admin) items = items.map(publicBus)
  okPage(res, items, total, page)
})

router.get('/buses/mine/list', requireUser, (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const total = Number(scalar('SELECT COUNT("Bus".id) FROM "Bus" WHERE "Bus"."ownerId" = ?', req.user.id) || 0)
  const items = all(
    'SELECT * FROM "Bus" WHERE "Bus"."ownerId" = ? ORDER BY "Bus"."createdAt" DESC LIMIT ? OFFSET ?',
    req.user.id,
    page.limit,
    page.skip,
  ).map(busOut)
  okPage(res, items, total, page)
})

// ---------------------------------------------------------------- details

router.get('/buses/:busId', optionalUser, (req, res) => {
  const date = q([], req.query, 'date', str())
  const data = busService.busDetails(req.params.busId, date)
  if (isAdmin(req.user) || (req.user && req.user.id === data.ownerId)) return ok(res, data)
  // Everyone else: approved buses only, without the owner's personal details.
  if (data.status !== 'APPROVED') throw ApiError.notFound('Bus not found')
  ok(res, publicBus(data))
})

// ---------------------------------------------------------------- owner submission

router.post('/buses', requireOwner, (req, res) => {
  const b = parseBody(req, BusCreateBody)
  const user = req.user
  if (get('SELECT id FROM "Bus" WHERE "busNumber" = ?', b.busNumber)) {
    throw ApiError.conflict('This bus number is already registered')
  }

  const busId = tx(() => {
    const stopIds = b.stopages.map((s) => busService.resolveStopId(s))
    const now = Date.now()
    const bus = insert('Bus', {
      id: newId(),
      busNumber: b.busNumber,
      busName: b.busName,
      ownerId: user.id,
      routeId: b.routeId,
      type: b.type,
      category: b.category,
      operator: b.operator,
      totalSeats: b.totalSeats,
      fare: b.fare,
      contactNumber: b.contactNumber,
      contactStart: b.contactStart,
      contactEnd: b.contactEnd,
      serviceDays: serviceDaysCsv(b.serviceDays),
      imageUrl: null,
      status: 'PENDING',
      rejectionReason: null,
      ratingAvg: 0,
      ratingCount: 0,
      submittedAt: now,
      reviewedAt: null,
      reviewedById: null,
      createdAt: now,
      updatedAt: now,
    })
    busService.insertStopages(bus.id, b.stopages, stopIds)
    logActivity({
      actorId: user.id,
      action: 'BUS_SUBMITTED',
      entityType: 'BUS',
      entityId: bus.id,
      message: `New bus request from ${user.name} (${bus.busNumber})`,
    })
    return bus.id
  })

  ok(res, busById(busId), 'Bus submitted for verification. You will be notified once it is approved.', 201)
})

const UPDATABLE = ['busName', 'type', 'category', 'operator', 'totalSeats', 'fare', 'contactNumber', 'contactStart', 'contactEnd', 'routeId']

router.patch('/buses/:busId', requireUser, (req, res) => {
  const b = parseBody(req, BusUpdateBody)
  const admin = isAdmin(req.user)
  const bus = admin ? byId('Bus', req.params.busId) : busService.assertOwnership(req.params.busId, req.user.id)
  if (!bus) throw ApiError.notFound('Bus not found')

  // Only columns whose value really changes are written (and only then does updatedAt move).
  const patch = {}
  const set = (key, value) => {
    if (bus[key] !== value) patch[key] = value
  }
  for (const key of UPDATABLE) if (b.$provided.has(key)) set(key, b[key])
  if (b.serviceDays !== null) set('serviceDays', serviceDaysCsv(b.serviceDays))

  // An owner editing an approved bus sends it back through verification.
  if (!admin && bus.status === 'APPROVED') {
    set('status', 'UNDER_REVIEW')
    set('reviewedAt', null)
    set('reviewedById', null)
  }

  tx(() => {
    if (b.stopages !== null) busService.replaceStopages(bus.id, b.stopages)
    if (Object.keys(patch).length) {
      // update() skips undefined; null must be written, so build the statement here.
      const keys = Object.keys(patch)
      run(
        `UPDATE "Bus" SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, "updatedAt" = ? WHERE id = ?`,
        ...keys.map((k) => patch[k]),
        Date.now(),
        bus.id,
      )
    }
  })
  ok(res, busById(bus.id), 'Bus updated')
})

router.delete('/buses/:busId', requireUser, (req, res) => {
  const bus = isAdmin(req.user) ? byId('Bus', req.params.busId) : busService.assertOwnership(req.params.busId, req.user.id)
  if (!bus) throw ApiError.notFound('Bus not found')
  // Stopages, documents, exceptions, reviews and alarms go with it (ON DELETE CASCADE);
  // a bus with bookings is refused by the foreign key (400 INVALID_REFERENCE), as in Python.
  run('DELETE FROM "Bus" WHERE id = ?', bus.id)
  ok(res, null, 'Bus removed')
})

// ---------------------------------------------------------------- documents

router.post('/buses/:busId/documents', requireUser, singleFile, (req, res) => {
  const d = []
  const form = req.is('multipart/form-data') && req.body ? req.body : {}
  const rawDocType = Array.isArray(form.docType) ? form.docType[form.docType.length - 1] : form.docType
  const docType = field(d, 'docType', rawDocType, enumOf(ENUMS.docType), { required: true })
  if (!req.file) d.push({ field: 'file', message: 'Field required' })
  raise(d)

  const busId = req.params.busId
  if (!isAdmin(req.user)) busService.assertOwnership(busId, req.user.id)
  else if (!byId('Bus', busId)) throw ApiError.notFound('Bus not found')

  const url = saveUpload(req.file, 'documents')
  const doc = insert('BusDocument', {
    id: newId(),
    busId,
    docType,
    fileUrl: url,
    originalName: req.file.originalname ?? null,
    uploadedAt: Date.now(),
  })
  ok(res, busDocumentOut(doc), 'Document uploaded', 201)
})

// ---------------------------------------------------------------- non-operating dates

router.post('/buses/:busId/exceptions', requireUser, (req, res) => {
  const b = parseBody(req, BusExceptionBody)
  const busId = req.params.busId
  const admin = isAdmin(req.user)
  if (!admin) busService.assertOwnership(busId, req.user.id)
  else if (!byId('Bus', busId)) throw ApiError.notFound('Bus not found')

  const exception = busService.addException(busId, { date: b.date, reason: b.reason, enforceNotice: !admin })

  // Warn everyone holding an alarm for that bus on that date.
  const bus = byId('Bus', busId)
  const alarms = all('SELECT * FROM "Alarm" WHERE "busId" = ? AND "alarmDate" = ? AND status = ?', busId, exception.date, 'ACTIVE')
  tx(() => {
    for (const alarm of alarms) {
      notify({
        userId: alarm.userId,
        title: 'Bus not running',
        message: `${bus.busNumber} will not operate on ${dateOnly(exception.date)}. Please plan an alternative.`,
        type: 'ALARM',
      })
    }
  })

  ok(res, busExceptionOut(exception), 'Non-operating date recorded', 201)
})

router.delete('/buses/:busId/exceptions/:exceptionId', requireUser, (req, res) => {
  const { busId, exceptionId } = req.params
  if (!isAdmin(req.user)) busService.assertOwnership(busId, req.user.id)
  run('DELETE FROM "BusException" WHERE id = ? AND "busId" = ?', exceptionId, busId)
  ok(res, null, 'Non-operating date removed')
})

// ---------------------------------------------------------------- reviews

router.get('/buses/:busId/reviews', (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const busId = req.params.busId
  const total = Number(scalar('SELECT COUNT("Review".id) FROM "Review" WHERE "Review"."busId" = ?', busId) || 0)
  const items = all(
    'SELECT * FROM "Review" WHERE "Review"."busId" = ? ORDER BY "Review"."createdAt" DESC LIMIT ? OFFSET ?',
    busId,
    page.limit,
    page.skip,
  )
  okPage(res, items.map((r) => publicReview(reviewOut(r))), total, page)
})

router.post('/buses/:busId/reviews', requireUser, (req, res) => {
  const b = parseBody(req, ReviewBody)
  const busId = req.params.busId
  const bus = byId('Bus', busId)
  if (!bus) throw ApiError.notFound('Bus not found')

  const reviewId = tx(() => {
    let review = get('SELECT * FROM "Review" WHERE "userId" = ? AND "busId" = ?', req.user.id, busId)
    if (!review) {
      review = insert('Review', {
        id: newId(),
        userId: req.user.id,
        busId,
        localCarId: null,
        rating: b.rating,
        comment: b.comment,
        createdAt: Date.now(),
      })
    } else {
      run('UPDATE "Review" SET rating = ?, comment = ? WHERE id = ?', b.rating, b.comment, review.id)
    }
    busService.recomputeRating(bus)
    return review.id
  })

  ok(res, reviewOut(byId('Review', reviewId)), 'Thanks for rating this bus', 201)
})

export default router
