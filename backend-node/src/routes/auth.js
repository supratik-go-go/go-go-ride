// Registration, password and OTP sign-in, token rotation (port of app/api/auth.py), the free
// mobile number check by SMS (services/phoneCheck.js) for sign-up and password changes, and
// Sign in with Google (services/google.js).
import crypto from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { at, byId, get, insert, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok } from '../http.js'
import { generateOtp, newId } from '../ids.js'
import {
  clientContext,
  createAccessToken,
  createRefreshToken,
  decodeRefreshToken,
  hashCode,
  hashPassword,
  hashToken,
  optionalUser,
  requireUser,
  verifyCode,
  verifyPassword,
} from '../auth.js'
import { userOut } from '../serialize.js'
import { googleOn, verifyGoogleToken } from '../services/google.js'
import { checkStatus, smsReceived, startCheck, useCheck } from '../services/phoneCheck.js'
import { linkSmsPhone, phoneChecksOn } from '../services/sms.js'
import { body, email, ENUMS, name, oneOf, opt, password, phone, z } from '../validate.js'

const router = Router()

/** Issue an access + refresh token pair. `recordLogin` adds a login-history row (not on refresh). */
export async function issueSession(user, ctx, { recordLogin = true } = {}) {
  const access = createAccessToken(user.id, user.role, user.phone)
  const { token: refresh, expiresAt } = createRefreshToken(user.id)
  const now = Date.now()
  await tx(async () => {
    await insert('sign_in_sessions', { id: newId(), userId: user.id, tokenHash: hashToken(refresh), expiresAt, revokedAt: null, createdAt: now })
    await update('users', user.id, { lastLoginAt: now, updatedAt: now })
    if (recordLogin) {
      await insert('login_history', { id: newId(), userId: user.id, device: ctx.device, ipAddress: ctx.ip, location: null, status: 'SUCCESS', createdAt: now })
    }
  })
  return { user: userOut(await byId('users', user.id)), accessToken: access, refreshToken: refresh }
}

const findByPhone = (p) => get('SELECT * FROM users WHERE phone = ?', p)

// A finished number check from /auth/phone-check (both or neither).
const checkFields = {
  checkId: opt(z.string().max(64)),
  checkToken: opt(z.string().max(100)),
}

// A Google sign-in has no mobile number until the person adds one; a password goes with the number.
const needsNumber = () => new ApiError(400, 'Add your mobile number first (Settings > Mobile Number): you sign in with the number and password.', 'PHONE_MISSING')

// Apps before v1.12 don't know the check; they get this instead of a confusing field error.
const updateApp = () => new ApiError(400, 'Verify your mobile number first: update GO-GO Ride to the latest version.', 'PHONE_CHECK_REQUIRED')

// ---------------------------------------------------------------- register

const RegisterBody = z.object({
  name,
  phone,
  email: opt(email),
  password,
  role: oneOf(ENUMS.publicRole).default('PASSENGER'),
  ...checkFields,
})

// Once number checks are switched on, a new account needs a check that proves its number.
router.post('/auth/register', async (req, res) => {
  const b = body(req, RegisterBody)
  if (await findByPhone(b.phone)) throw ApiError.conflict('An account with this mobile number already exists')
  if (b.email && (await get('SELECT id FROM users WHERE email = ?', b.email))) throw ApiError.conflict('An account with this email already exists')
  const checked = phoneChecksOn()
  if (checked && !b.checkId) throw updateApp()
  const now = Date.now()
  const user = await tx(async () => {
    if (checked) await useCheck({ checkId: b.checkId, checkToken: b.checkToken, phone: b.phone, purpose: 'REGISTER' })
    return insert('users', {
      id: newId(),
      name: b.name,
      phone: b.phone,
      email: b.email || null,
      password: hashPassword(b.password),
      role: b.role,
      pictureUrl: null,
      status: 'ACTIVE',
      phoneVerified: checked ? 1 : 0,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    })
  })
  ok(res, await issueSession(user, clientContext(req)), 'Account created successfully', 201)
})

// ---------------------------------------------------------------- password login

const LoginBody = z.object({
  phone,
  password: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1, 'Field required')),
})

