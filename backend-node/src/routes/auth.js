// Registration, password and OTP sign-in, token rotation (port of app/api/auth.py), the free
// mobile number check by SMS (services/phoneCheck.js) for sign-up and password changes, Sign in
// with Google (services/google.js), and forgot-password codes by email (services/mail.js).
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
import { mailReady, sendMail } from '../services/mail.js'
import { checkStatus, smsReceived, startCheck, useCheck } from '../services/phoneCheck.js'
import { linkSmsPhone, phoneChecksOn } from '../services/sms.js'
import { body, ENUMS, name, oneOf, opt, password, phone, z } from '../validate.js'

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

// Email is required since v1.13: Forgot password sends its code there (owner's choice, no SMS).
const requiredEmail = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.string({ error: 'Enter your email address' }).min(1, 'Enter your email address').email('Enter a valid email address'),
)

const RegisterBody = z.object({
  name,
  phone,
  email: requiredEmail,
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

// Per account as well as per internet address (app.js): someone using many addresses still gets
// only this many guesses at one account's password.
const WRONG_PASSWORDS = 10
const WRONG_PASSWORD_MINUTES = 15

router.post('/auth/login', async (req, res) => {
  const b = body(req, LoginBody)
  const ctx = clientContext(req)
  const user = await findByPhone(b.phone)
  if (!user || !user.password) throw ApiError.unauthorized('Invalid mobile number or password')
  const since = at(Date.now() - WRONG_PASSWORD_MINUTES * 60000)
  const wrong = Number((await scalar("SELECT COUNT(id) FROM login_history WHERE user_id = ? AND status = 'FAILED' AND created_at >= ?", user.id, since)) || 0)
  if (wrong >= WRONG_PASSWORDS) throw ApiError.tooMany(`Too many wrong passwords. Wait ${WRONG_PASSWORD_MINUTES} minutes and try again.`)
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

// ---------------------------------------------------------------- forgot password by email

// Free: a 6-digit code goes to the email on the account (owner's choice 2026-11-28: no SMS, no phone).
const RESET_MINUTES = 10
const ResetLoginBody = z.object({ login: z.string().trim().min(3, 'Enter your mobile number or email').max(190) })

/** The account for what was typed on Forgot password: a mobile number or an email address. */
function findByLogin(login) {
  const digits = login.replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, '')
  if (/^[6-9]\d{9}$/.test(digits)) return findByPhone(digits)
  return get('SELECT * FROM users WHERE email = ?', login)
}

const maskEmail = (email) => {
  const [name, domain] = String(email).split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

// A typed email is only trusted once its code came back (/users/me/email/confirm): otherwise a
// stranger's address typed by mistake, or one put in by someone holding the phone, could reset it.
const notConfirmed = () =>
  new ApiError(400, "This account's email isn't confirmed, so we can't send a code there. Contact GO-GO Ride support to reset your password.", 'EMAIL_NOT_CONFIRMED')

/** Codes by email: a few a minute and a cap per hour and per day, so nobody can flood a mailbox or use up its daily sending limit. */
async function assertCodeQuota(table, userId) {
  const count = async (ms) => Number((await scalar(`SELECT COUNT(id) FROM ${table} WHERE user_id = ? AND created_at >= ?`, userId, at(Date.now() - ms))) || 0)
  if ((await count(60000)) >= 3) throw ApiError.tooMany('Please wait a minute before asking for another code')
  if ((await count(3600000)) >= 5) throw ApiError.tooMany('You asked for many codes. Try again in an hour.')
  if ((await count(86400000)) >= 10) throw ApiError.tooMany('You asked for many codes today. Try again tomorrow.')
}

/** The guess is counted in the same step that checks the limit, so guesses sent all at once can't slip past it. */
async function guessCode(table, record, code) {
  const { changes } = await run(`UPDATE ${table} SET attempts = attempts + 1 WHERE id = ? AND attempts < ?`, record.id, config.otpMaxAttempts)
  if (!changes) throw ApiError.tooMany('Too many wrong codes. Ask for a new one.')
  if (!verifyCode(code, record.codeHash)) throw ApiError.badRequest('Wrong code. Check the email and try again.')
}

/** Inside the caller's transaction: a code works once, even when two requests bring it at the same time. */
async function spendCode(table, record) {
  const { changes } = await run(`UPDATE ${table} SET used_at = ? WHERE id = ? AND used_at IS NULL`, at(Date.now()), record.id)
  if (!changes) throw ApiError.badRequest('Ask for a new code')
}

router.post('/auth/password/email-code', async (req, res) => {
  const b = body(req, ResetLoginBody)
  const user = await findByLogin(b.login)
  if (!user || user.status === 'INACTIVE') throw ApiError.notFound('No account with this mobile number or email')
  // A Google account has no password to reset until it has a number (sign-in is number + password).
  if (!user.phone) throw new ApiError(400, 'This account signs in with Google. Tap Continue with Google instead.', 'GOOGLE_ACCOUNT')
  if (!user.email) throw new ApiError(400, 'This account has no email address. Contact GO-GO Ride support to reset your password.', 'NO_EMAIL')
  if (!user.emailConfirmedAt) throw notConfirmed()
  if (config.isProd && !mailReady()) throw new ApiError(503, "Reset by email isn't switched on yet. Contact GO-GO Ride support.", 'MAIL_NOT_READY')
  await assertCodeQuota('reset_codes', user.id)
  const code = generateOtp()
  const now = Date.now()
  await insert('reset_codes', { id: newId(), userId: user.id, codeHash: hashCode(code), attempts: 0, expiresAt: now + RESET_MINUTES * 60000, usedAt: null, createdAt: now })
  if (mailReady()) {
    await sendMail({
      to: user.email,
      subject: `${code} is your GO-GO Ride code`,
      text: `Hello ${user.name},\n\nYour code to reset your GO-GO Ride password is ${code}. It expires in ${RESET_MINUTES} minutes.\n\nIf you didn't ask for this, ignore this email: your password stays the same.\n\nGO-GO Ride`,
    })
  }
  const data = { sentTo: maskEmail(user.email), expiresInSeconds: RESET_MINUTES * 60 }
  if (config.echoOtp) data.devCode = code
  ok(res, data, 'Code sent')
})

const EmailResetBody = z.object({
  login: z.string().trim().min(3, 'Enter your mobile number or email').max(190),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: password,
})

// The latest code for the account proves the person; every other sign-in of the account ends.
router.post('/auth/password/reset-by-email', async (req, res) => {
  const b = body(req, EmailResetBody)
  const user = await findByLogin(b.login)
  if (!user || user.status === 'INACTIVE') throw ApiError.notFound('No account with this mobile number or email')
  if (!user.emailConfirmedAt) throw notConfirmed()
  const record = await get('SELECT * FROM reset_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1', user.id)
  if (!record) throw ApiError.badRequest('Ask for a new code')
  if (record.expiresAt < Date.now()) throw ApiError.badRequest('This code has expired. Ask for a new one.')
  await guessCode('reset_codes', record, b.code)
  const now = Date.now()
  await tx(async () => {
    await spendCode('reset_codes', record)
    await update('users', user.id, { password: hashPassword(b.newPassword), updatedAt: now })
    await run('UPDATE sign_in_sessions SET revoked_at = ? WHERE revoked_at IS NULL AND user_id = ?', at(now), user.id)
  })
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  ok(res, await issueSession(await byId('users', user.id), clientContext(req)), 'Password changed. You are signed in.')
})

// ---------------------------------------------------------------- confirming the email

const EmailCodeBody = z.object({
  email: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ error: 'Enter your email address' }).email('Enter a valid email address').max(190)),
  password: opt(z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string())),
})

