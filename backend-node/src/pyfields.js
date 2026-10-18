// Pydantic/FastAPI-style request validation for routes/alarms.js, routes/cars.js
// and routes/bookings.js.
//
// FastAPI reports every invalid field at once, in declaration order, with
// Pydantic's wording ("Field required", "Input should be 'A', 'B' or 'C'",
// "Value error, ..." for custom validators). The shared helpers in validate.js /
// http.js stop at the first bad query parameter and word some messages
// differently (queryEnum has no "or", queryBool/intParam lack Pydantic's
// suffixes, '' is treated as missing), so these local helpers keep the 400
// responses identical to the Python service.
import { ApiError } from './errors.js'

export const REQUIRED = 'Field required'
const DICT = 'Input should be a valid dictionary or object to extract fields from'
const STR = 'Input should be a valid string'
const INT = 'Input should be a valid integer'
const INT_PARSE = 'Input should be a valid integer, unable to parse string as an integer'
const INT_FRACTION = 'Input should be a valid integer, got a number with a fractional part'
const NUM = 'Input should be a valid number'
const NUM_PARSE = 'Input should be a valid number, unable to parse string as a number'
const BOOL = 'Input should be a valid boolean'
const BOOL_PARSE = 'Input should be a valid boolean, unable to interpret input'
const PHONE_RE = /^(\+91)?[6-9]\d{9}$/
const TRUE = new Set(['1', 'on', 't', 'true', 'y', 'yes'])
const FALSE = new Set(['0', 'off', 'f', 'false', 'n', 'no'])
const INT_STR = /^[+-]?\d+(\.0*)?$/
const FLOAT_STR = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const SPECIAL_FLOAT = /^([+-]?)(inf|infinity|nan)$/i

export const fail = (details) => {
  throw ApiError.badRequest('Validation failed', details)
}

/** "Input should be 'A', 'B' or 'C'" (Literal ints are not quoted). */
export function enumMessage(values) {
  const q = values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
  return `Input should be ${q.length > 1 ? `${q.slice(0, -1).join(', ')} or ${q[q.length - 1]}` : q[0]}`
}

const chars = (n) => `${n} character${n === 1 ? '' : 's'}`
const len = (s) => [...s].length // Python len() counts code points

// ---------------------------------------------------------------- field specs
// Each spec: { check(value) -> { value } | { error }, required, default, nullable }

const okv = (value) => ({ value })
const err = (error) => ({ error })

function bounded(n, { ge, le }) {
  // pydantic-core checks le before ge (so NaN reports the upper bound).
  if (le !== undefined && !(n <= le)) return err(`Input should be less than or equal to ${le}`)
  if (ge !== undefined && !(n >= ge)) return err(`Input should be greater than or equal to ${ge}`)
  return okv(n)
}

/** str (stripped, like Body's str_strip_whitespace) with optional length/pattern. */
export const str = ({ min, max, pattern, ...rest } = {}) => ({
  ...rest,
  check(v) {
    if (typeof v !== 'string') return err(STR)
    const s = v.trim()
    if (min !== undefined && len(s) < min) return err(`String should have at least ${chars(min)}`)
    if (max !== undefined && len(s) > max) return err(`String should have at most ${chars(max)}`)
    if (pattern && !pattern.test(s)) return err(`String should match pattern '${pattern.source}'`)
    return okv(s)
  },
})

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** PhoneMixin: accepts +91 / spaces / dashes, yields 10 digits. */
export const phone = (rest = {}) => ({
  ...rest,
  check(v) {
    if (typeof v !== 'string') return err(STR)
    const cleaned = v.replace(/[\s-]/g, '')
    if (!PHONE_RE.test(cleaned)) return err('Value error, Enter a valid 10-digit mobile number')
    return okv(cleaned.startsWith('+91') ? cleaned.slice(3) : cleaned)
  },
})

function toInt(v) {
  if (typeof v === 'boolean') return okv(v ? 1 : 0)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return err(INT)
    return Number.isInteger(v) ? okv(v) : err(INT_FRACTION)
  }
  if (typeof v === 'string') {
    const s = v.trim()
    return INT_STR.test(s) ? okv(Number(s.replace(/\.0*$/, ''))) : err(INT_PARSE)
  }
  return err(INT)
}