router.post('/auth/login', async (req, res) => {
  const b = body(req, LoginBody)
  const ctx = clientContext(req)
  const user = await findByPhone(b.phone)
  if (!user || !user.password) throw ApiError.unauthorized('Invalid mobile number or password')
  if (!verifyPassword(b.password, user.password)) {
    await insert('login_history', { id: newId(), userId: user.id, device: ctx.device, ipAddress: ctx.ip, location: null, status: 'FAILED', createdAt: Date.now() })
    throw ApiError.unauthorized('Invalid mobile number or password')
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  ok(res, await issueSession(user, ctx), 'Logged in successfully')
})

// ---------------------------------------------------------------- OTP

const OtpRequestBody = z.object({ phone, purpose: oneOf(ENUMS.otpPurpose).default('LOGIN') })

router.post('/auth/otp/request', async (req, res) => {
  const b = body(req, OtpRequestBody)
  const recent = Number((await scalar('SELECT COUNT(id) FROM otp_codes WHERE phone = ? AND created_at >= ?', b.phone, at(Date.now() - 60000))) || 0)
  if (recent >= 3) throw ApiError.tooMany('Please wait a minute before requesting another code')
  // Forgot password only works for an account that exists.
  if (b.purpose === 'RESET' && !(await findByPhone(b.phone))) throw ApiError.notFound('No account with this mobile number')
  // The live server sends no SMS (people prove their number by sending one, see /auth/phone-check),
  // so a code here would never arrive. Apps before v1.12 asked for one to reset a password.
  if (config.isProd) {
    throw new ApiError(503, 'Update GO-GO Ride to reset your password, or contact GO-GO Ride support.', 'SMS_NOT_READY')
  }
  const code = generateOtp()
  const expiresAt = Date.now() + config.otpExpiryMinutes * 60000
  await insert('otp_codes', { id: newId(), phone: b.phone, codeHash: hashCode(code), purpose: b.purpose, expiresAt, consumedAt: null, attempts: 0, createdAt: Date.now() })
  console.log(`[otp] ${b.phone} -> ${config.echoOtp ? code : '******'} (expires ${new Date(expiresAt).toISOString()})`)
  const data = { phone: b.phone, expiresInSeconds: config.otpExpiryMinutes * 60 }
  if (config.echoOtp) data.devCode = code
  ok(res, data, 'Verification code sent')
})

const OtpVerifyBody = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  purpose: oneOf(ENUMS.otpPurpose).default('LOGIN'),
  name: opt(name),
  role: opt(oneOf(ENUMS.publicRole)),
})

/** The latest unused code for this phone and purpose, if `code` matches; a wrong guess is counted. */
async function checkCode(phoneNumber, purpose, code) {
  const record = await get(
    'SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1',
    phoneNumber,
    purpose,
  )
  if (!record) throw ApiError.badRequest('Request a new verification code')
  if (record.expiresAt < Date.now()) throw ApiError.badRequest('This code has expired')
  if (record.attempts >= config.otpMaxAttempts) throw ApiError.tooMany('Too many incorrect attempts, request a new code')
  if (!verifyCode(code, record.codeHash)) {
    await run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', record.id)
    throw ApiError.badRequest('Incorrect verification code')
  }
  return record
}

router.post('/auth/otp/verify', async (req, res) => {
  const b = body(req, OtpVerifyBody)
  const record = await checkCode(b.phone, b.purpose, b.code)

  let isNewUser = false
  const user = await tx(async () => {
    const now = Date.now()
    await run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', at(now), record.id)
    let u = await findByPhone(b.phone)
    if (!u) {
      // The OTP doubles as sign-up: the phone is proven at this point.
      u = await insert('users', {
        id: newId(),
        name: (b.name || '').trim() || `Rider ${b.phone.slice(-4)}`,
        phone: b.phone,
        email: null,
        password: null,
        role: b.role || 'PASSENGER',
        pictureUrl: null,
        status: 'ACTIVE',
        phoneVerified: 1,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      })
      isNewUser = true
    } else if (!u.phoneVerified) {
      await update('users', u.id, { phoneVerified: 1, updatedAt: now })
    }
    return byId('users', u.id)
  })
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  const session = await issueSession(user, clientContext(req))
  ok(res, { ...session, isNewUser }, isNewUser ? 'Welcome to GO-GO Ride' : 'Logged in successfully')
})

// ---------------------------------------------------------------- forgot password

