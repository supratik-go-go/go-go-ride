// Notifications feed and Help & Support tickets (port of app/api/messaging.py).
import { Router } from 'express'
import { all, byId, insert, like, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { meta, ok } from '../http.js'
import { newId, randomRef } from '../ids.js'
import { isAdmin, optionalUser, requireAdmin, requireUser } from '../auth.js'
import { notificationOut, supportTicketOut } from '../serialize.js'
import { notify, notifyMany } from '../services/common.js'
import { ENUMS } from '../validate.js'
import { pyBody, pyEnum, pyOpt, pyPhone, pyStr, QueryReader, z } from '../pyvalidate.js'

const router = Router()

/** Personal notifications plus broadcasts (userId NULL). */
const VISIBLE = '("Notification"."userId" = ? OR "Notification"."userId" IS NULL)'

const unreadCount = (userId) =>
  Number(scalar(`SELECT count("Notification".id) AS c FROM "Notification" WHERE ${VISIBLE} AND "Notification"."isRead" = 0`, userId) || 0)

// ---------------------------------------------------------------- notifications

router.get('/notifications', requireUser, (req, res) => {
  const q = new QueryReader(req.query)
  const page = q.page()
  const type = q.enum('type', ENUMS.notificationType)
  const unreadOnly = q.bool('unreadOnly', false)
  q.done()

  const where = [VISIBLE]
  const params = [req.user.id]
  if (type) {
    where.push('"Notification".type = ?')
    params.push(type)
  }
  if (unreadOnly) where.push('"Notification"."isRead" = 0')
  const clause = where.join(' AND ')

  const total = Number(scalar(`SELECT count("Notification".id) AS c FROM "Notification" WHERE ${clause}`, ...params) || 0)
  const unread = unreadCount(req.user.id)
  const items = all(
    `SELECT * FROM "Notification" WHERE ${clause} ORDER BY "Notification"."createdAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  res.json({ success: true, message: 'Success', data: items.map(notificationOut), meta: meta(total, page, { unread }) })
})

router.get('/notifications/unread-count', requireUser, (req, res) => ok(res, { count: unreadCount(req.user.id) }))

router.patch('/notifications/read-all', requireUser, (req, res) => {
  // Only the caller's own rows: broadcasts are shared and stay as they are.
  const { changes } = run(
    'UPDATE "Notification" SET "isRead" = 1, "readAt" = ? WHERE "userId" = ? AND "isRead" = 0',
    Date.now(),
    req.user.id,
  )
  ok(res, { updated: Number(changes) }, 'All notifications marked as read')
})

router.patch('/notifications/:notificationId/read', requireUser, (req, res) => {
  // A broadcast row is shared, so marking it read marks it read for everyone (same as the Python service).
  run(
    `UPDATE "Notification" SET "isRead" = 1, "readAt" = ? WHERE "Notification".id = ? AND ${VISIBLE}`,
    Date.now(),
    req.params.notificationId,
    req.user.id,
  )
  ok(res, null, 'Marked as read')
})

router.delete('/notifications/:notificationId', requireUser, (req, res) => {
  run('DELETE FROM "Notification" WHERE id = ? AND "userId" = ?', req.params.notificationId, req.user.id)
  ok(res, null, 'Notification removed')
})

const AUDIENCES = ['ALL', 'PASSENGER', 'BUS_OWNER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN']

const BroadcastBody = z.object({
  title: pyStr({ min: 2, max: 120 }),
  message: pyStr({ min: 2, max: 500 }),
  type: pyEnum(ENUMS.notificationType).default('SYSTEM'),
  audience: pyEnum(AUDIENCES).default('ALL'),
  link: pyOpt(pyStr()),
})

router.post('/notifications/broadcast', requireAdmin, (req, res) => {
  const { data: b } = pyBody(req, BroadcastBody)
  const content = { title: b.title, message: b.message, type: b.type, link: b.link ?? null }
  if (b.audience === 'ALL') {
    const notification = notify({ userId: null, ...content })
    return ok(res, { id: notification.id, recipients: null }, 'Announcement published to all users', 201)
  }
  const userIds = all('SELECT id FROM "User" WHERE role = ? AND status = ?', b.audience, 'ACTIVE').map((u) => u.id)
  const count = tx(() => notifyMany(userIds, content))
  ok(res, { recipients: count }, `Sent to ${count} ${b.audience.toLowerCase()} users`, 201)
})

// ---------------------------------------------------------------- support

const TicketBody = z.object({
  name: pyStr({ min: 2, max: 80 }),
  phone: pyPhone,
  email: pyOpt(pyStr()),
  category: pyEnum(ENUMS.ticketCategory).default('GENERAL'),
  subject: pyStr({ min: 3, max: 120 }),
  message: pyStr({ min: 5, max: 2000 }),
})

router.post('/support/tickets', optionalUser, (req, res) => {
  const { data: b } = pyBody(req, TicketBody)
  const now = Date.now()
  const ticket = insert('SupportTicket', {
    id: newId(),
    ticketRef: randomRef('TKT', 6),
    userId: req.user ? req.user.id : null,
    name: b.name,
    phone: b.phone,
    email: b.email ?? null,
    category: b.category,
    subject: b.subject,
    message: b.message,
    status: 'OPEN',
    priority: 'NORMAL',
    response: null,
    createdAt: now,
    updatedAt: now,
  })
  ok(res, supportTicketOut(ticket), `Ticket ${ticket.ticketRef} created. Our team will get back to you.`, 201)
})

router.get('/support/tickets', requireUser, (req, res) => {
  const q = new QueryReader(req.query)
  const page = q.page()
  const status = q.enum('status', ENUMS.ticketStatus)
  const category = q.enum('category', ENUMS.ticketCategory)
  const priority = q.enum('priority', ENUMS.ticketPriority)
  q.done()

  const where = []
  const params = []
  if (!isAdmin(req.user)) {
    where.push('"SupportTicket"."userId" = ?')
    params.push(req.user.id)
  }
  if (status) {
    where.push('"SupportTicket".status = ?')
    params.push(status)
  }
  if (category) {
    where.push('"SupportTicket".category = ?')
    params.push(category)
  }
  if (priority) {
    where.push('"SupportTicket".priority = ?')
    params.push(priority)
  }
  if (page.search) {
    where.push('("SupportTicket".subject LIKE ? OR "SupportTicket"."ticketRef" LIKE ? OR "SupportTicket".name LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()), like(page.search))
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = Number(scalar(`SELECT count("SupportTicket".id) AS c FROM "SupportTicket" ${clause}`, ...params) || 0)
  const items = all(
    `SELECT * FROM "SupportTicket" ${clause} ORDER BY "SupportTicket"."createdAt" DESC LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  res.json({ success: true, message: 'Success', data: items.map(supportTicketOut), meta: meta(total, page) })
})

router.get('/support/tickets/:ticketId', requireUser, (req, res) => {
  const ticket = byId('SupportTicket', req.params.ticketId)
  if (!ticket) throw ApiError.notFound('Ticket not found')
  if (ticket.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  ok(res, supportTicketOut(ticket))
})

const TicketUpdateBody = z.object({
  status: pyOpt(pyEnum(ENUMS.ticketStatus)),
  priority: pyOpt(pyEnum(ENUMS.ticketPriority)),
  response: pyOpt(pyStr({ max: 2000 })),
})

router.patch('/support/tickets/:ticketId', requireAdmin, (req, res) => {
  const { data: b, set } = pyBody(req, TicketUpdateBody)
  const ticket = byId('SupportTicket', req.params.ticketId)
  if (!ticket) throw ApiError.notFound('Ticket not found')

  tx(() => {
    // Every field the client sent is written, nulls included (a null status/priority
    // fails the NOT NULL constraint -> 400 DB_ERROR, as in the Python service).
    const changed = Object.fromEntries(set.map((k) => [k, b[k] ?? null]).filter(([k, v]) => v !== ticket[k]))
    if (Object.keys(changed).length) update('SupportTicket', ticket.id, { ...changed, updatedAt: Date.now() })
    if (b.response && ticket.userId) {
      notify({ userId: ticket.userId, title: `Reply on ticket ${ticket.ticketRef}`, message: b.response, type: 'USER' })
    }
  })
  ok(res, supportTicketOut(byId('SupportTicket', ticket.id)), 'Ticket updated')
})

export default router
