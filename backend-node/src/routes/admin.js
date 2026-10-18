// Admin panel: dashboard, approvals, users, reports and settings (port of app/api/admin.py).
import { Router } from 'express'
import { all, byId, get, insert, run, scalar, tx, update, like } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { hashPassword, requireAdmin, requireSuperAdmin } from '../auth.js'
import { activityLogOut, busById, busOut, settingsOut, userOut } from '../serialize.js'
import { logActivity, notify } from '../services/common.js'
import { dailySeries, dashboardStats, pyFloatStr, reportSummary, resolveRange, topRoutes } from '../services/reports.js'
import { isoZ } from '../time.js'
import { ADMIN_ROLES, ENUMS } from '../validate.js'
import { getSettingsRow } from './platform.js'

const router = Router()

// ---------------------------------------------------------------- validation, Python/pydantic style
//
// The admin panel shows the API's validation messages, so these reproduce the
// FastAPI service's errors exactly: every failing field is reported (in field
// order), strings are trimmed first, and the wording is pydantic's.

const fail = (details) => ApiError.badRequest('Validation failed', details)

/** "Input should be 'A', 'B' or 'C'" */
function enumMessage(values) {
  const q = values.map((v) => `'${v}'`)
  return `Input should be ${q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0]}`
}

const plural = (n) => (n === 1 ? '' : 's')
const PHONE_RE = /^(\+91)?[6-9]\d{9}$/

/**
 * Field specs: { name, type: 'str' | 'enum' | 'phone', required?, min?, max?, values? }.
 * Optional fields accept null. Returns only the keys the client sent (pydantic's exclude_unset).
 */
function validateBody(req, fields) {
  const raw = req.body
  const empty = Number(req.headers['content-length'] || 0) === 0 && !req.headers['transfer-encoding']
  if (raw === undefined || empty) throw fail([{ field: 'body', message: 'Field required' }])
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw fail([{ field: 'body', message: 'Input should be a valid dictionary or object to extract fields from' }])
  }

  const out = {}
  const errors = []
  const err = (field, message) => errors.push({ field, message })
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(raw, f.name)) {
      if (f.required) err(f.name, 'Field required')
      continue
    }
    const v = raw[f.name]
    if (v === null && !f.required) {
      out[f.name] = null
      continue
    }
    if (f.type === 'enum') {
      if (typeof v === 'string' && f.values.includes(v)) out[f.name] = v
      else err(f.name, enumMessage(f.values))
      continue
    }
    if (typeof v !== 'string') {
      err(f.name, 'Input should be a valid string')
      continue
    }
    if (f.type === 'phone') {
      const cleaned = v.replace(/[\s-]/g, '')
      if (PHONE_RE.test(cleaned)) out[f.name] = cleaned.startsWith('+91') ? cleaned.slice(3) : cleaned
      else err(f.name, 'Value error, Enter a valid 10-digit mobile number')
      continue
    }
    const s = v.trim()
    const len = [...s].length
    if (f.min !== undefined && len < f.min) err(f.name, `String should have at least ${f.min} character${plural(f.min)}`)
    else if (f.max !== undefined && len > f.max) err(f.name, `String should have at most ${f.max} character${plural(f.max)}`)
    else out[f.name] = s
  }
  if (errors.length) throw fail(errors)
  return out
}

const lastValue = (v) => (Array.isArray(v) ? v[v.length - 1] : v)

function intQuery(query, name, fallback, min, max, errors) {
  const v = lastValue(query[name])
  if (v === undefined) return fallback
  const s = String(v).trim()
  if (!/^[+-]?\d+(\.0*)?$/.test(s)) {
    errors.push({ field: name, message: 'Input should be a valid integer, unable to parse string as an integer' })
    return fallback
  }
  const n = parseInt(s, 10)
  if (min !== undefined && n < min) errors.push({ field: name, message: `Input should be greater than or equal to ${min}` })
  else if (max !== undefined && n > max) errors.push({ field: name, message: `Input should be less than or equal to ${max}` })
  return n
}

function enumQuery(query, name, values, errors) {
  const v = lastValue(query[name])
  if (v === undefined) return null
  if (!values.includes(v)) {
    errors.push({ field: name, message: enumMessage(values) })
    return null
  }
  return v
}

/**
 * ?page=&limit=&search=&order= plus the route's own enum filters, with every
 * error collected like FastAPI does (an empty value is a value, not a default).
 */