function toFloat(v) {
  if (typeof v === 'boolean') return okv(v ? 1 : 0)
  if (typeof v === 'number') return okv(v)
  if (typeof v === 'string') {
    const s = v.trim()
    if (FLOAT_STR.test(s)) return okv(Number(s))
    const m = SPECIAL_FLOAT.exec(s)
    if (m) return okv(m[2].toLowerCase() === 'nan' ? NaN : m[1] === '-' ? -Infinity : Infinity)
    return err(NUM_PARSE)
  }
  return err(NUM)
}

function toBool(v) {
  if (typeof v === 'boolean') return okv(v)
  if (typeof v === 'number') return v === 1 ? okv(true) : v === 0 ? okv(false) : err(BOOL_PARSE)
  if (typeof v === 'string') {
    const s = v.toLowerCase()
    if (TRUE.has(s)) return okv(true)
    if (FALSE.has(s)) return okv(false)
    return err(BOOL_PARSE)
  }
  return err(BOOL)
}

export const int = ({ ge, le, ...rest } = {}) => ({
  ...rest,
  check(v) {
    const r = toInt(v)
    return r.error ? r : bounded(r.value, { ge, le })
  },
})

export const float = ({ ge, le, ...rest } = {}) => ({
  ...rest,
  check(v) {
    const r = toFloat(v)
    return r.error ? r : bounded(r.value, { ge, le })
  },
})

export const bool = (rest = {}) => ({ ...rest, check: toBool })

/** StrEnum / Literal[...] - exact match only. */
export const oneOf = (values, rest = {}) => ({
  ...rest,
  check(v) {
    if (typeof v === 'boolean') return err(enumMessage(values))
    return values.includes(v) ? okv(v) : err(enumMessage(values))
  },
})

/** Marks a spec `X | None = default`. */
export const optional = (spec, dflt = null) => ({ ...spec, nullable: true, default: dflt })
/** Marks a spec required (no default). */
export const required = (spec) => ({ ...spec, required: true })

// ---------------------------------------------------------------- body

/**
 * Validate the JSON body against `shape` ({ field: spec } in declaration order).
 * Returns { data, set }: `data` has every field (defaults filled in), `set` is the
 * list of fields the client actually sent (Pydantic's exclude_unset).
 */
export function parseBody(req, shape) {
  const hasBytes = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding'])
  const raw = req.body
  if (!hasBytes || raw === null) fail([{ field: 'body', message: REQUIRED }])
  if (raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) fail([{ field: 'body', message: DICT }])

  const data = {}
  const set = []
  const errors = []
  for (const [key, spec] of Object.entries(shape)) {
    if (!Object.hasOwn(raw, key) || raw[key] === undefined) {
      if (spec.required) errors.push({ field: key, message: REQUIRED })
      else data[key] = spec.default ?? null
      continue
    }
    set.push(key)
    const v = raw[key]
    if (v === null && spec.nullable) {
      data[key] = null
      continue
    }
    const r = spec.check(v)
    if (r.error) errors.push({ field: key, message: r.error })
    else data[key] = r.value
  }
  if (errors.length) fail(errors)
  return { data, set }
}

// ---------------------------------------------------------------- query string

/** Collects every query-parameter error, then throws them together (FastAPI style). */
export class Query {
  constructor(query) {
    this.query = query || {}
    this.errors = []
  }

  /** Repeated parameters: the last one wins, like Starlette. */
  raw(name) {
    const v = this.query[name]
    return Array.isArray(v) ? v[v.length - 1] : v
  }

