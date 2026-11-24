// App v1.11: forgot password by an SMS code (purpose RESET; the safety net runs as "development",
// so the code comes back as devCode instead of an SMS), and bus ticket photos from Add Bus Info.
const DRIVER = '9000011223'
const resetCode = async (get, post) => ({ resetCode: (await post('/auth/otp/request', { phone: DRIVER, purpose: 'RESET' }))?.devCode })
const firstNewTicket = async (get) => ({
  ticketId: (await get('/admin/ticket-photos?status=NEW', 'admin'))?.[0]?.id,
  someBusId: (await get('/buses?limit=1', 'admin'))?.[0]?.id,
})
const ticket = { path: 'files/ticket.jpg', type: 'image/jpeg' }

const cases = [
  { name: 'reset: code for an unknown number', method: 'POST', path: '/auth/otp/request', body: { phone: '9000000099', purpose: 'RESET' } },
  { name: 'reset: code for an account', method: 'POST', path: '/auth/otp/request', body: { phone: DRIVER, purpose: 'RESET' }, ignore: ['devCode'] },
  { name: 'reset: wrong code', method: 'POST', path: '/auth/password/reset', body: { phone: DRIVER, code: '000000', newPassword: 'NewPass@123' } },
  { name: 'reset: short new password', method: 'POST', path: '/auth/password/reset', body: { phone: DRIVER, code: '123456', newPassword: '123' } },
  {
    name: 'reset: right code signs in',
    method: 'POST',
    path: '/auth/password/reset',
    prepare: resetCode,
    body: (ctx) => ({ phone: DRIVER, code: ctx.resetCode, newPassword: 'NewPass@123' }),
    ignore: ['lastLoginAt'],
  },
  { name: 'reset: the new password works', method: 'POST', path: '/auth/login', body: { phone: DRIVER, password: 'NewPass@123' }, ignore: ['lastLoginAt'] },
  { name: 'reset: the code is used up', method: 'POST', path: '/auth/password/reset', body: (ctx) => ({ phone: DRIVER, code: ctx.resetCode, newPassword: 'Other@123' }) },

  { name: 'ticket: send signed out', method: 'POST', path: '/ticket-photos', file: ticket },
  { name: 'ticket: send without a photo', method: 'POST', path: '/ticket-photos', as: 'passenger' },
  { name: 'ticket: send a non-photo', method: 'POST', path: '/ticket-photos', as: 'passenger', file: { path: 'files/bus-trips.xlsx' } },
  { name: 'ticket: send', method: 'POST', path: '/ticket-photos', as: 'passenger', file: { ...ticket, fields: { note: 'Howrah to Digha, 7 AM' } }, ignore: ['id', 'photoUrl'] },
  { name: 'ticket: admin list as passenger', path: '/admin/ticket-photos', as: 'passenger', mode: 'status' },
  { name: 'ticket: admin list', path: '/admin/ticket-photos?status=NEW', as: 'admin', ignore: ['id', 'photoUrl'] },
  {
    name: 'ticket: used to add a bus',
    method: 'PATCH',
    path: (ctx) => `/admin/ticket-photos/${ctx.ticketId}`,
    as: 'admin',
    prepare: firstNewTicket,
    body: (ctx) => ({ status: 'USED', busId: ctx.someBusId }),
    ignore: ['id', 'photoUrl'],
  },
  { name: 'ticket: unknown bus', method: 'PATCH', path: (ctx) => `/admin/ticket-photos/${ctx.ticketId}`, as: 'admin', body: { status: 'USED', busId: 'nope' } },
]

export default cases