function listQuery(query, enums = {}) {
  const errors = []
  const page = intQuery(query, 'page', 1, 1, undefined, errors)
  const limit = intQuery(query, 'limit', 20, 1, 100, errors)
  const rawSearch = lastValue(query.search)
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null
  enumQuery(query, 'order', ['asc', 'desc'], errors)
  const filters = {}
  for (const [name, values] of Object.entries(enums)) filters[name] = enumQuery(query, name, values, errors)
  if (errors.length) throw fail(errors)
  return { page, limit, search, skip: (page - 1) * limit, ...filters }
}

// ---------------------------------------------------------------- dashboard

const QUEUE = ['PENDING', 'UNDER_REVIEW']

router.get('/admin/dashboard', requireAdmin, (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)

  const pending = all(
    `SELECT * FROM "Bus" WHERE status IN (?, ?) ORDER BY "submittedAt" DESC LIMIT ? OFFSET ?`,
    ...QUEUE,
    5,
    0,
  )
  const activities = all('SELECT * FROM "ActivityLog" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?', 8, 0)

  ok(res, {
    ...dashboardStats(window),
    charts: dailySeries(window),
    recentActivities: activities.map((a) => {
      const actor = byId('User', a.actorId)
      return {
        id: a.id,
        action: a.action,
        message: a.message,
        entityType: a.entityType ?? null,
        entityId: a.entityId ?? null,
        createdAt: isoZ(a.createdAt),
        actor: actor ? { id: actor.id, name: actor.name } : null,
      }
    }),
    pendingRequests: pending.map(busOut),
    topRoutes: topRoutes(window),
  })
})

router.get('/admin/activities', requireAdmin, (req, res) => {
  const page = listQuery(req.query)
  const total = Number(scalar('SELECT COUNT(id) FROM "ActivityLog"') || 0)
  const items = all('SELECT * FROM "ActivityLog" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?', page.limit, page.skip)
  okPage(res, items.map(activityLogOut), total, page)
})

// ---------------------------------------------------------------- bus approvals

// Defaults to PENDING + UNDER_REVIEW, with owner contact, documents and stopages.
router.get('/admin/bus-requests', requireAdmin, (req, res) => {
  const page = listQuery(req.query, { status: ENUMS.busStatus })
  const where = []
  const params = []
  if (page.status) {
    where.push('status = ?')
    params.push(page.status)
  } else {
    where.push('status IN (?, ?)')
    params.push(...QUEUE)
  }
  if (page.search) {
    where.push('("busNumber" LIKE ? OR "ownerId" IN (SELECT id FROM "User" WHERE name LIKE ?))')
    params.push(like(page.search.toUpperCase()), like(page.search))
  }
  const clause = where.join(' AND ')
  const total = Number(scalar(`SELECT COUNT(id) FROM "Bus" WHERE ${clause}`, ...params) || 0)
  const items = all(
    `SELECT * FROM "Bus" WHERE ${clause} ORDER BY "submittedAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  okPage(res, items.map(busOut), total, page)
})

const BusStatusBody = [
  { name: 'status', type: 'enum', values: ENUMS.busStatus, required: true },
  { name: 'reason', type: 'str', max: 300 },
]

// Approve, reject, or move a bus to review. A rejection needs a reason; the owner
// is notified and the action is audited.
router.patch('/admin/buses/:busId/status', requireAdmin, (req, res) => {
  const b = validateBody(req, BusStatusBody)
  const admin = req.user
  const status = b.status
  if (status === 'REJECTED' && !b.reason) throw ApiError.badRequest('Give the owner a reason for the rejection')

  const bus = byId('Bus', req.params.busId)
  if (!bus) throw ApiError.notFound('Bus not found')

  const readable = status.toLowerCase().replaceAll('_', ' ')
  let activity
  let title
  let message
  if (status === 'APPROVED') {
    activity = `Bus ${bus.busNumber} approved`
    title = 'Your bus is live'
    message = `${bus.busNumber} has been verified and is now listed on GO-GO Ride.`
  } else if (status === 'REJECTED') {
    activity = `Bus ${bus.busNumber} rejected - ${b.reason}`
    title = 'Bus request rejected'
    message = `${bus.busNumber} was rejected: ${b.reason}`
  } else {
    activity = `Bus ${bus.busNumber} moved to ${readable}`
    title = 'Bus request update'
    message = `${bus.busNumber} is now ${readable}.`
  }

  tx(() => {
    const now = Date.now()
    update('Bus', bus.id, {
      status,
      rejectionReason: status === 'REJECTED' ? b.reason : null,
      reviewedAt: now,
      reviewedById: admin.id,
      updatedAt: now,
    })
    logActivity({ actorId: admin.id, action: `BUS_${status}`, entityType: 'BUS', entityId: bus.id, message: activity })
    notify({ userId: bus.ownerId, title, message, type: 'USER' })
  })
  ok(res, busById(bus.id), 'Bus status updated')
})

// ---------------------------------------------------------------- user admin

router.get('/admin/users', requireAdmin, (req, res) => {
  const page = listQuery(req.query, { role: ENUMS.role, status: ENUMS.userStatus })
  const where = []
  const params = []
  if (page.role) {
    where.push('role = ?')
    params.push(page.role)
  }
  if (page.status) {
    where.push('status = ?')
    params.push(page.status)
  }
  if (page.search) {
    where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)')
    params.push(like(page.search), like(page.search), like(page.search))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number(scalar(`SELECT COUNT(id) FROM "User"${clause}`, ...params) || 0)
  const items = all(`SELECT * FROM "User"${clause} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, items.map(userOut), total, page)
})