/** Another account with this email, if any (with whether it confirmed it). */
const emailHolder = (address, userId) => get('SELECT id, email_confirmed_at FROM users WHERE email = ? AND id != ?', address, userId)

// The password is asked for, or someone holding an unlocked phone could confirm their own email and
// reset the password later. The email may be a new one: it replaces the old one once confirmed.
router.post('/users/me/email/code', requireUser, async (req, res) => {
  const b = body(req, EmailCodeBody)
  const user = req.user
  if (user.password) {
    if (!b.password) throw ApiError.badRequest('Validation failed', [{ field: 'password', message: 'Enter your password' }])
    if (!verifyPassword(b.password, user.password)) throw ApiError.badRequest('Validation failed', [{ field: 'password', message: 'Password is incorrect' }])
  }
  if ((await emailHolder(b.email, user.id))?.emailConfirmedAt) throw ApiError.conflict('An account with this email already exists')
  if (config.isProd && !mailReady()) throw new ApiError(503, "Email confirmation isn't switched on yet. Please try again later.", 'MAIL_NOT_READY')
  await assertCodeQuota('email_codes', user.id)
  const code = generateOtp()
  const now = Date.now()
  await insert('email_codes', { id: newId(), userId: user.id, email: b.email, codeHash: hashCode(code), attempts: 0, expiresAt: now + RESET_MINUTES * 60000, usedAt: null, createdAt: now })
  if (mailReady()) {
    await sendMail({
      to: b.email,
      subject: `${code} is your GO-GO Ride code`,
      text: `Hello ${user.name},\n\nYour code to confirm this email for GO-GO Ride is ${code}. It expires in ${RESET_MINUTES} minutes.\n\nOnce it is confirmed, Forgot password can send you a code here.\n\nIf you didn't ask for this, ignore this email.\n\nGO-GO Ride`,
    })
  }
  const data = { sentTo: b.email, expiresInSeconds: RESET_MINUTES * 60 }
  if (config.echoOtp) data.devCode = code
  ok(res, data, 'Code sent')
})

const EmailConfirmBody = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') })

// Another account that only had this email typed in gives it up: its owner never proved it theirs.
router.post('/users/me/email/confirm', requireUser, async (req, res) => {
  const b = body(req, EmailConfirmBody)
  const user = req.user
  const record = await get('SELECT * FROM email_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1', user.id)
  if (!record) throw ApiError.badRequest('Ask for a new code')
  if (record.expiresAt < Date.now()) throw ApiError.badRequest('This code has expired. Ask for a new one.')
  await guessCode('email_codes', record, b.code)
  await tx(async () => {
    await spendCode('email_codes', record)
    const other = await emailHolder(record.email, user.id)
    if (other?.emailConfirmedAt) throw ApiError.conflict('An account with this email already exists')
    const now = Date.now()
    if (other) await update('users', other.id, { email: null, updatedAt: now })
    await update('users', user.id, { email: record.email, emailConfirmedAt: now, updatedAt: now })
    // Reset codes sent to an earlier email stop working.
    await run('DELETE FROM reset_codes WHERE user_id = ?', user.id)
  })
  ok(res, userOut(await byId('users', user.id)), 'Email confirmed')
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
        // Google has confirmed the Gmail.
        emailConfirmedAt: now,
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
