// Registration, password and OTP sign-in, token rotation (port of app/api/auth.py).
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
  requireUser,
  verifyCode,
  verifyPassword,
} from '../auth.js'
import { userOut } from '../serialize.js'
import { sendSms, smsReady } from '../services/sms.js'
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

// ---------------------------------------------------------------- register

const RegisterBody = z.object({
  name,
  phone,
  email: opt(email),
  password,
  role: oneOf(ENUMS.publicRole).default('PASSENGER'),
})

router.post('/auth/register', async (req, res) => {
  const b = body(req, RegisterBody)
  if (await findByPhone(b.phone)) throw ApiError.conflict('An account with this mobile number already exists')
  if (b.email && (await get('SELECT id FROM users WHERE email = ?', b.email))) throw ApiError.conflict('An account with this email already exists')
  const now = Date.now()
  const user = await insert('users', {
    id: newId(),
    name: b.name,
    phone: b.phone,
    email: b.email || null,
    password: hashPassword(b.password),
    role: b.role,
    pictureUrl: null,
    status: 'ACTIVE',
    phoneVerified: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
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
  // On the live server a code nobody receives is useless, so without the SMS phone the request is refused.
  if (config.isProd && !smsReady()) {
    throw new ApiError(503, 'SMS codes are not available yet. Please contact GO-GO Ride support to reset your password.', 'SMS_NOT_READY')
  }
  const code = generateOtp()
  const expiresAt = Date.now() + config.otpExpiryMinutes * 60000
  await insert('otp_codes', { id: newId(), phone: b.phone, codeHash: hashCode(code), purpose: b.purpose, expiresAt, consumedAt: null, attempts: 0, createdAt: Date.now() })
  if (smsReady()) await sendSms(b.phone, `${code} is your GO-GO Ride code. It expires in ${config.otpExpiryMinutes} minutes. Don't share it with anyone.`)
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
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: password,
})

// The code sent by SMS (purpose RESET) proves the phone. Every other sign-in of the account ends.
router.post('/auth/password/reset', async (req, res) => {
  const b = body(req, PasswordResetBody)
  const user = await findByPhone(b.phone)
  if (!user) throw ApiError.notFound('No account with this mobile number')
  const record = await checkCode(b.phone, 'RESET', b.code)
  const now = Date.now()
  await tx(async () => {
    await run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', at(now), record.id)
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
})

router.post('/auth/change-password', requireUser, async (req, res) => {
  const b = body(req, ChangePasswordBody)
  const user = req.user
  if (user.password) {
    if (!b.currentPassword) throw ApiError.badRequest('Current password is required')
    if (!verifyPassword(b.currentPassword, user.password)) throw ApiError.badRequest('Current password is incorrect')
  }
  await tx(async () => {
    await update('users', user.id, { password: hashPassword(b.newPassword), updatedAt: Date.now() })
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', at(Date.now()), user.id)
  })
  ok(res, null, 'Password updated, please sign in again')
})

export default router
