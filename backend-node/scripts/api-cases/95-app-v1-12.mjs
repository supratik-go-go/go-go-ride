// App v1.12: proving a mobile number by sending an SMS (services/phoneCheck.js). The safety net runs
// with number checks on (SMS_RECEIVE_NUMBER is set in api-check.mjs) and plays the SMS phone by posting
// to /sms/incoming/check-key. The clock is frozen, so a number gets 3 checks in the whole run.
// Sign in with Google: api-check.mjs plays Google's key server; tokens are signed here.
// Runs last: the password change at the end signs the passenger out.
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

const NEW = '9000077001'
const KEY = 'check-key'
const sms = (sender, message, event = 'sms:received') => ({
  deviceId: 'device-1',
  event,
  id: 'event-1',
  webhookId: 'webhook-1',
  payload: { messageId: 'message-1', message, sender, recipient: '+919000012345', simNumber: 1, receivedAt: '2026-09-22T10:00:00.000+05:30' },
})
const start = (key, purpose, phone, role) => async (get, post) => ({ [key]: await post('/auth/phone-check/start', { purpose, phone }, role) })
const ids = (check) => ({ checkId: check?.checkId, checkToken: check?.checkToken })
const codeOf = (check) => String(check?.message || '').split(' ')[1]
const random = ['checkId', 'checkToken', 'message']
const riya = { name: 'Riya Das', phone: NEW, email: 'riya.das@example.com', password: 'Riya@1234' }

const GOOGLE_CLIENT = 'check-client.apps.googleusercontent.com'
const signGoogle = (claims, key) =>
  jwt.sign({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT, email_verified: true, ...claims }, key, {
    algorithm: 'RS256',
    keyid: 'check-google-key',
    ...(claims.exp ? {} : { expiresIn: '1h' }),
  })
const googleToken = (claims) => signGoogle(claims, globalThis.googleTestKey)
const strangerKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
const asha = { sub: '100000000000000000001', email: 'asha.roy@example.com', name: 'Asha Roy' }
const ASHA_PHONE = '9000077005'
const asAsha = (ctx) => ctx.asha?.accessToken

