import { http } from '../api/client'

export const notificationService = {
  /** params: type, unreadOnly, page, limit. meta.unread carries the unread total. */
  list: (params) => http.page('/notifications', params),
  /** -> { count } */
  unreadCount: () => http.get('/notifications/unread-count'),
  markRead: (id) => http.patch(`/notifications/${id}/read`),
  markAllRead: () => http.patch('/notifications/read-all'),
  remove: (id) => http.del(`/notifications/${id}`),
  /** admin: { title, message, type, audience: ALL|PASSENGER|BUS_OWNER|DRIVER|ADMIN|SUPER_ADMIN, link? } */
  broadcast: (body) => http.post('/notifications/broadcast', body),
}

export const supportService = {
  /** { name, phone, email?, category, subject, message } - works signed out */
  create: (body) => http.post('/support/tickets', body),
  /** Own tickets for users, all tickets for admins. */
  list: (params) => http.page('/support/tickets', params),
  get: (id) => http.get(`/support/tickets/${id}`),
  /** admin: { status?, priority?, response? } */
  update: (id, body) => http.patch(`/support/tickets/${id}`, body),
}