const PasswordResetBody = z.object({
  phone,
  code: opt(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code')),
  newPassword: password,
  ...checkFields,
})

// A number check (purpose RESET) proves the phone; development builds can still use a code from
// /auth/otp/request. Every other sign-in of the account ends.
router.post('/auth/password/reset', async (req, res) => {
  const b = body(req, PasswordResetBody)
  const user = await findByPhone(b.phone)
  if (!user) throw ApiError.notFound('No account with this mobile number')
  if (!b.checkId && !b.code) throw ApiError.badRequest('Verify your mobile number first')
  const record = b.checkId ? null : await checkCode(b.phone, 'RESET', b.code)
  const now = Date.now()
  await tx(async () => {
    if (record) await run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', at(now), record.id)
    else await useCheck({ checkId: b.checkId, checkToken: b.checkToken, phone: b.phone, purpose: 'RESET' })
    await update('users', user.id, { password: hashPassword(b.newPassword), phoneVerified: 1, updatedAt: now })
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id = ?', at(now), user.id)
  })
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  const session = await issueSession(await byId('users', user.id), clientContext(req))
  ok(res, session, 'Password changed. You are signed in.')
})

// ---------------------------------------------------------------- refresh / logout

const RefreshBody = z.object({ refreshToken: z.string().min(10, 'String should have at least 10 characters') })

router.post('/auth/refresh', async (req, res) => {
  const b = body(req, RefreshBody)
  const payload = decodeRefreshToken(b.refreshToken)
  const stored = await get('SELECT * FROM sign_in_sessions WHERE token_hash = ?', hashToken(b.refreshToken))
  if (!stored || stored.revokedAt !== null || stored.expiresAt < Date.now()) {
    throw ApiError.unauthorized('Session expired, please sign in again')
  }
  const user = await byId('users', payload.sub)
  if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('Account unavailable')
  await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE id = ?', at(Date.now()), stored.id)
  // A token refresh is not a new sign-in, so it is not added to the login history.
  const session = await issueSession(user, clientContext(req), { recordLogin: false })
  ok(res, { accessToken: session.accessToken, refreshToken: session.refreshToken }, 'Session refreshed')
})

const LogoutBody = z.object({ refreshToken: opt(z.string()) })

router.post('/auth/logout', requireUser, async (req, res) => {
  const b = body(req, LogoutBody)
  if (b.refreshToken) {
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND token_hash = ?', at(Date.now()), hashToken(b.refreshToken))
  } else {
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id = ?', at(Date.now()), req.user.id)
  }
  ok(res, null, 'Logged out')
})

// ---------------------------------------------------------------- me / change password

router.get('/auth/me', requireUser, (req, res) => ok(res, userOut(req.user)))

const ChangePasswordBody = z.object({
  currentPassword: opt(z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string())),
  newPassword: password,
  ...checkFields,
})

// Once number checks are on, the account's own number proves the person (no current password
// needed); before that, the current password does.
router.post('/auth/change-password', requireUser, async (req, res) => {
  const b = body(req, ChangePasswordBody)
  const user = req.user
  if (!user.phone) throw needsNumber()
  const checked = phoneChecksOn()
  if (checked && !b.checkId) throw updateApp()
  if (!checked && user.password) {
    if (!b.currentPassword) throw ApiError.badRequest('Current password is required')
    if (!verifyPassword(b.currentPassword, user.password)) throw ApiError.badRequest('Current password is incorrect')
  }
  await tx(async () => {
    if (checked) await useCheck({ checkId: b.checkId, checkToken: b.checkToken, phone: user.phone, purpose: 'CHANGE' })
    await update('users', user.id, { password: hashPassword(b.newPassword), updatedAt: Date.now() })
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', at(Date.now()), user.id)
  })
  ok(res, null, 'Password updated, please sign in again')
})

// ---------------------------------------------------------------- mobile number check by SMS

/** Whether sign-up and password changes need a number check. */
router.get('/auth/phone-check', (req, res) => ok(res, { required: phoneChecksOn() }))

const PhoneCheckStartBody = z.object({
  purpose: oneOf(['REGISTER', 'RESET', 'CHANGE']),
  phone: opt(phone),
})

// REGISTER and RESET name the number; CHANGE is for the signed-in account's own number.
router.post('/auth/phone-check/start', optionalUser, async (req, res) => {
  const b = body(req, PhoneCheckStartBody)
  if (!phoneChecksOn()) throw new ApiError(503, 'Mobile number checks are not switched on yet.', 'SMS_NOT_READY')
  let number = b.phone
  if (b.purpose === 'CHANGE') {
    if (!req.user) throw ApiError.unauthorized()
    if (!req.user.phone) throw needsNumber()
    number = req.user.phone
  } else if (!number) {
    throw ApiError.badRequest('Enter your 10-digit mobile number')
  } else if (b.purpose === 'REGISTER' && (await findByPhone(number))) {
    throw ApiError.conflict('An account with this mobile number already exists')
  } else if (b.purpose === 'RESET' && !(await findByPhone(number))) {
    throw ApiError.notFound('No account with this mobile number')
  }
  // Usually linked at start already; if that failed, try again in the background (the person still
  // has to send the SMS), so a gateway problem never slows this answer down.
  linkSmsPhone()
  ok(res, await startCheck(number, b.purpose), 'Send the SMS to verify your number')
})

