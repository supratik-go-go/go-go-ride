// Fixes from the 2026-11-28 security and code review. Uses Asha (a Google account with a number, and
// the password Asha@5678 from 96-app-v1-13) and Bina (a Google account without a number, 96). The
// clock is frozen, so every attempt counts as "in the last minute".
const ASHA = '9000077005'
const ASHA_PASSWORD = 'Asha@5678'
const NEW_EMAIL = 'asha.work@example.com'
const asAsha = (ctx) => ctx.asha?.accessToken
const asBina = (ctx) => ctx.bina?.accessToken
const ride = (ctx, extra) => ({ fromStopId: ctx.stops?.[0]?.id, toStopId: ctx.stops?.[1]?.id, departureAt: '2026-09-23T09:00:00', farePerSeat: 40, ...extra })

const cases = [
  // A ride shows its driver's phone number, so only an admin may name someone else as the driver.
  { name: 'ride: a passenger names someone else as driver', method: 'POST', path: '/rides', as: 'passenger', body: (ctx) => ride(ctx, { driverId: ctx.users.admin?.id }) },
  { name: 'ride: an admin names the driver', method: 'POST', path: '/rides', as: 'admin', body: (ctx) => ride(ctx, { driverId: ctx.users.driver?.id }), ignore: ['id'] },
  { name: 'ride: the driver hands it to someone else', method: 'PATCH', path: (ctx) => `/rides/${ctx.rideId}`, as: 'driver', body: (ctx) => ({ driverId: ctx.users.passenger?.id }) },

  // Who added a bus stays private (imported buses would all name the admin's account).
  { name: 'bus: the public page hides who added it', path: (ctx) => `/buses/${ctx.busId}` },

  // A photo comes only from an upload; the address can only be removed.
  { name: 'profile: photo set to another file', method: 'PATCH', path: '/users/me', as: 'passenger', body: { avatarUrl: '/uploads/cars/someone-else.jpg' } },
  { name: 'profile: photo removed', method: 'PATCH', path: '/users/me', as: 'passenger', body: { avatarUrl: null }, ignore: ['lastLoginAt'] },

  // Confirming an email: the password is asked for, and the code comes back (devCode here, no mailbox).
  { name: 'email confirm: no password', method: 'POST', path: '/users/me/email/code', token: asAsha, body: { email: NEW_EMAIL } },
  { name: 'email confirm: wrong password', method: 'POST', path: '/users/me/email/code', token: asAsha, body: { email: NEW_EMAIL, password: 'Wrong@1234' } },
  { name: 'email confirm: bad email', method: 'POST', path: '/users/me/email/code', token: asAsha, body: { email: 'asha-at-work', password: ASHA_PASSWORD }, mode: 'status' },
  { name: 'email confirm: confirmed on another account', method: 'POST', path: '/users/me/email/code', token: asAsha, body: { email: 'bina.sen@example.com', password: ASHA_PASSWORD } },
  { name: 'email confirm: code sent', method: 'POST', path: '/users/me/email/code', token: asAsha, body: { email: NEW_EMAIL, password: ASHA_PASSWORD }, ignore: ['devCode'] },
  { name: 'email confirm: wrong code', method: 'POST', path: '/users/me/email/confirm', token: asAsha, body: { code: '000000' } },
  {
    name: 'email confirm: right code',
    method: 'POST',
    path: '/users/me/email/confirm',
    prepare: async (get, post, ctx) => ({ emailCode: (await post('/users/me/email/code', { email: NEW_EMAIL, password: ASHA_PASSWORD }, asAsha(ctx)))?.devCode }),
    token: asAsha,
    body: (ctx) => ({ code: ctx.emailCode }),
    ignore: ['id', 'lastLoginAt'],
  },
  { name: 'email confirm: the code is used up', method: 'POST', path: '/users/me/email/confirm', token: asAsha, body: (ctx) => ({ code: ctx.emailCode }) },
  { name: 'email confirm: a Google account needs no password', method: 'POST', path: '/users/me/email/code', token: asBina, body: { email: 'bina.work@example.com' }, ignore: ['devCode'] },

  // A changed email has to be confirmed again; until then Forgot password doesn't use it.
  { name: 'email confirm: changing the email unconfirms it', method: 'PATCH', path: '/users/me', token: asAsha, body: { email: 'asha.home@example.com' }, ignore: ['id', 'lastLoginAt'] },
  { name: 'email reset: unconfirmed email', method: 'POST', path: '/auth/password/email-code', body: { login: ASHA } },

  // 10 wrong passwords on one account in 15 minutes, then even the right one has to wait.
  {
    name: 'login: one account after 10 wrong passwords',
    method: 'POST',
    path: '/auth/login',
    prepare: async (get, post) => {
      for (let i = 0; i < 10; i++) await post('/auth/login', { phone: ASHA, password: 'Wrong@0000' })
      return {}
    },
    body: { phone: ASHA, password: ASHA_PASSWORD },
  },
]

export default cases
