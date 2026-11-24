// Registration, password and OTP sign-in, token rotation (port of app/api/auth.py).
import { Router } from 'express'
import { config } from '../config.js'
import { byId, get, insert, run, scalar, tx, update } from '../db.js'
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
import { body, email, ENUMS, name, oneOf, opt, password, phone, z } from '../validate.js'

const router = Router()

/** Issue an access + refresh token pair. `recordLogin` adds a login-history row (not on refresh). */
export function issueSession(user, ctx, { recordLogin = true } = {}) {
  const access = createAccessToken(user.id, user.role, user.phone)
  const { token: refresh, expiresAt } = createRefreshToken(user.id)
  const now = Date.now()
  tx(() => {
    insert('RefreshToken', { id: newId(), userId: user.id, tokenHash: hashToken(refresh), expiresAt, revokedAt: null, createdAt: now })
    update('User', user.id, { lastLoginAt: now, updatedAt: now })
    if (recordLogin) {
      insert('LoginActivity', { id: newId(), userId: user.id, device: ctx.device, ipAddress: ctx.ip, location: null, status: 'SUCCESS', createdAt: now })
    }
  })
  return { user: userOut(byId('User', user.id)), accessToken: access, refreshToken: refresh }
}

const findByPhone = (p) => get('SELECT * FROM "User" WHERE phone = ?', p)

// ---------------------------------------------------------------- register

const RegisterBody = z.object({
  name,
  phone,
  email: opt(email),
  password,
  role: oneOf(ENUMS.publicRole).default('PASSENGER'),
})

router.post('/auth/register', (req, res) => {
  const b = body(req, RegisterBody)
  if (findByPhone(b.phone)) throw ApiError.conflict('An account with this mobile number already exists')
  if (b.email && get('SELECT id FROM "User" WHERE email = ?', b.email)) throw ApiError.conflict('An account with this email already exists')
  const now = Date.now()
  const user = insert('User', {
    id: newId(),
    name: b.name,
    phone: b.phone,
    email: b.email || null,
    passwordHash: hashPassword(b.password),
    role: b.role,
    avatarUrl: null,
    status: 'ACTIVE',
    phoneVerified: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  })
  ok(res, issueSession(user, clientContext(req)), 'Account created successfully', 201)
})

// ---------------------------------------------------------------- password login

const LoginBody = z.object({
  phone,
  password: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1, 'Field required')),
})

