// Search, details, owner submission and verification documents (port of app/api/buses.py).
import { Router } from 'express'
import { isAdmin, optionalUser, requireUser } from '../auth.js'
import { all, byId, day, get, insert, run, scalar, tx, update } from '../db.js'
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
import { getSettingsRow } from './platform.js'
import { singleFile, saveUpload } from '../uploads.js'
import { ENUMS } from '../validate.js'

const router = Router()

const MAX_PENDING_PER_CONTRIBUTOR = 10

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

router.get('/buses/search', optionalUser, async (req, res) => {
  const d = []
  const query = req.query
  const from = q(d, query, 'from', str())
  const to = q(d, query, 'to', str())
  const via = q(d, query, 'via', str())
  const fromStopId = q(d, query, 'fromStopId', str())
  const toStopId = q(d, query, 'toStopId', str())
  const viaStopId = q(d, query, 'viaStopId', str())
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

  const result = await busService.searchBuses({
    fromText: from,
    toText: to,
    viaText: via,
    fromStopId,
    toStopId,
    viaStopId,
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
    await insert('recent_searches', {
      id: newId(),
      userId: req.user.id,
      searchType,
      fromText: from,
      toText: to,
      searchText: text,
      searchedAt: Date.now(),
    })
  }

  ok(res, result, `${result.total} buses found`)
})

// ---------------------------------------------------------------- lists

router.get('/buses', optionalUser, async (req, res) => {
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
    where.push('buses.status = ?')
    params.push(effectiveStatus)
  }
  if (type) {
    where.push('buses.is_ac = ?')
    params.push(type === 'AC' ? 1 : 0)
  }
  if (category) {
    where.push('buses.category = ?')
    params.push(category)
  }
  if (routeId) {
    where.push('buses.route_id = ?')
    params.push(routeId)
  }
  if (ownerId) {
    where.push('buses.owner_id = ?')
    params.push(ownerId)
  }
  if (page.search) {
    const [sql, p] = busService.searchFilter(page.search)
    where.push(sql)
    params.push(...p)
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''

  const total = Number((await scalar(`SELECT COUNT(buses.id) FROM buses${clause}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM buses${clause} ORDER BY buses.created_at DESC, buses.id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  let items = await Promise.all(rows.map(busOut))
  // Owners' personal contact details and ownership documents are not public.
  if (!admin) items = items.map(publicBus)
  okPage(res, items, total, page)
})

router.get('/buses/mine/list', requireUser, async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const total = Number((await scalar('SELECT COUNT(id) FROM buses WHERE owner_id = ?', req.user.id)) || 0)
  const rows = await all('SELECT * FROM buses WHERE owner_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?', req.user.id, page.limit, page.skip)
  const items = await Promise.all(rows.map(busOut))
  okPage(res, items, total, page)
})

// ---------------------------------------------------------------- details

router.get('/buses/:busId', optionalUser, async (req, res) => {
  const date = q([], req.query, 'date', str())
  const data = await busService.busDetails(req.params.busId, date)
  if (isAdmin(req.user) || (req.user && req.user.id === data.ownerId)) return ok(res, data)
  // Everyone else: approved buses only, without the owner's personal details.
  if (data.status !== 'APPROVED') throw ApiError.notFound('Bus not found')
  ok(res, publicBus(data))
})

// ---------------------------------------------------------------- owner submission

// Anyone signed in can send bus information. A passenger has no booking line of their own,
// so the platform's number is used, and any new stops stay hidden until the bus is approved.
router.post('/buses', requireUser, async (req, res) => {
  const user = req.user
  const contributor = user.role !== 'BUS_OWNER' && !isAdmin(user)
  if (contributor && !req.body?.contactNumber) req.body = { ...req.body, contactNumber: (await getSettingsRow()).contactNumber }
  const b = parseBody(req, BusCreateBody)
  if (contributor) {
    const waiting = Number((await scalar('SELECT COUNT(id) FROM buses WHERE owner_id = ? AND status = ?', user.id, 'PENDING')) || 0)
    if (waiting >= MAX_PENDING_PER_CONTRIBUTOR) throw ApiError.badRequest('You have too many buses waiting for review. Please wait for them to be checked.')
  }
  if (await get('SELECT id FROM buses WHERE bus_number = ?', b.busNumber)) {
    throw ApiError.conflict('This bus number is already registered')
  }

  const busId = await tx(async () => {
    const stopIds = []
    for (const s of b.stopages) stopIds.push(await busService.resolveStopId(s, contributor ? 'INACTIVE' : 'ACTIVE'))
    const now = Date.now()
    const bus = await insert('buses', {
      id: newId(),
      busNumber: b.busNumber,
      busName: b.busName,
      ownerId: user.id,
      routeId: b.routeId,
      isAc: b.type === 'AC' ? 1 : 0,
      category: b.category,
      operator: b.operator,
      totalSeats: b.totalSeats,
      fare: b.fare,
      contactNumber: b.contactNumber,
      callFrom: b.contactStart,
      callUntil: b.contactEnd,
      runsOn: serviceDaysCsv(b.serviceDays),
      pictureUrl: null,
      status: 'PENDING',
      rejectionReason: null,
      ratingAverage: 0,
      ratingCount: 0,
      submittedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
    })
    await busService.insertStopages(bus.id, b.stopages, stopIds)
    await logActivity({
      actorId: user.id,
      action: 'BUS_SUBMITTED',
      entityType: 'BUS',
      entityId: bus.id,
      message: `New bus request from ${user.name} (${bus.busNumber})`,
    })
    return bus.id
  })

  ok(res, await busById(busId), 'Bus submitted for verification. You will be notified once it is approved.', 201)
})

// Request field -> [column (camelCase), value as stored].
const UPDATABLE = {
  busName: ['busName', (v) => v],
  type: ['isAc', (v) => (v === 'AC' ? 1 : 0)],
  category: ['category', (v) => v],
  operator: ['operator', (v) => v],
  totalSeats: ['totalSeats', (v) => v],
  fare: ['fare', (v) => v],
  contactNumber: ['contactNumber', (v) => v],
  contactStart: ['callFrom', (v) => v],
  contactEnd: ['callUntil', (v) => v],
  routeId: ['routeId', (v) => v],
}

router.patch('/buses/:busId', requireUser, async (req, res) => {
  const b = parseBody(req, BusUpdateBody)
  const admin = isAdmin(req.user)
  const bus = admin ? await byId('buses', req.params.busId) : await busService.assertOwnership(req.params.busId, req.user.id)
  if (!bus) throw ApiError.notFound('Bus not found')

  // Only columns whose value really changes are written (and only then does updatedAt move).
  const patch = {}
  const set = (key, value) => {
    if (bus[key] !== value) patch[key] = value
  }
  for (const [field, [column, store]] of Object.entries(UPDATABLE)) if (b.$provided.has(field)) set(column, store(b[field]))
  if (b.serviceDays !== null) set('runsOn', serviceDaysCsv(b.serviceDays))

  // An owner editing an approved bus sends it back through verification.
  if (!admin && bus.status === 'APPROVED') {
    set('status', 'UNDER_REVIEW')
    set('reviewedAt', null)
    set('reviewedBy', null)
  }

  await tx(async () => {
    if (b.stopages !== null) await busService.replaceStopages(bus.id, b.stopages, admin || req.user.role === 'BUS_OWNER' ? 'ACTIVE' : 'INACTIVE')
    if (Object.keys(patch).length) await update('buses', bus.id, { ...patch, updatedAt: Date.now() })
  })
  ok(res, await busById(bus.id), 'Bus updated')
})

router.delete('/buses/:busId', requireUser, async (req, res) => {
  const bus = isAdmin(req.user) ? await byId('buses', req.params.busId) : await busService.assertOwnership(req.params.busId, req.user.id)
  if (!bus) throw ApiError.notFound('Bus not found')
  // Trips, timetable, documents, off days, reviews and alarms go with it (ON DELETE CASCADE);
  // a bus with bookings is refused by the foreign key (400 INVALID_REFERENCE), as in Python.
  await run('DELETE FROM buses WHERE id = ?', bus.id)
  ok(res, null, 'Bus removed')
})

// ---------------------------------------------------------------- documents

router.post('/buses/:busId/documents', requireUser, singleFile, async (req, res) => {
  const d = []
  const form = req.is('multipart/form-data') && req.body ? req.body : {}
  const rawDocType = Array.isArray(form.docType) ? form.docType[form.docType.length - 1] : form.docType
  const docType = field(d, 'docType', rawDocType, enumOf(ENUMS.docType), { required: true })
  if (!req.file) d.push({ field: 'file', message: 'Field required' })
  raise(d)

  const busId = req.params.busId
  if (!isAdmin(req.user)) await busService.assertOwnership(busId, req.user.id)
  else if (!(await byId('buses', busId))) throw ApiError.notFound('Bus not found')

  const url = saveUpload(req.file, 'documents')
  const doc = await insert('bus_documents', {
    id: newId(),
    busId,
    documentType: docType,
    fileUrl: url,
    originalFileName: req.file.originalname ?? null,
    uploadedAt: Date.now(),
  })
  ok(res, busDocumentOut(doc), 'Document uploaded', 201)
})

// ---------------------------------------------------------------- non-operating dates

router.post('/buses/:busId/exceptions', requireUser, async (req, res) => {
  const b = parseBody(req, BusExceptionBody)
  const busId = req.params.busId
  const admin = isAdmin(req.user)
  if (!admin) await busService.assertOwnership(busId, req.user.id)
  else if (!(await byId('buses', busId))) throw ApiError.notFound('Bus not found')

  const exception = await busService.addException(busId, { date: b.date, reason: b.reason, enforceNotice: !admin })

  // Warn everyone holding an alarm for that bus on that date.
  const bus = await byId('buses', busId)
  const alarms = await all('SELECT * FROM alarms WHERE bus_id = ? AND travel_date = ? AND status = ?', busId, day(exception.offDate), 'ACTIVE')
  await tx(async () => {
    for (const alarm of alarms) {
      await notify({
        userId: alarm.userId,
        title: 'Bus not running',
        message: `${bus.busNumber || bus.busName} will not operate on ${dateOnly(exception.offDate)}. Please plan an alternative.`,
        type: 'ALARM',
      })
    }
  })

  ok(res, busExceptionOut(exception), 'Non-operating date recorded', 201)
})

router.delete('/buses/:busId/exceptions/:exceptionId', requireUser, async (req, res) => {
  const { busId, exceptionId } = req.params
  if (!isAdmin(req.user)) await busService.assertOwnership(busId, req.user.id)
  await run('DELETE FROM bus_off_days WHERE id = ? AND bus_id = ?', exceptionId, busId)
  ok(res, null, 'Non-operating date removed')
})

// ---------------------------------------------------------------- reviews

router.get('/buses/:busId/reviews', async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const busId = req.params.busId
  const total = Number((await scalar('SELECT COUNT(id) FROM reviews WHERE bus_id = ? AND is_hidden = 0', busId)) || 0)
  const items = await all(
    'SELECT * FROM reviews WHERE bus_id = ? AND is_hidden = 0 ORDER BY created_at DESC, id LIMIT ? OFFSET ?',
    busId,
    page.limit,
    page.skip,
  )
  okPage(res, await Promise.all(items.map(async (r) => publicReview(await reviewOut(r)))), total, page)
})

router.post('/buses/:busId/reviews', requireUser, async (req, res) => {
  const b = parseBody(req, ReviewBody)
  const busId = req.params.busId
  const bus = await byId('buses', busId)
  if (!bus) throw ApiError.notFound('Bus not found')

  const reviewId = await tx(async () => {
    let review = await get('SELECT * FROM reviews WHERE user_id = ? AND bus_id = ?', req.user.id, busId)
    if (!review) {
      review = await insert('reviews', {
        id: newId(),
        userId: req.user.id,
        busId,
        localVehicleId: null,
        rating: b.rating,
        comment: b.comment,
        createdAt: Date.now(),
      })
    } else {
      await run('UPDATE reviews SET rating = ?, comment = ? WHERE id = ?', b.rating, b.comment, review.id)
    }
    await busService.recomputeRating(bus)
    return review.id
  })

  ok(res, await reviewOut(await byId('reviews', reviewId)), 'Thanks for rating this bus', 201)
})

export default router