const cases = [
  { name: 'check: needed', path: '/auth/phone-check' },
  { name: 'check: sign-up for a taken number', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'REGISTER', phone: '9123456789' } },
  { name: 'check: reset for an unknown number', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'RESET', phone: '9000077099' } },
  { name: 'check: change signed out', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'CHANGE' } },
  { name: 'check: no number', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'REGISTER' } },
  { name: 'check: unknown purpose', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'LOGIN', phone: NEW }, mode: 'status' },
  { name: 'register: without a check', method: 'POST', path: '/auth/register', body: riya },

  // ------------------------------------------------------------ sign-up
  { name: 'check: start sign-up', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'REGISTER', phone: NEW }, ignore: random },
  { name: 'check: waiting for the SMS', method: 'POST', path: '/auth/phone-check/status', prepare: start('reg', 'REGISTER', NEW), body: (ctx) => ids(ctx.reg) },
  { name: 'check: wrong token', method: 'POST', path: '/auth/phone-check/status', body: (ctx) => ({ checkId: ctx.reg?.checkId, checkToken: 'not-the-token' }) },
  { name: 'register: SMS not arrived yet', method: 'POST', path: '/auth/register', body: (ctx) => ({ ...riya, ...ids(ctx.reg) }) },
  { name: 'sms: wrong key', method: 'POST', path: '/sms/incoming/nope', body: (ctx) => sms(`+91${NEW}`, `GOGO ${codeOf(ctx.reg)}`) },
  { name: 'sms: from another number', method: 'POST', path: `/sms/incoming/${KEY}`, body: (ctx) => sms('+919000077002', `GOGO ${codeOf(ctx.reg)}`) },
  { name: 'sms: wrong code', method: 'POST', path: `/sms/incoming/${KEY}`, body: sms(`+91${NEW}`, 'GOGO 000000') },
  { name: 'sms: not a received SMS', method: 'POST', path: `/sms/incoming/${KEY}`, body: (ctx) => sms(`+91${NEW}`, `GOGO ${codeOf(ctx.reg)}`, 'sms:sent') },
  { name: 'sms: from the right number', method: 'POST', path: `/sms/incoming/${KEY}`, body: (ctx) => sms(NEW, `Gogo ${codeOf(ctx.reg)} `) },
  { name: 'check: verified', method: 'POST', path: '/auth/phone-check/status', body: (ctx) => ids(ctx.reg) },
  { name: 'register: check of another number', method: 'POST', path: '/auth/register', body: (ctx) => ({ ...riya, phone: '9000077003', ...ids(ctx.reg) }) },
  { name: 'register: with the check', method: 'POST', path: '/auth/register', body: (ctx) => ({ ...riya, ...ids(ctx.reg) }), ignore: ['id', 'lastLoginAt'] },
  { name: 'check: used up', method: 'POST', path: '/auth/phone-check/status', body: (ctx) => ids(ctx.reg) },

  // ------------------------------------------------------------ forgot password
  { name: 'reset: waiting for the SMS', method: 'POST', path: '/auth/phone-check/status', prepare: start('rst', 'RESET', NEW), body: (ctx) => ids(ctx.rst) },
  { name: 'reset: the SMS arrives', method: 'POST', path: `/sms/incoming/${KEY}`, body: (ctx) => sms(`+91${NEW}`, `GOGO ${codeOf(ctx.rst)}`) },
  { name: 'reset: no check or code', method: 'POST', path: '/auth/password/reset', body: { phone: NEW, newPassword: 'Riya@5678' } },
  { name: 'reset: a sign-up check', method: 'POST', path: '/auth/password/reset', body: (ctx) => ({ phone: NEW, newPassword: 'Riya@5678', ...ids(ctx.reg) }) },
  { name: 'reset: with the check', method: 'POST', path: '/auth/password/reset', body: (ctx) => ({ phone: NEW, newPassword: 'Riya@5678', ...ids(ctx.rst) }), ignore: ['id', 'lastLoginAt'] },
  { name: 'reset: the new password works', method: 'POST', path: '/auth/login', body: { phone: NEW, password: 'Riya@5678' }, ignore: ['id', 'lastLoginAt'] },
  { name: 'check: too many in a minute', method: 'POST', path: '/auth/phone-check/start', body: { purpose: 'RESET', phone: NEW } },

  // ------------------------------------------------------------ Sign in with Google (no mobile number needed)
  { name: 'google: client id', path: '/auth/google' },
  { name: 'google: not a token', method: 'POST', path: '/auth/google', body: { idToken: 'this-is-not-a-google-token' } },
  { name: 'google: signed by someone else', method: 'POST', path: '/auth/google', body: () => ({ idToken: signGoogle(asha, strangerKey) }) },
  { name: 'google: for another app', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken({ ...asha, aud: 'other-app.apps.googleusercontent.com' }) }) },
  { name: 'google: expired', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken({ ...asha, exp: Math.floor(Date.now() / 1000) - 60 }) }) },
  { name: 'google: email not confirmed', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken({ ...asha, email_verified: false }) }) },
  { name: 'google: new account', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken(asha) }), ignore: ['id'] },
  { name: 'google: same account again', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken(asha) }), ignore: ['id'] },
  { name: 'google: another Google account, same Gmail', method: 'POST', path: '/auth/google', body: () => ({ idToken: googleToken({ ...asha, sub: '100000000000000000002' }) }) },
  {
    name: 'google: signed in, no number',
    path: '/auth/me',
    prepare: async (get, post) => ({ asha: await post('/auth/google', { idToken: googleToken(asha) }) }),
    token: asAsha,
    ignore: ['id'],
  },
  { name: 'google: password before a number', method: 'POST', path: '/auth/change-password', token: asAsha, body: { newPassword: 'Asha@1234' } },
  { name: 'google: number check for a password', method: 'POST', path: '/auth/phone-check/start', token: asAsha, body: { purpose: 'CHANGE' } },
  { name: 'google: add a number without a check', method: 'POST', path: '/users/me/phone', token: asAsha, body: { phone: ASHA_PHONE } },
  { name: 'google: add a taken number', method: 'POST', path: '/users/me/phone', token: asAsha, body: { phone: NEW } },
  {
    name: 'google: add the number',
    method: 'POST',
    path: '/users/me/phone',
    prepare: async (get, post) => {
      const check = await post('/auth/phone-check/start', { purpose: 'REGISTER', phone: ASHA_PHONE })
      await post(`/sms/incoming/${KEY}`, sms(`+91${ASHA_PHONE}`, check?.message))
      return { ashaCheck: check }
    },
    token: asAsha,
    body: (ctx) => ({ phone: ASHA_PHONE, ...ids(ctx.ashaCheck) }),
    ignore: ['id'],
  },
  { name: 'google: number already added', method: 'POST', path: '/users/me/phone', token: asAsha, body: { phone: '9000077006' } },

  // ------------------------------------------------------------ change password (signs the passenger out)
  { name: 'change: no check', method: 'POST', path: '/auth/change-password', as: 'passenger', body: { currentPassword: 'anything', newPassword: 'Pass@9999' } },
  { name: 'change: start', method: 'POST', path: '/auth/phone-check/start', as: 'passenger', body: { purpose: 'CHANGE', phone: NEW }, ignore: random },
  {
    name: 'change: the SMS arrives',
    method: 'POST',
    path: `/sms/incoming/${KEY}`,
    prepare: start('chg', 'CHANGE', undefined, 'passenger'),
    body: (ctx) => sms(`+91${ctx.users.passenger.phone}`, `GOGO ${codeOf(ctx.chg)}`),
  },
  { name: "change: another account's check", method: 'POST', path: '/auth/change-password', as: 'owner', body: (ctx) => ({ newPassword: 'Pass@9999', ...ids(ctx.chg) }) },
  { name: 'change: with the check', method: 'POST', path: '/auth/change-password', as: 'passenger', body: (ctx) => ({ newPassword: 'Pass@9999', ...ids(ctx.chg) }) },
  { name: 'change: the new password works', method: 'POST', path: '/auth/login', body: (ctx) => ({ phone: ctx.users.passenger.phone, password: 'Pass@9999' }), ignore: ['lastLoginAt'] },
]

export default cases