router.post('/auth/login', (req, res) => {
  const b = body(req, LoginBody)
  const ctx = clientContext(req)
  const user = findByPhone(b.phone)
  if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid mobile number or password')
  if (!verifyPassword(b.password, user.passwordHash)) {
    insert('LoginActivity', { id: newId(), userId: user.id, device: ctx.device, ipAddress: ctx.ip, location: null, status: 'FAILED', createdAt: Date.now() })
    throw ApiError.unauthorized('Invalid mobile number or password')
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  ok(res, issueSession(user, ctx), 'Logged in successfully')
})

// ---------------------------------------------------------------- OTP

const OtpRequestBody = z.object({ phone, purpose: oneOf(ENUMS.otpPurpose).default('LOGIN') })

router.post('/auth/otp/request', (req, res) => {
  const b = body(req, OtpRequestBody)
  const recent = Number(scalar('SELECT COUNT(id) FROM "OtpCode" WHERE phone = ? AND "createdAt" >= ?', b.phone, Date.now() - 60000) || 0)
  if (recent >= 3) throw ApiError.tooMany('Please wait a minute before requesting another code')
  const code = generateOtp()
  const expiresAt = Date.now() + config.otpExpiryMinutes * 60000
  insert('OtpCode', { id: newId(), phone: b.phone, codeHash: hashCode(code), purpose: b.purpose, expiresAt, consumedAt: null, attempts: 0, createdAt: Date.now() })
  // TODO: send `code` by SMS here (MSG91 / Fast2SMS ...). Until then it is only logged.
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

router.post('/auth/otp/verify', (req, res) => {
  const b = body(req, OtpVerifyBody)
  const record = get(
    'SELECT * FROM "OtpCode" WHERE phone = ? AND purpose = ? AND "consumedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
    b.phone,
    b.purpose,
  )
  if (!record) throw ApiError.badRequest('Request a new verification code')
  if (record.expiresAt < Date.now()) throw ApiError.badRequest('This code has expired')
  if (record.attempts >= config.otpMaxAttempts) throw ApiError.tooMany('Too many incorrect attempts, request a new code')
  if (!verifyCode(b.code, record.codeHash)) {
    run('UPDATE "OtpCode" SET attempts = attempts + 1 WHERE id = ?', record.id)
    throw ApiError.badRequest('Incorrect verification code')
  }

  let isNewUser = false
  const user = tx(() => {
    const now = Date.now()
    run('UPDATE "OtpCode" SET "consumedAt" = ? WHERE id = ?', now, record.id)
    let u = findByPhone(b.phone)
    if (!u) {
      // The OTP doubles as sign-up: the phone is proven at this point.
      u = insert('User', {
        id: newId(),
        name: (b.name || '').trim() || `Rider ${b.phone.slice(-4)}`,
        phone: b.phone,
        email: null,
        passwordHash: null,
        role: b.role || 'PASSENGER',
        avatarUrl: null,
        status: 'ACTIVE',
        phoneVerified: 1,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      })
      isNewUser = true
    } else if (!u.phoneVerified) {
      update('User', u.id, { phoneVerified: 1, updatedAt: now })
    }
    return byId('User', u.id)
  })
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  const session = issueSession(user, clientContext(req))
  ok(res, { ...session, isNewUser }, isNewUser ? 'Welcome to GO-GO Ride' : 'Logged in successfully')
})

// ---------------------------------------------------------------- refresh / logout

const RefreshBody = z.object({ refreshToken: z.string().min(10, 'String should have at least 10 characters') })

router.post('/auth/refresh', (req, res) => {
  const b = body(req, RefreshBody)
  const payload = decodeRefreshToken(b.refreshToken)
  const stored = get('SELECT * FROM "RefreshToken" WHERE "tokenHash" = ?', hashToken(b.refreshToken))
  if (!stored || stored.revokedAt !== null || stored.expiresAt < Date.now()) {
    throw ApiError.unauthorized('Session expired, please sign in again')
  }
  const user = byId('User', payload.sub)
  if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('Account unavailable')
  run('UPDATE "RefreshToken" SET "revokedAt" = ? WHERE id = ?', Date.now(), stored.id)
  // A token refresh is not a new sign-in, so it is not added to the login history.
  const session = issueSession(user, clientContext(req), { recordLogin: false })
  ok(res, { accessToken: session.accessToken, refreshToken: session.refreshToken }, 'Session refreshed')
})

const LogoutBody = z.object({ refreshToken: opt(z.string()) })

router.post('/auth/logout', requireUser, (req, res) => {
  const b = body(req, LogoutBody)
  if (b.refreshToken) {
    run('UPDATE "RefreshToken" SET "revokedAt" = ? WHERE "revokedAt" IS NULL AND "tokenHash" = ?', Date.now(), hashToken(b.refreshToken))
  } else {
    run('UPDATE "RefreshToken" SET "revokedAt" = ? WHERE "revokedAt" IS NULL AND "userId" = ?', Date.now(), req.user.id)
  }
  ok(res, null, 'Logged out')
})

// ---------------------------------------------------------------- me / change password

router.get('/auth/me', requireUser, (req, res) => ok(res, userOut(req.user)))

const ChangePasswordBody = z.object({
  currentPassword: opt(z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string())),
  newPassword: password,
})

router.post('/auth/change-password', requireUser, (req, res) => {
  const b = body(req, ChangePasswordBody)
  const user = req.user
  if (user.passwordHash) {
    if (!b.currentPassword) throw ApiError.badRequest('Current password is required')
    if (!verifyPassword(b.currentPassword, user.passwordHash)) throw ApiError.badRequest('Current password is incorrect')
  }
  tx(() => {
    update('User', user.id, { passwordHash: hashPassword(b.newPassword), updatedAt: Date.now() })
    run('UPDATE "RefreshToken" SET "revokedAt" = ? WHERE "userId" = ? AND "revokedAt" IS NULL', Date.now(), user.id)
  })
  ok(res, null, 'Password updated, please sign in again')
})

export default router
