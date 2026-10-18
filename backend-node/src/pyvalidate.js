// Pydantic/FastAPI-compatible request validation, used by routes/profile.js and
// routes/messaging.js.
//
// FastAPI reports EVERY invalid field at once, in declaration order, with
// Pydantic's wording ("Field required", "Input should be 'A', 'B' or 'C'",
// "Input should be a valid integer, unable to parse string as an integer" ...).
// The shared helpers in validate.js / http.js stop at the first bad query
// parameter and word some messages differently, so these local helpers keep the
// 400 responses byte-identical to the Python service.
import { z } from 'zod'
import { ApiError } from './errors.js'

export { z }

const REQUIRED = 'Field required'
const DICT = 'Input should be a valid dictionary or object to extract fields from'

const fail = (details) => {
  throw ApiError.badRequest('Validation failed', details)
}

/** "Input should be 'A', 'B' or 'C'" */
export function enumMessage(values) {
  const q = values.map((v) => `'${v}'`)
  return `Input should be ${q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0]}`
}

// ---------------------------------------------------------------- body building blocks

const chars = (n) => `${n} character${n === 1 ? '' : 's'}`
const strType = (iss) => (iss.input === undefined ? REQUIRED : 'Input should be a valid string')
const codePoints = (s) => [...s].length // Python len() counts code points

/** str with str_strip_whitespace and optional min/max length. */
export function pyStr({ min, max } = {}) {
  let s = z.string({ error: strType })
  if (min !== undefined) s = s.refine((v) => codePoints(v) >= min, `String should have at least ${chars(min)}`)
  if (max !== undefined) s = s.refine((v) => codePoints(v) <= max, `String should have at most ${chars(max)}`)
  return z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), s)
}

/** Enum / Literal field. */
export const pyEnum = (values) => z.enum(values, { error: (iss) => (iss.input === undefined ? REQUIRED : enumMessage(values)) })

/** `X | None = None` */
export const pyOpt = (schema) => schema.nullish()

const PHONE_RE = /^(\+91)?[6-9]\d{9}$/

/** PhoneMixin: accepts +91 / spaces / dashes, yields 10 digits. */
export const pyPhone = z.unknown().transform((v, ctx) => {
  if (v === undefined) {
    ctx.addIssue({ code: 'custom', message: REQUIRED })
    return z.NEVER
  }
  if (typeof v !== 'string') {
    ctx.addIssue({ code: 'custom', message: 'Input should be a valid string' })
    return z.NEVER
  }
  const cleaned = v.replace(/[\s-]/g, '')
  if (!PHONE_RE.test(cleaned)) {
    ctx.addIssue({ code: 'custom', message: 'Value error, Enter a valid 10-digit mobile number' })
    return z.NEVER
  }
  return cleaned.startsWith('+91') ? cleaned.slice(3) : cleaned
})

/**
 * Validate a required JSON body against a zod object schema.
 * Returns { data, set } where `set` lists the keys the client actually sent
 * (Pydantic's model_dump(exclude_unset=True)).
 */
export function pyBody(req, schema) {
  const hasBytes = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding'])
  const raw = req.body
  if (!hasBytes || raw === null) fail([{ field: 'body', message: REQUIRED }])
  if (raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) fail([{ field: 'body', message: DICT }])
  const result = schema.safeParse(raw)
  if (!result.success) {
    fail(
      result.error.issues.map((issue) => ({
        field: issue.path.length ? issue.path.join('.') : 'body',
        message: issue.message,
      })),
    )
  }
  const set = Object.keys(schema.shape).filter((k) => Object.hasOwn(raw, k))
  return { data: result.data, set }
}

// ---------------------------------------------------------------- query parameters

const INT_RE = /^[+-]?\d+(_\d+)*(\.0+)?$/
const TRUE = new Set(['1', 'on', 't', 'true', 'y', 'yes'])
const FALSE = new Set(['0', 'off', 'f', 'false', 'n', 'no'])

/** Collects every query-parameter error, then throws them together (FastAPI style). */
export class QueryReader {
  constructor(query) {
    this.query = query || {}
    this.errors = []
  }

  /** Repeated parameters: the last one wins, like Starlette. */
  raw(name) {
    const v = this.query[name]
    return Array.isArray(v) ? v[v.length - 1] : v
  }

  error(field, message) {
    this.errors.push({ field, message })
    return undefined
  }

  int(name, fallback, { min, max } = {}) {
    const v = this.raw(name)
    if (v === undefined) return fallback
    const s = String(v).trim()
    if (!INT_RE.test(s)) return this.error(name, 'Input should be a valid integer, unable to parse string as an integer')
    const n = Number(s.replace(/_/g, '').replace(/\.0+$/, ''))
    if (min !== undefined && n < min) return this.error(name, `Input should be greater than or equal to ${min}`)
    if (max !== undefined && n > max) return this.error(name, `Input should be less than or equal to ${max}`)
    return n
  }

  str(name) {
    const v = this.raw(name)
    return v === undefined ? null : String(v)
  }

  enum(name, values, fallback = null) {
    const v = this.raw(name)
    if (v === undefined) return fallback
    if (!values.includes(v)) return this.error(name, enumMessage(values))
    return v
  }

  bool(name, fallback = false) {
    const v = this.raw(name)
    if (v === undefined) return fallback
    const s = String(v).toLowerCase()
    if (TRUE.has(s)) return true
    if (FALSE.has(s)) return false
    return this.error(name, 'Input should be a valid boolean, unable to interpret input')
  }

  /** The shared ?page=&limit=&search=&sort=&order= block (app/core/responses.py pagination()). */
  page() {
    const page = this.int('page', 1, { min: 1 })
    const limit = this.int('limit', 20, { min: 1, max: 100 })
    const rawSearch = this.str('search')
    const sort = this.str('sort')
    const order = this.enum('order', ['asc', 'desc'], 'desc')
    const search = rawSearch ? rawSearch.trim() || null : null
    return { page, limit, search, sort, order, skip: (page - 1) * limit }
  }

  /** Throw the collected errors, if any. */
  done() {
    if (this.errors.length) fail(this.errors)
    return this
  }
}