// User with buses, latest bookings and sign-ins.
router.get('/admin/users/:userId', requireAdmin, (req, res) => {
  const userId = req.params.userId
  const user = byId('User', userId)
  if (!user) throw ApiError.notFound('User not found')

  const buses = all('SELECT * FROM "Bus" WHERE "ownerId" = ?', userId)
  const bookings = all('SELECT * FROM "Booking" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?', userId, 10, 0)
  const logins = all('SELECT * FROM "LoginActivity" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT ? OFFSET ?', userId, 10, 0)

  ok(res, {
    ...userOut(user),
    buses: buses.map((b) => ({ id: b.id, busNumber: b.busNumber, status: b.status })),
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingRef,
      amount: Number(b.amount),
      status: b.status,
      travelDate: isoZ(b.travelDate),
    })),
    logins: logins.map((l) => ({
      id: l.id,
      device: l.device ?? null,
      ipAddress: l.ipAddress ?? null,
      location: l.location ?? null,
      status: l.status,
      createdAt: isoZ(l.createdAt),
    })),
  })
})

const UserCreateBody = [
  { name: 'name', type: 'str', min: 2, max: 80, required: true },
  { name: 'phone', type: 'phone', required: true },
  { name: 'email', type: 'str' },
  { name: 'role', type: 'enum', values: ENUMS.role, required: true },
  // Trimmed like every string in the Python bodies.
  { name: 'password', type: 'str', min: 6, max: 72, required: true },
]

// Create a staff or owner account (super admin).
router.post('/admin/users', requireSuperAdmin, (req, res) => {
  const b = validateBody(req, UserCreateBody)
  const admin = req.user
  if (get('SELECT id FROM "User" WHERE phone = ?', b.phone)) {
    throw ApiError.conflict('An account with this mobile number already exists')
  }
  const user = tx(() => {
    const now = Date.now()
    const u = insert('User', {
      id: newId(),
      name: b.name,
      phone: b.phone,
      email: b.email ?? null,
      passwordHash: hashPassword(b.password),
      role: b.role,
      avatarUrl: null,
      status: 'ACTIVE',
      phoneVerified: 0,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    })
    logActivity({
      actorId: admin.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: u.id,
      message: `${u.role} account created for ${u.name}`,
    })
    return u
  })
  ok(res, userOut(byId('User', user.id)), 'User created', 201)
})

const UserUpdateBody = [
  { name: 'name', type: 'str', min: 2, max: 80 },
  { name: 'email', type: 'str' },
  { name: 'role', type: 'enum', values: ENUMS.role },
  { name: 'status', type: 'enum', values: ENUMS.userStatus },
]

// Update role or status.
router.patch('/admin/users/:userId', requireAdmin, (req, res) => {
  const b = validateBody(req, UserUpdateBody)
  const admin = req.user
  const userId = req.params.userId

  // Only a super admin may hand out admin roles.
  if (b.role && ADMIN_ROLES.includes(b.role) && admin.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super admin can assign admin roles')
  }
  if (userId === admin.id && b.status && b.status !== 'ACTIVE') {
    throw ApiError.badRequest('You cannot deactivate your own account')
  }
  if (userId === admin.id && b.role && b.role !== admin.role) {
    throw ApiError.badRequest('You cannot change your own role')
  }

  const user = byId('User', userId)
  if (!user) throw ApiError.notFound('User not found')
  // Admin accounts (including super admins) can only be edited, blocked or
  // demoted by a super admin - otherwise any admin could lock out the owner.
  if (ADMIN_ROLES.includes(user.role) && user.id !== admin.id && admin.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden("Only a super admin can change another admin's account")
  }

  tx(() => {
    const now = Date.now()
    // Every field the client sent is written, nulls included (a null name/role/status
    // fails the NOT NULL constraint -> 400 DB_ERROR, as in Python).
    if (Object.keys(b).length) update('User', user.id, { ...b, updatedAt: now })
    // A blocked user's sessions must die immediately.
    if (b.status && b.status !== 'ACTIVE') {
      run('UPDATE "RefreshToken" SET "revokedAt" = ? WHERE "userId" = ? AND "revokedAt" IS NULL', now, user.id)
    }
  })
  ok(res, userOut(byId('User', user.id)), 'User updated')
})