  #take(name, convert, fallback, bounds) {
    const v = this.raw(name)
    if (v === undefined) return fallback
    let r = convert(String(v))
    if (!r.error && bounds) r = bounded(r.value, bounds)
    if (r.error) {
      this.errors.push({ field: name, message: r.error })
      return fallback
    }
    return r.value
  }

  int(name, fallback = null, bounds) {
    return this.#take(name, toInt, fallback, bounds)
  }

  float(name, fallback = null, bounds) {
    return this.#take(name, toFloat, fallback, bounds)
  }

  bool(name, fallback = null) {
    return this.#take(name, toBool, fallback)
  }

  oneOf(name, values, fallback = null) {
    return this.#take(name, (s) => (values.includes(s) ? okv(s) : err(enumMessage(values))), fallback)
  }

  str(name) {
    const v = this.raw(name)
    return v === undefined ? null : String(v)
  }

  /** The shared ?page=&limit=&search=&sort=&order= block (app/core/responses.py pagination()). */
  page() {
    const page = this.int('page', 1, { ge: 1 })
    const limit = this.int('limit', 20, { ge: 1, le: 100 })
    const rawSearch = this.str('search')
    const sort = this.str('sort')
    const order = this.oneOf('order', ['asc', 'desc'], 'desc')
    const search = rawSearch ? rawSearch.trim() || null : null
    return { page, limit, search, sort, order, skip: (page - 1) * limit }
  }

  /** Throw the collected errors, if any. */
  done() {
    if (this.errors.length) fail(this.errors)
    return this
  }
}

// ---------------------------------------------------------------- dates

/**
 * Python's datetime.fromisoformat() for the forms clients send:
 * "YYYY-MM-DD", "YYYY-MM-DD[T ]HH:MM[:SS[.fff]]" with optional "Z" / "+05:30".
 * Returns { wall, offsetMs } (wall = the written clock time read as UTC ms) or null.
 */
export function parseIsoParts(value) {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d{1,6}))?)?)?(Z|[+-]\d{2}:?\d{2}(?::?\d{2})?)?)?$/.exec(
      String(value).trim(),
    )
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', tz] = m
  const parts = [+y, +mo, +d, +h, +mi, +s]
  if (parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null
  const wall = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], Math.floor(Number(`0.${frac || 0}`) * 1000))
  const check = new Date(wall)
  if (check.getUTCDate() !== parts[2] || check.getUTCMonth() !== parts[1] - 1) return null // e.g. 2026-02-30
  let offsetMs = 0
  if (tz && tz !== 'Z') {
    const t = /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/.exec(tz)
    offsetMs = (t[1] === '-' ? -1 : 1) * ((+t[2] * 60 + +t[3]) * 60000 + Number(t[4] || 0) * 1000)
  }
  return { wall, offsetMs, hasTz: Boolean(tz) }
}

/** app.core.timeutils.start_of_day(str): midnight UTC of the (UTC-converted) date, or null when unparseable. */
export function startOfDayStrict(value) {
  const p = parseIsoParts(value)
  if (!p) return null
  const utc = p.wall - p.offsetMs
  const d = new Date(utc)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// ---------------------------------------------------------------- updates

/**
 * SQLAlchemy only issues an UPDATE (and bumps the onupdate "updatedAt") when a
 * value really changed. Writes the changed columns of `patch` (booleans as 0/1);
 * returns true when something was written.
 */
export function saveChanges(update, table, row, patch, { touch = true } = {}) {
  const changed = {}
  for (const [key, value] of Object.entries(patch)) {
    const v = value === true ? 1 : value === false ? 0 : value
    if (v !== row[key]) changed[key] = v
  }
  if (!Object.keys(changed).length) return false
  if (touch) changed.updatedAt = Date.now()
  update(table, row.id, changed)
  return true
}

/** Python's round(x, 2) (round-half-even on the exact binary value). */
export function pyRound2(x) {
  const exact = Math.abs(x).toFixed(20)
  const [whole, frac] = exact.split('.')
  if (/^\d{2}5$/.test(frac.slice(0, 3)) && /^0*$/.test(frac.slice(3))) {
    // exact tie: round to the even hundredth
    const hundredths = Number(whole) * 100 + Number(frac.slice(0, 2))
    const even = hundredths % 2 === 0 ? hundredths : hundredths + 1
    return Math.sign(x) * (even / 100)
  }
  return Number(x.toFixed(2))
}
