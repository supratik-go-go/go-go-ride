// Admin panel: dashboard, approvals, users, reports and settings (port of app/api/admin.py).
import { Router } from 'express'
import { all, at, byId, get, insert, run, scalar, tx, update, like } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { hashPassword, requireAdmin, requireSuperAdmin } from '../auth.js'
import { activityLogOut, busById, busOut, settingsOut, userOut } from '../serialize.js'
import { logActivity, notify } from '../services/common.js'
import { leaveActiveRooms } from '../services/games.js'
import { dailySeries, dashboardStats, pyFloatStr, reportSummary, resolveRange, topRoutes } from '../services/reports.js'
import { isoZ } from '../time.js'
import { ADMIN_ROLES, ENUMS } from '../validate.js'
import { getSettingsRow } from './platform.js'
import * as busImport from '../services/busImport.js'
import { singleFile } from '../uploads.js'

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

router.get('/admin/dashboard', requireAdmin, async (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)

  const pending = await all('SELECT * FROM buses WHERE status IN (?, ?) ORDER BY submitted_at DESC, id LIMIT ? OFFSET ?', ...QUEUE, 5, 0)
  const activities = await all('SELECT * FROM activity_log ORDER BY created_at DESC, id LIMIT ? OFFSET ?', 8, 0)

  ok(res, {
    ...(await dashboardStats(window)),
    charts: await dailySeries(window),
    recentActivities: await Promise.all(
      activities.map(async (a) => {
        const actor = await byId('users', a.doneBy)
        return {
          id: a.id,
          action: a.action,
          message: a.message,
          entityType: a.itemType ?? null,
          entityId: a.itemId ?? null,
          createdAt: isoZ(a.createdAt),
          actor: actor ? { id: actor.id, name: actor.name } : null,
        }
      }),
    ),
    pendingRequests: await Promise.all(pending.map(busOut)),
    topRoutes: await topRoutes(window),
  })
})

router.get('/admin/activities', requireAdmin, async (req, res) => {
  const page = listQuery(req.query)
  const total = Number((await scalar('SELECT COUNT(id) FROM activity_log')) || 0)
  const items = await all('SELECT * FROM activity_log ORDER BY created_at DESC, id LIMIT ? OFFSET ?', page.limit, page.skip)
  okPage(res, await Promise.all(items.map(activityLogOut)), total, page)
})

// ---------------------------------------------------------------- bus approvals

// Defaults to PENDING + UNDER_REVIEW, with owner contact, documents and stopages.
router.get('/admin/bus-requests', requireAdmin, async (req, res) => {
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
    where.push('(bus_number LIKE ? OR owner_id IN (SELECT id FROM users WHERE name LIKE ?))')
    params.push(like(page.search.toUpperCase()), like(page.search))
  }
  const clause = where.join(' AND ')
  const total = Number((await scalar(`SELECT COUNT(id) FROM buses WHERE ${clause}`, ...params)) || 0)
  const items = await all(`SELECT * FROM buses WHERE ${clause} ORDER BY submitted_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(items.map(busOut)), total, page)
})

const BusStatusBody = [
  { name: 'status', type: 'enum', values: ENUMS.busStatus, required: true },
  { name: 'reason', type: 'str', max: 300 },
]

// Approve, reject, or move a bus to review. A rejection needs a reason; the owner
// is notified and the action is audited.
router.patch('/admin/buses/:busId/status', requireAdmin, async (req, res) => {
  const b = validateBody(req, BusStatusBody)
  const admin = req.user
  const status = b.status
  if (status === 'REJECTED' && !b.reason) throw ApiError.badRequest('Give the owner a reason for the rejection')

  const bus = await byId('buses', req.params.busId)
  if (!bus) throw ApiError.notFound('Bus not found')
  // Many buses are known only by name (the bus number is optional).
  bus.busNumber = bus.busNumber || bus.busName

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

  await tx(async () => {
    const now = Date.now()
    await update('buses', bus.id, {
      status,
      rejectionReason: status === 'REJECTED' ? b.reason : null,
      reviewedAt: now,
      reviewedBy: admin.id,
      updatedAt: now,
    })
    if (status === 'APPROVED') {
      // Stops typed by a contributor go public with the bus they came with.
      await run(
        'UPDATE bus_stops SET status = ?, updated_at = ? WHERE status = ? AND id IN (SELECT stop_id FROM bus_timetable WHERE bus_id = ?)',
        'ACTIVE',
        at(now),
        'INACTIVE',
        bus.id,
      )
    }
    await logActivity({ actorId: admin.id, action: `BUS_${status}`, entityType: 'BUS', entityId: bus.id, message: activity })
    await notify({ userId: bus.ownerId, title, message, type: 'USER' })
  })
  ok(res, await busById(bus.id), 'Bus status updated')
})

// ---------------------------------------------------------------- user admin

router.get('/admin/users', requireAdmin, async (req, res) => {
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
  const total = Number((await scalar(`SELECT COUNT(id) FROM users${clause}`, ...params)) || 0)
  const items = await all(`SELECT * FROM users${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, items.map(userOut), total, page)
})

