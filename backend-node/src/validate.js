// Request-body validation with zod, reporting errors in the API's shape:
// 400 { message: "Validation failed", code: "BAD_REQUEST", details: [{ field, message }] }
import { z } from 'zod'
import { ApiError } from './errors.js'

export { z }

/** Validate `data` against `schema`; returns the parsed value or throws 400. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {})
  if (result.success) return result.data
  const details = result.error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : 'body',
    message: issue.message,
  }))
  throw ApiError.badRequest('Validation failed', details)
}

/** Body helper for route handlers: body(req, schema). */
export const body = (req, schema) => parse(schema, req.body)

// ---------------------------------------------------------------- building blocks

const PHONE_RE = /^(\+91)?[6-9]\d{9}$/

/** Accepts +91 / spaces / dashes, yields 10 digits. */
export const phone = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') : v),
  z
    .string({ error: 'Enter a valid 10-digit mobile number' })
    .regex(PHONE_RE, 'Enter a valid 10-digit mobile number')
    .transform((v) => (v.startsWith('+91') ? v.slice(3) : v)),
)

/** Trimmed string. */
export const str = (min = 0, max = 10000) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(min, min === 1 ? 'Field required' : `String should have at least ${min} characters`).max(max, `String should have at most ${max} characters`))

export const name = str(2, 80)
// Python trims every body string (passwords included), so hashes saved by the old
// backend were made from trimmed passwords: trim here too.
export const password = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.string().min(6, 'String should have at least 6 characters').max(72, 'String should have at most 72 characters'),
)
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour), e.g. 07:30')
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
export const email = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
  z.string().email('Enter a valid email address').nullable(),
)

/** Optional + nullable shorthand. */
export const opt = (schema) => schema.nullish()

export const oneOf = (values) => z.enum(values, { error: `Input should be ${values.map((v) => `'${v}'`).join(', ')}` })

// ---------------------------------------------------------------- enums (same strings as the database)

export const ENUMS = {
  role: ['PASSENGER', 'BUS_OWNER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN'],
  publicRole: ['PASSENGER', 'BUS_OWNER', 'DRIVER'],
  userStatus: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
  busType: ['AC', 'NON_AC'],
  busCategory: ['NORMAL', 'SUPER_FAST', 'EXPRESS', 'DELUXE'],
  busStatus: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  docType: ['RC_BOOK', 'ROUTE_PERMIT', 'INSURANCE', 'OTHER'],
  day: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  recordStatus: ['ACTIVE', 'INACTIVE'],
  alarmStatus: ['ACTIVE', 'TRIGGERED', 'CANCELLED', 'EXPIRED'],
  favoriteType: ['BUS', 'ROUTE', 'STOP', 'LOCAL_CAR'],
  searchType: ['ROUTE', 'BUS_NUMBER', 'BUS_NAME'],
  vehicleType: ['CAR', 'AUTO', 'BIKE'],
  rideStatus: ['SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED'],
  bookingType: ['BUS', 'RIDE', 'LOCAL_CAR'],
  bookingStatus: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  paymentMode: ['CASH', 'UPI', 'CARD', 'WALLET'],
  paymentStatus: ['PENDING', 'PAID', 'REFUNDED', 'FAILED'],
  notificationType: ['SYSTEM', 'USER', 'PROMO', 'ALARM'],
  ticketCategory: ['GENERAL', 'BUS', 'BOOKING', 'PAYMENT', 'ACCOUNT'],
  ticketStatus: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  ticketPriority: ['LOW', 'NORMAL', 'HIGH'],
  otpPurpose: ['LOGIN', 'REGISTER', 'RESET'],
}
export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN']
export const REMIND_BEFORE_OPTIONS = [30, 15, 5, 0]
