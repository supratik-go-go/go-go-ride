// Notifications feed and Help & Support tickets (port of app/api/messaging.py).
import { Router } from 'express'
import { all, at, byId, insert, like, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { meta, ok } from '../http.js'
import { newId, randomRef } from '../ids.js'
import { isAdmin, optionalUser, requireAdmin, requireUser } from '../auth.js'
import { notificationOut, supportTicketOut, ticketResponse } from '../serialize.js'
import { notify, notifyMany } from '../services/common.js'
import { ENUMS } from '../validate.js'
import { pyBody, pyEnum, pyOpt, pyPhone, pyStr, QueryReader, z } from '../pyvalidate.js'

const router = Router()

/** Personal notifications plus broadcasts (userId NULL). */
const VISIBLE = '(user_id = ? OR user_id IS NULL)'

const unreadCount = async (userId) =>
  Number((await scalar(`SELECT count(id) AS c FROM notifications WHERE ${VISIBLE} AND is_read = 0`, userId)) || 0)

// ---------------------------------------------------------------- notifications

router.get('/notifications', requireUser, async (req, res) => {
  const q = new QueryReader(req.query)
  const page = q.page()
  const type = q.enum('type', ENUMS.notificationType)
  const unreadOnly = q.bool('unreadOnly', false)
  q.done()

  const where = [VISIBLE]
  const params = [req.user.id]
  if (type) {
    where.push('type = ?')
    params.push(type)
  }
  if (unreadOnly) where.push('is_read = 0')
  const clause = where.join(' AND ')

  const total = Number((await scalar(`SELECT count(id) AS c FROM notifications WHERE ${clause}`, ...params)) || 0)
  const unread = await unreadCount(req.user.id)
  const items = await all(
    // Same-moment notifications newest-id first, as the old SQLite index returned them.
    `SELECT * FROM notifications WHERE ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  res.json({ success: true, message: 'Success', data: items.map(notificationOut), meta: meta(total, page, { unread }) })
})

router.get('/notifications/unread-count', requireUser, async (req, res) => ok(res, { count: await unreadCount(req.user.id) }))

router.patch('/notifications/read-all', requireUser, async (req, res) => {
  // Only the caller's own rows: broadcasts are shared and stay as they are.
  const { changes } = await run('UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0', at(Date.now()), req.user.id)
  ok(res, { updated: Number(changes) }, 'All notifications marked as read')
})

router.patch('/notifications/:notificationId/read', requireUser, async (req, res) => {
  // A broadcast row is shared, so marking it read marks it read for everyone (same as the Python service).
  // notification_reads will give everyone their own mark (phase B).
  await run(
    `UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ? AND ${VISIBLE}`,
    at(Date.now()),
    req.params.notificationId,
    req.user.id,
  )
  ok(res, null, 'Marked as read')
})

router.delete('/notifications/:notificationId', requireUser, async (req, res) => {
  await run('DELETE FROM notifications WHERE id = ? AND user_id = ?', req.params.notificationId, req.user.id)
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

router.post('/notifications/broadcast', requireAdmin, async (req, res) => {
  const { data: b } = pyBody(req, BroadcastBody)
  const content = { title: b.title, message: b.message, type: b.type, link: b.link ?? null }
  if (b.audience === 'ALL') {
    const notification = await notify({ userId: null, ...content })
    return ok(res, { id: notification.id, recipients: null }, 'Announcement published to all users', 201)
  }
  const userIds = (await all('SELECT id FROM users WHERE role = ? AND status = ? ORDER BY created_at, id', b.audience, 'ACTIVE')).map((u) => u.id)
  const count = await tx(() => notifyMany(userIds, content))
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

router.post('/support/tickets', optionalUser, async (req, res) => {
  const { data: b } = pyBody(req, TicketBody)
  const now = Date.now()
  const ticket = await insert('support_tickets', {
    id: newId(),
    ticketNumber: randomRef('TKT', 6),
    userId: req.user ? req.user.id : null,
    name: b.name,
    phone: b.phone,
    email: b.email ?? null,
    category: b.category,
    subject: b.subject,
    message: b.message,
    status: 'OPEN',
    priority: 'NORMAL',
    createdAt: now,
    updatedAt: now,
  })
  ok(res, await supportTicketOut(ticket), `Ticket ${ticket.ticketNumber} created. Our team will get back to you.`, 201)
})

router.get('/support/tickets', requireUser, async (req, res) => {
  const q = new QueryReader(req.query)
  const page = q.page()
  const status = q.enum('status', ENUMS.ticketStatus)
  const category = q.enum('category', ENUMS.ticketCategory)
  const priority = q.enum('priority', ENUMS.ticketPriority)
  q.done()

  const where = []
  const params = []
  if (!isAdmin(req.user)) {
    where.push('user_id = ?')
    params.push(req.user.id)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (category) {
    where.push('category = ?')
    params.push(category)
  }
  if (priority) {
    where.push('priority = ?')
    params.push(priority)
  }
  if (page.search) {
    where.push('(subject LIKE ? OR ticket_number LIKE ? OR name LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()), like(page.search))
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = Number((await scalar(`SELECT count(id) AS c FROM support_tickets ${clause}`, ...params)) || 0)
  const items = await all(`SELECT * FROM support_tickets ${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  res.json({ success: true, message: 'Success', data: await Promise.all(items.map(supportTicketOut)), meta: meta(total, page) })
})

router.get('/support/tickets/:ticketId', requireUser, async (req, res) => {
  const ticket = await byId('support_tickets', req.params.ticketId)
  if (!ticket) throw ApiError.notFound('Ticket not found')
  if (ticket.userId !== req.user.id && !isAdmin(req.user)) throw ApiError.forbidden()
  ok(res, await supportTicketOut(ticket))
})

const TicketUpdateBody = z.object({
  status: pyOpt(pyEnum(ENUMS.ticketStatus)),
  priority: pyOpt(pyEnum(ENUMS.ticketPriority)),
  response: pyOpt(pyStr({ max: 2000 })),
})

router.patch('/support/tickets/:ticketId', requireAdmin, async (req, res) => {
  const { data: b, set } = pyBody(req, TicketUpdateBody)
  const ticket = await byId('support_tickets', req.params.ticketId)
  if (!ticket) throw ApiError.notFound('Ticket not found')

  await tx(async () => {
    // Every field the client sent is written, nulls included (a null status/priority
    // fails the NOT NULL constraint -> 400 DB_ERROR, as in the Python service).
    // The reply is a team message on the ticket now; the app still sees it as "response".
    const current = { ...ticket, response: await ticketResponse(ticket.id) }
    const changed = Object.fromEntries(set.map((k) => [k, b[k] ?? null]).filter(([k, v]) => v !== current[k]))
    const { response, ...columns } = changed
    if (Object.keys(changed).length) await update('support_tickets', ticket.id, { ...columns, updatedAt: Date.now() })
    if ('response' in changed) {
      if (response === null) await run('DELETE FROM support_ticket_messages WHERE ticket_id = ? AND is_from_team = 1', ticket.id)
      else await insert('support_ticket_messages', { id: newId(), ticketId: ticket.id, sentBy: req.user.id, isFromTeam: 1, message: response, createdAt: Date.now() })
    }
    if (b.response && ticket.userId) {
      await notify({ userId: ticket.userId, title: `Reply on ticket ${ticket.ticketNumber}`, message: b.response, type: 'USER' })
    }
  })
  ok(res, await supportTicketOut(await byId('support_tickets', ticket.id)), 'Ticket updated')
})

export default router