const PhoneCheckStatusBody = z.object({ checkId: z.string().max(64), checkToken: z.string().max(100) })

/** The app asks every few seconds until the SMS has arrived. */
router.post('/auth/phone-check/status', async (req, res) => {
  const b = body(req, PhoneCheckStatusBody)
  ok(res, { status: await checkStatus(b.checkId, b.checkToken) })
})

// The SMS phone posts every SMS it receives here (event sms:received). The key in the address keeps
// others out. Always 200 for a known key, or the phone keeps sending it again.
router.post('/sms/incoming/:key', async (req, res) => {
  const key = Buffer.from(String(req.params.key))
  const expected = Buffer.from(config.sms.webhookKey)
  if (key.length !== expected.length || !crypto.timingSafeEqual(key, expected)) throw ApiError.notFound()
  const sms = req.body?.payload || {}
  const matched = req.body?.event === 'sms:received' ? await smsReceived(sms.sender ?? sms.phoneNumber, sms.message) : false
  ok(res, { matched }, 'Received')
})

// ---------------------------------------------------------------- Sign in with Google

/** The Google client ID the app signs in with; null hides the Google button. */
router.get('/auth/google', (req, res) => ok(res, { clientId: config.google.clientId || null }))

const GoogleBody = z.object({ idToken: z.string().min(20).max(4096) })

// A new Google account gets a GO-GO Ride account with no mobile number (added later in Settings).
// A Gmail address that is already on an account is not joined to it: that account's email was typed,
// never proved, so its owner signs in with the mobile number instead.
router.post('/auth/google', async (req, res) => {
  if (!googleOn()) throw new ApiError(503, 'Google sign-in is not switched on yet.', 'GOOGLE_NOT_READY')
  const b = body(req, GoogleBody)
  const google = await verifyGoogleToken(b.idToken)
  const login = await get("SELECT user_id FROM user_logins WHERE provider = 'GOOGLE' AND subject = ?", google.sub)
  let user = login ? await byId('users', login.userId) : null
  const isNewUser = !user
  if (!user) {
    if (await get('SELECT id FROM users WHERE email = ?', google.email)) {
      throw ApiError.conflict('This Gmail is already on a GO-GO Ride account. Sign in with that mobile number and password.')
    }
    const now = Date.now()
    user = await tx(async () => {
      const created = await insert('users', {
        id: newId(),
        name: google.name,
        phone: null,
        email: google.email,
        password: null,
        role: 'PASSENGER',
        pictureUrl: null,
        status: 'ACTIVE',
        phoneVerified: 0,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      })
      await insert('user_logins', { id: newId(), userId: created.id, provider: 'GOOGLE', subject: google.sub, email: google.email, createdAt: now })
      return created
    })
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  const session = await issueSession(user, clientContext(req))
  ok(res, { ...session, isNewUser }, isNewUser ? 'Welcome to GO-GO Ride' : 'Logged in successfully')
})

const AddPhoneBody = z.object({ phone, ...checkFields })

// After a Google sign-in: the person adds their mobile number, proved like a sign-up once checks are on.
router.post('/users/me/phone', requireUser, async (req, res) => {
  const b = body(req, AddPhoneBody)
  const user = req.user
  if (user.phone) throw ApiError.badRequest('Your account already has a mobile number')
  if (await findByPhone(b.phone)) throw ApiError.conflict('An account with this mobile number already exists')
  const checked = phoneChecksOn()
  if (checked && !b.checkId) throw updateApp()
  await tx(async () => {
    if (checked) await useCheck({ checkId: b.checkId, checkToken: b.checkToken, phone: b.phone, purpose: 'REGISTER' })
    await update('users', user.id, { phone: b.phone, phoneVerified: checked ? 1 : 0, updatedAt: Date.now() })
  })
  ok(res, userOut(await byId('users', user.id)), 'Mobile number added')
})

export default router
