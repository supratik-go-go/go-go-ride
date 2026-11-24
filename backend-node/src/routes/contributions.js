// Route information sent in by app users. Nothing is public until an admin approves it;
// approval creates the real route (and any new stops) and tells the person who sent it.
import { Router } from 'express'
import { requireAdmin, requireUser } from '../auth.js'
import { all, byId, get, insert, like, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { resolveStopId } from '../services/buses.js'
import { logActivity, notify } from '../services/common.js'
import { enumOf, float, list, model, optional, pageParams, parseBody, q, raise, str } from '../services/pydantic.js'
import { isoZ } from '../time.js'

const router = Router()

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED']
const MAX_PENDING_PER_USER = 10

const SubmissionStop = model({
  stopId: optional(str()),
  stopName: str({ min: 2, max: 80 }),
})

const SubmissionBody = model({
  routeNumber: optional(str({ max: 20, upper: true })),
  notes: optional(str({ max: 500 })),
  stops: list(SubmissionStop, { min: 2 }),
})

const ReviewBody = model({
  status: enumOf(['APPROVED', 'REJECTED']),
  reason: optional(str({ max: 300 })),
  name: optional(str({ min: 2, max: 120 })),
  routeNumber: optional(str({ min: 1, max: 20, upper: true })),
  distanceKm: optional(float({ ge: 0 })),
})

async function submissionOut(row, { withUser = false } = {}) {
  const stops = JSON.parse(row.stops)
  const out = {
    id: row.id,
    name: row.name,
    routeNumber: row.routeNumber ?? null,
    notes: row.notes ?? null,
    stops,
    status: row.status,
    rejectionReason: row.rejectionReason ?? null,
    routeId: row.createdRouteId ?? null,
    submittedAt: isoZ(row.createdAt),
    reviewedAt: row.reviewedAt ? isoZ(row.reviewedAt) : null,
  }
  if (withUser) {
    const user = await byId('users', row.sentBy)
    out.submittedBy = user ? { id: user.id, name: user.name, phone: user.phone ?? null } : null
  }
  return out
}

// ---------------------------------------------------------------- app users

router.post('/route-submissions', requireUser, async (req, res) => {
  const b = parseBody(req, SubmissionBody)
  const names = b.stops.map((s) => s.stopName.trim().toLowerCase())
  if (new Set(names).size !== names.length) throw ApiError.badRequest('Each stop can only appear once on a route')

  const waiting = Number((await scalar('SELECT COUNT(id) FROM bus_route_requests WHERE sent_by = ? AND status = ?', req.user.id, 'PENDING')) || 0)
  if (waiting >= MAX_PENDING_PER_USER) throw ApiError.badRequest('You have too many routes waiting for review. Please wait for them to be checked.')

  const now = Date.now()
  const stops = []
  for (const s of b.stops) {
    const stopName = s.stopName.trim()
    const known = s.stopId ? await byId('bus_stops', s.stopId) : await get('SELECT id, name FROM bus_stops WHERE name = ? ORDER BY created_at, id LIMIT 1', stopName)
    stops.push({ stopId: known?.id ?? null, stopName: known?.name ?? stopName })
  }
  const row = await insert('bus_route_requests', {
    id: newId(),
    sentBy: req.user.id,
    name: `${stops[0].stopName} - ${stops[stops.length - 1].stopName}`,
    routeNumber: b.routeNumber || null,
    notes: b.notes || null,
    stops: JSON.stringify(stops),
    status: 'PENDING',
    rejectionReason: null,
    createdRouteId: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await logActivity({
    actorId: req.user.id,
    action: 'ROUTE_SUBMITTED',
    entityType: 'ROUTE',
    entityId: row.id,
    message: `New route information from ${req.user.name} (${row.name})`,
  })
  ok(res, await submissionOut(row), 'Route sent for verification. You will be notified once it is checked.', 201)
})

router.get('/route-submissions/mine', requireUser, async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const total = Number((await scalar('SELECT COUNT(id) FROM bus_route_requests WHERE sent_by = ?', req.user.id)) || 0)
  const rows = await all('SELECT * FROM bus_route_requests WHERE sent_by = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?', req.user.id, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map((r) => submissionOut(r))), total, page)
})

// ---------------------------------------------------------------- admin review

router.get('/admin/route-requests', requireAdmin, async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const status = q(d, req.query, 'status', enumOf(STATUSES))
  raise(d)

  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (page.search) {
    where.push('(name LIKE ? OR route_number LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT COUNT(id) FROM bus_route_requests${clause}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM bus_route_requests${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map((r) => submissionOut(r, { withUser: true }))), total, page)
})

async function publishRoute(submission, { name, routeNumber, distanceKm }, adminId) {
  if (await get('SELECT id FROM bus_routes WHERE route_number = ?', routeNumber)) {
    throw ApiError.conflict(`Route number ${routeNumber} already exists`)
  }
  const stopIds = []
  for (const s of JSON.parse(submission.stops)) stopIds.push(await resolveStopId(s))
  const now = Date.now()
  const route = await insert('bus_routes', {
    id: newId(),
    name,
    routeNumber,
    fromStopId: stopIds[0],
    toStopId: stopIds[stopIds.length - 1],
    distanceKm,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  })
  // Senders don't know exact distances, so stops are spread evenly until an admin edits the route.
  for (const [index, stopId] of stopIds.entries()) {
    await insert('bus_route_stops', {
      id: newId(),
      routeId: route.id,
      stopId,
      stopOrder: index + 1,
      distanceFromStartKm: Math.round(((distanceKm * index) / (stopIds.length - 1)) * 100) / 100,
    })
  }
  await logActivity({
    actorId: adminId,
    action: 'ROUTE_CREATED',
    entityType: 'ROUTE',
    entityId: route.id,
    message: `Route ${routeNumber} created from submitted information (${name})`,
  })
  return route
}

router.patch('/admin/route-requests/:id', requireAdmin, async (req, res) => {
  const b = parseBody(req, ReviewBody)
  const submission = await byId('bus_route_requests', req.params.id)
  if (!submission) throw ApiError.notFound('Route request not found')
  if (submission.status !== 'PENDING') throw ApiError.badRequest('This route request has already been reviewed')

  const approved = b.status === 'APPROVED'
  const routeNumber = b.routeNumber || submission.routeNumber
  if (approved && !routeNumber) throw ApiError.badRequest('Enter the route number before approving')
  if (!approved && !b.reason) throw ApiError.badRequest('Give a reason for the rejection')

  const reviewed = await tx(async () => {
    const route = approved
      ? await publishRoute(submission, { name: b.name || submission.name, routeNumber, distanceKm: b.distanceKm ?? 0 }, req.user.id)
      : null
    const now = Date.now()
    await update('bus_route_requests', submission.id, {
      status: b.status,
      rejectionReason: approved ? null : b.reason,
      createdRouteId: route ? route.id : null,
      reviewedBy: req.user.id,
      reviewedAt: now,
      updatedAt: now,
    })
    await notify({
      userId: submission.sentBy,
      title: approved ? 'Your route is live' : 'Route information rejected',
      message: approved ? `${submission.name} has been verified. Thank you!` : `${submission.name} was rejected: ${b.reason}`,
      type: 'USER',
    })
    return byId('bus_route_requests', submission.id)
  })
  ok(res, await submissionOut(reviewed, { withUser: true }), approved ? 'Route approved' : 'Route rejected')
})

export default router