// User with buses, latest bookings and sign-ins.
router.get('/admin/users/:userId', requireAdmin, async (req, res) => {
  const userId = req.params.userId
  const user = await byId('users', userId)
  if (!user) throw ApiError.notFound('User not found')

  const buses = await all('SELECT * FROM buses WHERE owner_id = ? ORDER BY created_at, id', userId)
  const bookings = await all('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?', userId, 10, 0)
  const logins = await all('SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?', userId, 10, 0)

  ok(res, {
    ...userOut(user),
    buses: buses.map((b) => ({ id: b.id, busNumber: b.busNumber, status: b.status })),
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingNumber,
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
router.post('/admin/users', requireSuperAdmin, async (req, res) => {
  const b = validateBody(req, UserCreateBody)
  const admin = req.user
  if (await get('SELECT id FROM users WHERE phone = ?', b.phone)) {
    throw ApiError.conflict('An account with this mobile number already exists')
  }
  const user = await tx(async () => {
    const now = Date.now()
    const u = await insert('users', {
      id: newId(),
      name: b.name,
      phone: b.phone,
      email: b.email ?? null,
      password: hashPassword(b.password),
      role: b.role,
      pictureUrl: null,
      status: 'ACTIVE',
      phoneVerified: 0,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity({
      actorId: admin.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: u.id,
      message: `${u.role} account created for ${u.name}`,
    })
    return u
  })
  ok(res, userOut(await byId('users', user.id)), 'User created', 201)
})

const UserUpdateBody = [
  { name: 'name', type: 'str', min: 2, max: 80 },
  { name: 'email', type: 'str' },
  { name: 'role', type: 'enum', values: ENUMS.role },
  { name: 'status', type: 'enum', values: ENUMS.userStatus },
]

// Update role or status.
router.patch('/admin/users/:userId', requireAdmin, async (req, res) => {
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

  const user = await byId('users', userId)
  if (!user) throw ApiError.notFound('User not found')
  // Admin accounts (including super admins) can only be edited, blocked or
  // demoted by a super admin - otherwise any admin could lock out the owner.
  if (ADMIN_ROLES.includes(user.role) && user.id !== admin.id && admin.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden("Only a super admin can change another admin's account")
  }

  await tx(async () => {
    const now = Date.now()
    // Every field the client sent is written, nulls included (a null name/role/status
    // fails the NOT NULL constraint -> 400 DB_ERROR, as in Python).
    if (Object.keys(b).length) await update('users', user.id, { ...b, updatedAt: now })
    // A blocked user's sessions must die immediately.
    if (b.status && b.status !== 'ACTIVE') {
      await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', at(now), user.id)
    }
  })
  ok(res, userOut(await byId('users', user.id)), 'User updated')
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
router.delete('/admin/users/:userId', requireSuperAdmin, async (req, res) => {
  const admin = req.user
  const userId = req.params.userId
  if (userId === admin.id) throw ApiError.badRequest('You cannot delete your own account')
  const user = await byId('users', userId)
  if (!user) throw ApiError.notFound('User not found')

  await tx(async () => {
    if (await get('SELECT id FROM bookings WHERE user_id = ? LIMIT 1', user.id)) throw dbError()
    await leaveActiveRooms(user.id)
    await run('UPDATE local_vehicles SET owner_id = NULL, updated_at = ? WHERE owner_id = ?', at(Date.now()), user.id)
    await run('DELETE FROM buses WHERE owner_id = ?', user.id)
    await run('DELETE FROM alarms WHERE user_id = ?', user.id)
    await run('DELETE FROM favorites WHERE user_id = ?', user.id)
    await run('DELETE FROM users WHERE id = ?', user.id)
  })
  ok(res, null, 'User deleted')
})

// ---------------------------------------------------------------- reports / settings

router.get('/admin/reports', requireAdmin, async (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)
  ok(res, {
    ...(await reportSummary(window)),
    series: await dailySeries(window),
    topRoutes: await topRoutes(window, 10),
  })
})

// The daily series as CSV (same text as Python: no trailing newline, revenue as a float).
router.get('/admin/reports/export', requireAdmin, async (req, res) => {
  const window = resolveRange(req.query.from, req.query.to)
  const lines = ['date,buses_added,bookings,revenue']
  for (const r of await dailySeries(window)) lines.push(`${r.date},${r.buses},${r.bookings},${pyFloatStr(r.revenue)}`)
  res
    .status(200)
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="gogoride-report.csv"')
    .send(lines.join('\n'))
})

router.get('/admin/settings', requireAdmin, async (req, res) => ok(res, settingsOut(await getSettingsRow())))

// Request field -> app_settings column; timezone, currency, dateFormat and timeFormat are accepted but
// no longer stored (the app never used them).
const SETTING_COLUMNS = { platformName: 'appName', platformEmail: 'supportEmail', contactNumber: 'contactNumber', address: 'address' }

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

router.patch('/admin/settings', requireAdmin, async (req, res) => {
  const b = validateBody(req, SettingsBody)
  const admin = req.user
  const row = await getSettingsRow()
  // Python parity: a null for any of these (NOT NULL) columns makes the flush in
  // log_activity fail; Python swallows that, rolls everything back and still
  // answers "Settings saved" with the unchanged settings (and no audit entry).
  if (Object.values(b).some((v) => v === null)) return ok(res, settingsOut(row), 'Settings saved')

  const columns = Object.fromEntries(Object.entries(b).filter(([k]) => SETTING_COLUMNS[k]).map(([k, v]) => [SETTING_COLUMNS[k], v]))
  await tx(async () => {
    if (Object.keys(columns).length) await update('app_settings', row.id, { ...columns, updatedAt: Date.now() })
    await logActivity({
      actorId: admin.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTING',
      entityId: 'global',
      message: 'Platform settings updated',
    })
  })
  ok(res, settingsOut(await getSettingsRow()), 'Settings saved')
})

// ---------------------------------------------------------------- bus import from Excel

// Without ?apply=1 nothing is written: the admin sees what each row would do first.
router.post('/admin/buses/import', requireAdmin, singleFile, async (req, res) => {
  const file = req.file
  if (!file?.size) throw ApiError.badRequest('Choose the Excel file to import')
  if (!/\.xlsx$/i.test(file.originalname || '')) throw ApiError.badRequest('Save the sheet as an Excel .xlsx file and choose that')
  const plan = await busImport.planImport(await busImport.readSheet(file.buffer))
  const applied = req.query.apply === '1' ? await busImport.applyImport(plan, req.user, { publish: req.body?.publish !== 'false' }) : null
  const count = (action) => plan.filter((p) => p.action === action).length
  ok(res, {
    summary: { create: count('create'), update: count('update'), error: count('error') },
    applied,
    rows: plan.map((p) => ({
      row: p.row,
      busNumber: p.busNumber,
      busName: p.busName,
      action: p.action,
      ac: p.ac,
      fare: p.fare,
      days: p.days,
      stops: p.stops.map((s) => ({ name: s.name, time: s.time, isNew: !s.stopId })),
      errors: p.errors,
    })),
  })
})

export default router
