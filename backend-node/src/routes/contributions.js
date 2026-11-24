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

function submissionOut(row, { withUser = false } = {}) {
  const stops = JSON.parse(row.stops)
  const out = {
    id: row.id,
    name: row.name,
    routeNumber: row.routeNumber ?? null,
    notes: row.notes ?? null,
    stops,
    status: row.status,
    rejectionReason: row.rejectionReason ?? null,
    routeId: row.routeId ?? null,
    submittedAt: isoZ(row.createdAt),
    reviewedAt: row.reviewedAt ? isoZ(row.reviewedAt) : null,
  }
  if (withUser) {
    const user = byId('User', row.userId)
    out.submittedBy = user ? { id: user.id, name: user.name, phone: user.phone ?? null } : null
  }
  return out
}

// ---------------------------------------------------------------- app users

router.post('/route-submissions', requireUser, (req, res) => {
  const b = parseBody(req, SubmissionBody)
  const names = b.stops.map((s) => s.stopName.trim().toLowerCase())
  if (new Set(names).size !== names.length) throw ApiError.badRequest('Each stop can only appear once on a route')

  const waiting = Number(scalar('SELECT COUNT(id) FROM "RouteSubmission" WHERE "userId" = ? AND status = ?', req.user.id, 'PENDING') || 0)
  if (waiting >= MAX_PENDING_PER_USER) throw ApiError.badRequest('You have too many routes waiting for review. Please wait for them to be checked.')

  const now = Date.now()
  const stops = b.stops.map((s) => {
    const stopName = s.stopName.trim()
    const known = s.stopId ? byId('BusStop', s.stopId) : get('SELECT id, name FROM "BusStop" WHERE name = ?', stopName)
    return { stopId: known?.id ?? null, stopName: known?.name ?? stopName }
  })
  const row = insert('RouteSubmission', {
    id: newId(),
    userId: req.user.id,
    name: `${stops[0].stopName} - ${stops[stops.length - 1].stopName}`,
    routeNumber: b.routeNumber || null,
    notes: b.notes || null,
    stops: JSON.stringify(stops),
    status: 'PENDING',
    rejectionReason: null,
    routeId: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  logActivity({
    actorId: req.user.id,
    action: 'ROUTE_SUBMITTED',
    entityType: 'ROUTE',
    entityId: row.id,
    message: `New route information from ${req.user.name} (${row.name})`,
  })
  ok(res, submissionOut(row), 'Route sent for verification. You will be notified once it is checked.', 201)
})

router.get('/route-submissions/mine', requireUser, (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const total = Number(scalar('SELECT COUNT(id) FROM "RouteSubmission" WHERE "userId" = ?', req.user.id) || 0)
  const rows = all('SELECT * FROM "RouteSubmission" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?', req.user.id, page.limit, page.skip)
  okPage(res, rows.map((r) => submissionOut(r)), total, page)
})

// ---------------------------------------------------------------- admin review

router.get('/admin/route-requests', requireAdmin, (req, res) => {
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
    where.push('(name LIKE ? OR "routeNumber" LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number(scalar(`SELECT COUNT(id) FROM "RouteSubmission"${clause}`, ...params) || 0)
  const rows = all(`SELECT * FROM "RouteSubmission"${clause} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, rows.map((r) => submissionOut(r, { withUser: true })), total, page)
})

function publishRoute(submission, { name, routeNumber, distanceKm }, adminId) {
  if (get('SELECT id FROM "Route" WHERE "routeNumber" = ?', routeNumber)) {
    throw ApiError.conflict(`Route number ${routeNumber} already exists`)
  }
  const stopIds = JSON.parse(submission.stops).map((s) => resolveStopId(s))
  const now = Date.now()
  const route = insert('Route', {
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
  stopIds.forEach((stopId, index) => {
    insert('RouteStop', {
      id: newId(),
      routeId: route.id,
      stopId,
      sequence: index + 1,
      distanceFromStartKm: Math.round(((distanceKm * index) / (stopIds.length - 1)) * 100) / 100,
    })
  })
  logActivity({
    actorId: adminId,
    action: 'ROUTE_CREATED',
    entityType: 'ROUTE',
    entityId: route.id,
    message: `Route ${routeNumber} created from submitted information (${name})`,
  })
  return route
}

router.patch('/admin/route-requests/:id', requireAdmin, (req, res) => {
  const b = parseBody(req, ReviewBody)
  const submission = byId('RouteSubmission', req.params.id)
  if (!submission) throw ApiError.notFound('Route request not found')
  if (submission.status !== 'PENDING') throw ApiError.badRequest('This route request has already been reviewed')

  const approved = b.status === 'APPROVED'
  const routeNumber = b.routeNumber || submission.routeNumber
  if (approved && !routeNumber) throw ApiError.badRequest('Enter the route number before approving')
  if (!approved && !b.reason) throw ApiError.badRequest('Give a reason for the rejection')

  const reviewed = tx(() => {
    const route = approved
      ? publishRoute(submission, { name: b.name || submission.name, routeNumber, distanceKm: b.distanceKm ?? 0 }, req.user.id)
      : null
    const now = Date.now()
    update('RouteSubmission', submission.id, {
      status: b.status,
      rejectionReason: approved ? null : b.reason,
      routeId: route ? route.id : null,
      reviewedById: req.user.id,
      reviewedAt: now,
      updatedAt: now,
    })
    notify({
      userId: submission.userId,
      title: approved ? 'Your route is live' : 'Route information rejected',
      message: approved ? `${submission.name} has been verified. Thank you!` : `${submission.name} was rejected: ${b.reason}`,
      type: 'USER',
    })
    return byId('RouteSubmission', submission.id)
  })
  ok(res, submissionOut(reviewed, { withUser: true }), approved ? 'Route approved' : 'Route rejected')
})

export default router
