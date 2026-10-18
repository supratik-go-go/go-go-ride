// Passwords, JWTs and the auth middleware (port of app/core/security.py + deps.py).
//
// bcrypt and HS256 match the other services, so existing password hashes keep
// working and tokens are interchangeable when the secrets are the same.
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { byId } from './db.js'
import { ApiError } from './errors.js'
import { ADMIN_ROLES } from './validate.js'

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10)
export function verifyPassword(plain, hashed) {
  if (!hashed) return false
  try {
    return bcrypt.compareSync(plain, hashed)
  } catch {
    return false
  }
}
export const hashCode = (code) => bcrypt.hashSync(code, 8)
export const verifyCode = (code, hashed) => {
  try {
    return bcrypt.compareSync(code, hashed)
  } catch {
    return false
  }
}

export function createAccessToken(userId, role, phone) {
  return jwt.sign({ sub: userId, role, phone }, config.jwtAccessSecret, {
    algorithm: 'HS256',
    expiresIn: config.accessTokenMinutes * 60,
  })
}

/** -> { token, expiresAt (ms) }. A random jti keeps two tokens issued in the same second distinct. */
export function createRefreshToken(userId) {
  const expiresAt = Date.now() + config.refreshTokenDays * 86400000
  const token = jwt.sign({ sub: userId, jti: crypto.randomBytes(8).toString('hex') }, config.jwtRefreshSecret, {
    algorithm: 'HS256',
    expiresIn: config.refreshTokenDays * 86400,
  })
  return { token, expiresAt }
}

export function decodeAccessToken(token) {
  try {
    return jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] })
  } catch {
    throw ApiError.unauthorized('Invalid or expired token')
  }
}

export function decodeRefreshToken(token) {
  try {
    return jwt.verify(token, config.jwtRefreshSecret, { algorithms: ['HS256'] })
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token')
  }
}

/** Refresh tokens are stored hashed so a database leak cannot replay them. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// ---------------------------------------------------------------- middleware

function bearer(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

function loadUser(token) {
  const payload = decodeAccessToken(token)
  const user = byId('User', payload.sub)
  if (!user) throw ApiError.unauthorized('Account no longer exists')
  if (user.status !== 'ACTIVE') throw ApiError.forbidden(`Account is ${String(user.status).toLowerCase()}`)
  return user
}

/** Requires a valid token; sets req.user (raw User row). */
export function requireUser(req, res, next) {
  const token = bearer(req)
  if (!token) return next(ApiError.unauthorized())
  try {
    req.user = loadUser(token)
    next()
  } catch (err) {
    next(err)
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export function optionalUser(req, res, next) {
  const token = bearer(req)
  req.user = null
  if (token) {
    try {
      req.user = loadUser(token)
    } catch {
      req.user = null
    }
  }
  next()
}

export const isAdmin = (user) => Boolean(user && ADMIN_ROLES.includes(user.role))

/** requireRoles('ADMIN','SUPER_ADMIN') - includes requireUser. */
export function requireRoles(...roles) {
  return [
    requireUser,
    (req, res, next) => (roles.includes(req.user.role) ? next() : next(ApiError.forbidden())),
  ]
}

export const requireAdmin = requireRoles('ADMIN', 'SUPER_ADMIN')
export const requireSuperAdmin = requireRoles('SUPER_ADMIN')
export const requireOwner = requireRoles('BUS_OWNER', 'ADMIN', 'SUPER_ADMIN')

/** Device and IP recorded on the login activity trail. */
export const clientContext = (req) => ({
  device: req.headers['user-agent'] || null,
  // IPv4 clients arrive as "::ffff:1.2.3.4" on a dual-stack socket; store the plain address.
  ip: req.ip ? req.ip.replace(/^::ffff:/, '') : null,
})