const dbError = () => new ApiError(400, 'Could not save the record', 'DB_ERROR')

// Delete a user (super admin).
//
// Mirrors what SQLAlchemy does when Python deletes the User object: the user's
// buses (with their stopages/documents/exceptions/reviews), alarms and favourites
// go with it, local cars are detached, and the database cascades the rest.
// Bookings are never deleted - SQLAlchemy tries to null Booking.userId, which
// fails (400 DB_ERROR); anything else still pointing at the user or its buses
// (audit log, tickets, rides, other users' bookings) fails the foreign key
// (400 INVALID_REFERENCE). Either way nothing is changed.
router.delete('/admin/users/:userId', requireSuperAdmin, (req, res) => {
  const admin = req.user
  const userId = req.params.userId
  if (userId === admin.id) throw ApiError.badRequest('You cannot delete your own account')
  const user = byId('User', userId)
  if (!user) throw ApiError.notFound('User not found')

  tx(() => {
    if (get('SELECT id FROM "Booking" WHERE "userId" = ? LIMIT 1', user.id)) throw dbError()
    run('UPDATE "LocalCar" SET "ownerId" = NULL, "updatedAt" = ? WHERE "ownerId" = ?', Date.now(), user.id)
    run('DELETE FROM "Bus" WHERE "ownerId" = ?', user.id)
    run('DELETE FROM "Alarm" WHERE "userId" = ?', user.id)
    run('DELETE FROM "Favorite" WHERE "userId" = ?', user.id)
    run('DELETE FROM "User" WHERE id = ?', user.id)
  })
  ok(res, null, 'User deleted')
})

// ---------------------------------------------------------------- reports / settings

router.get('/admin/reports', requireAdmin, (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)
  ok(res, {
    ...reportSummary(window),
    series: dailySeries(window),
    topRoutes: topRoutes(window, 10),
  })
})

// The daily series as CSV (same text as Python: no trailing newline, revenue as a float).
router.get('/admin/reports/export', requireAdmin, (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)
  const lines = ['date,buses_added,bookings,revenue']
  for (const r of dailySeries(window)) lines.push(`${r.date},${r.buses},${r.bookings},${pyFloatStr(r.revenue)}`)
  res
    .status(200)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="gogoride-report.csv"')
    .send(lines.join('\n'))
})

router.get('/admin/settings', requireAdmin, (req, res) => ok(res, settingsOut(getSettingsRow())))

const SettingsBody = [
  { name: 'platformName', type: 'str', min: 2, max: 80 },
  { name: 'platformEmail', type: 'str' },
  { name: 'contactNumber', type: 'str', max: 20 },
  { name: 'address', type: 'str', max: 200 },
  { name: 'timezone', type: 'str', max: 60 },
  { name: 'currency', type: 'str', max: 10 },
  { name: 'dateFormat', type: 'str', max: 20 },
  { name: 'timeFormat', type: 'enum', values: ['12h', '24h'] },
]

router.patch('/admin/settings', requireAdmin, (req, res) => {
  const b = validateBody(req, SettingsBody)
  const admin = req.user
  const row = getSettingsRow()
  // Python parity: a null for any of these (NOT NULL) columns makes the flush in
  // log_activity fail; Python swallows that, rolls everything back and still
  // answers "Settings saved" with the unchanged settings (and no audit entry).
  if (Object.values(b).some((v) => v === null)) return ok(res, settingsOut(row), 'Settings saved')

  tx(() => {
    if (Object.keys(b).length) update('Setting', row.id, { ...b, updatedAt: Date.now() })
    logActivity({
      actorId: admin.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTING',
      entityId: 'global',
      message: 'Platform settings updated',
    })
  })
  ok(res, settingsOut(getSettingsRow()), 'Settings saved')
})

export default router
