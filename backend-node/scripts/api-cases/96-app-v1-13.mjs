// App v1.13: Forgot password by a code sent to the account's email (free). The safety net runs as
// "development" with no mailbox set, so the code comes back as devCode instead of an email.
// Uses Asha (Google, number added in 95-app-v1-12) and a demo account with no email (made before
// email became required).
// Also Recent Searches by picked stops (change 1 of v1.13).
import jwt from 'jsonwebtoken'

const NO_EMAIL = '9123456787'
const ASHA = '9000077005'
const ASHA_EMAIL = 'asha.roy@example.com'
const googleToken = (claims) =>
  jwt.sign({ iss: 'https://accounts.google.com', aud: 'check-client.apps.googleusercontent.com', email_verified: true, ...claims }, globalThis.googleTestKey, {
    algorithm: 'RS256',
    keyid: 'check-google-key',
    expiresIn: '1h',
  })
const bina = { sub: '100000000000000000003', email: 'bina.sen@example.com', name: 'Bina Sen' }
const freshCode = async (get, post) => ({ resetCode: (await post('/auth/password/email-code', { login: ASHA }))?.devCode })

const cases = [
  // Email is required since v1.13: at sign-up, and it can't be removed later.
  { name: 'register: no email', method: 'POST', path: '/auth/register', body: { name: 'Mita Pal', phone: '9000077020', password: 'Mita@1234' } },
  { name: 'register: bad email', method: 'POST', path: '/auth/register', body: { name: 'Mita Pal', phone: '9000077020', email: 'mita-at-example', password: 'Mita@1234' } },
  { name: 'profile: remove the email', method: 'PATCH', path: '/users/me', as: 'admin', body: { email: '' } },
  { name: 'profile: bad email', method: 'PATCH', path: '/users/me', as: 'admin', body: { email: 'not-an-email' } },

  { name: 'email reset: unknown number', method: 'POST', path: '/auth/password/email-code', body: { login: '9000077099' } },
  { name: 'email reset: unknown email', method: 'POST', path: '/auth/password/email-code', body: { login: 'nobody@example.com' } },
  { name: 'email reset: nothing typed', method: 'POST', path: '/auth/password/email-code', body: { login: '' }, mode: 'status' },
  { name: 'email reset: account without email', method: 'POST', path: '/auth/password/email-code', body: { login: NO_EMAIL } },
  {
    name: 'email reset: Google account without a number',
    method: 'POST',
    path: '/auth/password/email-code',
    prepare: async (get, post) => ({ bina: await post('/auth/google', { idToken: googleToken(bina) }) }),
    body: { login: bina.email },
  },
  { name: 'email reset: code by number', method: 'POST', path: '/auth/password/email-code', body: { login: `+91 ${ASHA.slice(0, 5)} ${ASHA.slice(5)}` }, ignore: ['devCode'] },
  { name: 'email reset: code by email', method: 'POST', path: '/auth/password/email-code', body: { login: ASHA_EMAIL.toUpperCase() }, ignore: ['devCode'] },
  { name: 'email reset: wrong code', method: 'POST', path: '/auth/password/reset-by-email', body: { login: ASHA, code: '000000', newPassword: 'Asha@5678' } },
  { name: 'email reset: short new password', method: 'POST', path: '/auth/password/reset-by-email', body: { login: ASHA, code: '123456', newPassword: '123' }, mode: 'status' },
  {
    name: 'email reset: right code signs in',
    method: 'POST',
    path: '/auth/password/reset-by-email',
    prepare: freshCode,
    body: (ctx) => ({ login: ASHA_EMAIL, code: ctx.resetCode, newPassword: 'Asha@5678' }),
    ignore: ['id', 'lastLoginAt'],
  },
  { name: 'email reset: the code is used up', method: 'POST', path: '/auth/password/reset-by-email', body: (ctx) => ({ login: ASHA, code: ctx.resetCode, newPassword: 'Other@5678' }) },
  { name: 'email reset: the new password works', method: 'POST', path: '/auth/login', body: { phone: ASHA, password: 'Asha@5678' }, ignore: ['id', 'lastLoginAt'] },
  { name: 'email reset: too many in a minute', method: 'POST', path: '/auth/password/email-code', body: { login: ASHA } },

  // Recent Searches: stops picked from the suggestions arrive as ids; their names are kept (it showed
  // "Anywhere -> Anywhere"), and the same search again moves to the top instead of adding a copy.
  { name: 'recent: search by picked stops', path: (ctx) => `/buses/search?fromStopId=${ctx.stops?.[0]?.id}&toStopId=${ctx.stops?.[1]?.id}`, as: 'admin', mode: 'status' },
  { name: 'recent: the same search again', path: (ctx) => `/buses/search?fromStopId=${ctx.stops?.[0]?.id}&toStopId=${ctx.stops?.[1]?.id}`, as: 'admin', mode: 'status' },
  { name: 'recent: names kept, no copy', path: '/users/me/recent-searches?limit=3', as: 'admin', ignore: ['id'] },
]

export default cases
