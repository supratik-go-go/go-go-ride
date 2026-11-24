// What passengers send in besides buses and routes: local police station numbers for the
// Emergency Call List (shown once an admin approves them), and photos of bus tickets from Add Bus
// Info (an admin reads the ticket and adds the bus).
import { Router } from 'express'
import { requireAdmin, requireUser } from '../auth.js'
import { all, byId, get, insert, like, run, scalar, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { logActivity, notify } from '../services/common.js'
import { enumOf, model, optional, pageParams, parseBody, q, raise, str } from '../services/pydantic.js'
import { isoZ } from '../time.js'
import { saveUpload, singleFile } from '../uploads.js'

const router = Router()

const MAX_PENDING_PER_USER = 10
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED']

const cleanPhone = (v) => String(v).replace(/[^\d+]/g, '')
const phoneProblem = (v) => {
  const p = cleanPhone(v)
  return p.replace(/\D/g, '').length < 3 || p.length > 15 ? 'Enter the police station phone number' : null
}

const PoliceBody = model(
  {
    stationName: str({ min: 2, max: 120 }),
    area: str({ min: 2, max: 120 }),
    phone: str({ min: 3, max: 20 }),
  },
  { after: (v) => phoneProblem(v.phone) },
)

const PoliceReviewBody = model(
  {
    status: enumOf(['APPROVED', 'REJECTED']),
    stationName: optional(str({ min: 2, max: 120 })),
    area: optional(str({ min: 2, max: 120 })),
    phone: optional(str({ min: 3, max: 20 })),
  },
  { after: (v) => (v.phone ? phoneProblem(v.phone) : null) },
)

async function policeOut(r, { withSender = false } = {}) {
  const out = { id: r.id, stationName: r.stationName, area: r.area, phone: r.phone }
  if (!withSender) return out
  const sender = r.sentBy ? await get('SELECT id, name, phone FROM users WHERE id = ?', r.sentBy) : null
  return { ...out, status: r.status, sentBy: sender, createdAt: isoZ(r.createdAt), reviewedAt: isoZ(r.reviewedAt) }
}

// ---------------------------------------------------------------- public

router.get('/police-numbers', async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  raise(d)
  const where = ["status = 'APPROVED'"]
  const params = []
  if (page.search) {
    where.push('(station_name LIKE ? OR area LIKE ?)')
    params.push(like(page.search), like(page.search))
  }
  const clause = where.join(' AND ')
  const total = Number((await scalar(`SELECT COUNT(id) FROM police_numbers WHERE ${clause}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM police_numbers WHERE ${clause} ORDER BY area, station_name, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map((r) => policeOut(r))), total, page)
})

router.post('/police-numbers', requireUser, async (req, res) => {
  const b = parseBody(req, PoliceBody)
  const phone = cleanPhone(b.phone)
  const waiting = Number((await scalar("SELECT COUNT(id) FROM police_numbers WHERE sent_by = ? AND status = 'PENDING'", req.user.id)) || 0)
  if (waiting >= MAX_PENDING_PER_USER) throw ApiError.badRequest('You have too many numbers waiting for review. Please wait for them to be checked.')
  if (await get("SELECT id FROM police_numbers WHERE phone = ? AND status != 'REJECTED'", phone)) {
    throw ApiError.conflict('This number is already listed or waiting for review')
  }
  const now = Date.now()
  const row = await insert('police_numbers', {
    id: newId(),
    stationName: b.stationName.trim(),
    area: b.area.trim(),
    phone,
    status: 'PENDING',
    sentBy: req.user.id,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await logActivity({ actorId: req.user.id, action: 'POLICE_NUMBER_SENT', entityType: 'POLICE_NUMBER', entityId: row.id, message: `${req.user.name} sent ${row.stationName} (${row.area})` })
  ok(res, await policeOut(await byId('police_numbers', row.id), { withSender: true }), 'Thank you! It will show once our team checks it.', 201)
})

// ---------------------------------------------------------------- admin

router.get('/admin/police-numbers', requireAdmin, async (req, res) => {
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
    where.push('(station_name LIKE ? OR area LIKE ? OR phone LIKE ?)')
    params.push(like(page.search), like(page.search), like(page.search))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT COUNT(id) FROM police_numbers${clause}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM police_numbers${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map((r) => policeOut(r, { withSender: true }))), total, page)
})

router.patch('/admin/police-numbers/:id', requireAdmin, async (req, res) => {
  const b = parseBody(req, PoliceReviewBody)
  const row = await byId('police_numbers', req.params.id)
  if (!row) throw ApiError.notFound('Police number not found')
  const now = Date.now()
  // An admin may correct the details while approving.
  await update('police_numbers', row.id, {
    status: b.status,
    stationName: b.stationName?.trim(),
    area: b.area?.trim(),
    phone: b.phone ? cleanPhone(b.phone) : undefined,
    reviewedBy: req.user.id,
    reviewedAt: now,
    updatedAt: now,
  })
  const approved = b.status === 'APPROVED'
  if (row.sentBy && row.status === 'PENDING') {
    await notify({
      userId: row.sentBy,
      title: approved ? 'Police number added' : 'Police number not added',
      message: approved ? `${row.stationName} is now on the Emergency Call List. Thank you!` : `${row.stationName} could not be added after checking.`,
      type: 'USER',
      link: '/emergency',
    })
  }
  await logActivity({ actorId: req.user.id, action: approved ? 'POLICE_NUMBER_APPROVED' : 'POLICE_NUMBER_REJECTED', entityType: 'POLICE_NUMBER', entityId: row.id, message: `${row.stationName} ${approved ? 'approved' : 'rejected'}` })
  ok(res, await policeOut(await byId('police_numbers', row.id), { withSender: true }), approved ? 'Approved' : 'Rejected')
})

// ---------------------------------------------------------------- ticket photos

const MAX_NEW_TICKETS_PER_USER = 20
const TICKET_STATUSES = ['NEW', 'USED', 'NOT_USEFUL']

const TicketReviewBody = model({
  status: enumOf(TICKET_STATUSES),
  busId: optional(str()),
})

async function ticketOut(r) {
  const [sender, bus] = await Promise.all([
    r.sentBy ? get('SELECT id, name, phone FROM users WHERE id = ?', r.sentBy) : null,
    r.busId ? get('SELECT id, bus_number, bus_name FROM buses WHERE id = ?', r.busId) : null,
  ])
  return {
    id: r.id,
    photoUrl: r.photoUrl,
    note: r.note,
    status: r.status,
    sentBy: sender,
    bus: bus ? { id: bus.id, busNumber: bus.busNumber, busName: bus.busName } : null,
    createdAt: isoZ(r.createdAt),
    reviewedAt: isoZ(r.reviewedAt),
  }
}

router.post('/ticket-photos', requireUser, singleFile, async (req, res) => {
  const file = req.file
  if (!file?.size) throw ApiError.badRequest('Choose a photo of the ticket')
  if (!/^image\//.test(file.mimetype)) throw ApiError.badRequest('Send a photo of the ticket (JPG, PNG or WEBP)')
  const waiting = Number((await scalar("SELECT COUNT(id) FROM ticket_photos WHERE sent_by = ? AND status = 'NEW'", req.user.id)) || 0)
  if (waiting >= MAX_NEW_TICKETS_PER_USER) throw ApiError.badRequest('You have many tickets waiting to be read. Please wait for our team to check them.')
  const note = String(req.body?.note ?? '').trim().slice(0, 1000) || null
  const now = Date.now()
  const row = await insert('ticket_photos', {
    id: newId(),
    sentBy: req.user.id,
    photoUrl: saveUpload(file, 'tickets'),
    note,
    status: 'NEW',
    busId: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  await logActivity({ actorId: req.user.id, action: 'TICKET_PHOTO_SENT', entityType: 'TICKET_PHOTO', entityId: row.id, message: `${req.user.name} sent a bus ticket photo` })
  ok(res, await ticketOut(await byId('ticket_photos', row.id)), 'Thank you! Our team will read the ticket and add the bus.', 201)
})

router.get('/admin/ticket-photos', requireAdmin, async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const status = q(d, req.query, 'status', enumOf(TICKET_STATUSES))
  raise(d)
  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (page.search) {
    where.push('note LIKE ?')
    params.push(like(page.search))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT COUNT(id) FROM ticket_photos${clause}`, ...params)) || 0)
  const rows = await all(`SELECT * FROM ticket_photos${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  okPage(res, await Promise.all(rows.map(ticketOut)), total, page)
})

router.patch('/admin/ticket-photos/:id', requireAdmin, async (req, res) => {
  const b = parseBody(req, TicketReviewBody)
  const row = await byId('ticket_photos', req.params.id)
  if (!row) throw ApiError.notFound('Ticket photo not found')
  const bus = b.busId ? await byId('buses', b.busId) : null
  if (b.busId && !bus) throw ApiError.badRequest('That bus does not exist')
  const now = Date.now()
  await update('ticket_photos', row.id, { status: b.status, busId: bus ? bus.id : row.busId, reviewedBy: req.user.id, reviewedAt: now, updatedAt: now })
  if (b.status === 'USED' && row.status !== 'USED' && row.sentBy) {
    const name = bus ? bus.busName || bus.busNumber : null
    await notify({
      userId: row.sentBy,
      title: 'Your ticket helped',
      message: name ? `Thank you! Your bus ticket helped add ${name} to GO-GO Ride.` : 'Thank you! Your bus ticket helped add a bus to GO-GO Ride.',
      type: 'USER',
    })
  }
  ok(res, await ticketOut(await byId('ticket_photos', row.id)), 'Saved')
})

router.delete('/admin/police-numbers/:id', requireAdmin, async (req, res) => {
  const row = await byId('police_numbers', req.params.id)
  if (!row) throw ApiError.notFound('Police number not found')
  await run('DELETE FROM police_numbers WHERE id = ?', row.id)
  await logActivity({ actorId: req.user.id, action: 'POLICE_NUMBER_DELETED', entityType: 'POLICE_NUMBER', entityId: row.id, message: `${row.stationName} deleted` })
  ok(res, null, 'Deleted')
})

export default router
