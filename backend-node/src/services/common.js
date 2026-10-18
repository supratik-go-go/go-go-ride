// In-app notifications and the admin audit trail (port of app/services/common.py).
import { insert } from '../db.js'
import { newId } from '../ids.js'

/**
 * Persist an in-app notification. userId null = broadcast to everyone.
 * Push/SMS delivery is pluggable: add it in dispatch() when FCM / an SMS gateway is wired.
 */
export function notify({ userId = null, title, message, type = 'SYSTEM', link = null }) {
  const row = insert('Notification', {
    id: newId(),
    userId,
    title,
    message,
    type,
    link,
    isRead: 0,
    readAt: null,
    createdAt: Date.now(),
  })
  dispatch(row)
  return row
}

export function notifyMany(userIds, { title, message, type = 'SYSTEM', link = null }) {
  for (const userId of userIds) notify({ userId, title, message, type, link })
  return userIds.length
}

function dispatch(n) {
  console.log(`[notify:${n.id}] ${n.title} -> ${n.userId || 'broadcast'}`)
}

/** Feeds the admin dashboard's "Recent Activities" list. Never breaks the request. */
export function logActivity({ actorId = null, action, message, entityType = null, entityId = null }) {
  try {
    insert('ActivityLog', { id: newId(), actorId, action, entityType, entityId, message, createdAt: Date.now() })
  } catch (err) {
    console.error('[activity] failed to log', action, err.message)
  }
}
