// Request validation that reports errors exactly like the Python service (pydantic v2 + FastAPI):
// 400 { message: "Validation failed", code: "BAD_REQUEST", details: [{ field, message }] }
//
// Used by the bus / route / stop endpoints. Unlike a first-error-wins validator it
// collects every problem, in declaration order, with pydantic's wording and field
// paths ("stopages.0.arrivalTime"), and applies pydantic's lax coercions
// ("5" -> 5 for numbers, true -> 1, strings trimmed).
import { ApiError } from '../errors.js'

// ---------------------------------------------------------------- specs

/** String (trimmed, like the Body models' str_strip_whitespace). */
export const str = ({ min, max, pattern, upper } = {}) => ({ kind: 'str', min, max, pattern, upper })
export const int = ({ ge, le, gt } = {}) => ({ kind: 'int', ge, le, gt })
export const float = ({ ge, le, gt } = {}) => ({ kind: 'float', ge, le, gt })
export const bool = () => ({ kind: 'bool' })
export const enumOf = (values) => ({ kind: 'enum', values })
export const list = (item, { min } = {}) => ({ kind: 'list', item, min })
/** fields: { name: spec | field(spec, opts) }; after(value) may return a "Value error" message. */
export const model = (fields, { after } = {}) => ({ kind: 'model', fields, after })

const NO_DEFAULT = Symbol('required')

/** Field options: optional (X | None = None) or a default value (X = default). */
export const optional = (spec) => ({ spec, nullable: true, default: null })
export const withDefault = (spec, value) => ({ spec, nullable: false, default: value })
const asField = (f) => (f && f.spec ? f : { spec: f, nullable: false, default: NO_DEFAULT })

// ---------------------------------------------------------------- messages

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function enumMessage(values) {
  const quoted = values.map((v) => `'${v}'`)
  if (quoted.length === 1) return `Input should be ${quoted[0]}`
  return `Input should be ${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`
}

const FLOAT_RE = /^[+-]?(\d+(_\d+)*(\.(\d+(_\d+)*)?)?|\.\d+(_\d+)*)([eE][+-]?\d+)?$/
const SPECIAL_FLOATS = { inf: Infinity, '+inf': Infinity, '-inf': -Infinity, infinity: Infinity, '+infinity': Infinity, '-infinity': -Infinity, nan: NaN, '+nan': NaN, '-nan': NaN }

function parseFloatText(text) {
  const s = text.trim()
  const special = SPECIAL_FLOATS[s.toLowerCase()]
  if (special !== undefined) return special
  if (!FLOAT_RE.test(s)) return undefined
  return Number(s.replace(/_/g, ''))
}

/** pydantic's numeric bounds, checked in its order (le, lt, ge, gt); NaN fails the first one. */
function bounds(spec, n) {
  if (spec.le !== undefined && !(n <= spec.le)) return `Input should be less than or equal to ${spec.le}`
  if (spec.ge !== undefined && !(n >= spec.ge)) return `Input should be greater than or equal to ${spec.ge}`
  if (spec.gt !== undefined && !(n > spec.gt)) return `Input should be greater than ${spec.gt}`
  return null
}

// ---------------------------------------------------------------- core

/**
 * Validate one value against a spec. Pushes { loc, message } onto errors and
 * returns the coerced value (undefined when invalid).
 */
function check(spec, v, loc, errors) {
  const fail = (message, at = loc) => {
    errors.push({ loc: at, message })
    return undefined
  }
  switch (spec.kind) {
    case 'str': {
      if (typeof v !== 'string') return fail('Input should be a valid string')
      const s = v.trim()
      if (spec.min !== undefined && [...s].length < spec.min) return fail(`String should have at least ${plural(spec.min, 'character')}`)
      if (spec.max !== undefined && [...s].length > spec.max) return fail(`String should have at most ${plural(spec.max, 'character')}`)
      if (spec.pattern && !spec.pattern.test(s)) return fail(`String should match pattern '${spec.pattern.source}'`)
      return spec.upper ? s.toUpperCase() : s
    }
    case 'int': {
      let n
      if (typeof v === 'boolean') n = v ? 1 : 0
      else if (typeof v === 'number') {
        if (!Number.isFinite(v)) return fail('Input should be a finite number')
        if (!Number.isInteger(v)) return fail('Input should be a valid integer, got a number with a fractional part')
        n = v
      } else if (typeof v === 'string') {
        const f = parseFloatText(v)
        if (f === undefined || !Number.isFinite(f) || !Number.isInteger(f) || /[eE]/.test(v))
          return fail('Input should be a valid integer, unable to parse string as an integer')
        n = f
      } else return fail('Input should be a valid integer')
      const b = bounds(spec, n)
      return b ? fail(b) : n
    }
    case 'float': {
      let n
      if (typeof v === 'boolean') n = v ? 1 : 0
      else if (typeof v === 'number') n = v
      else if (typeof v === 'string') {
        n = parseFloatText(v)
        if (n === undefined) return fail('Input should be a valid number, unable to parse string as a number')
      } else return fail('Input should be a valid number')
      const b = bounds(spec, n)
      return b ? fail(b) : n
    }
    case 'bool': {
      if (typeof v === 'boolean') return v
      if (typeof v === 'number' && (v === 0 || v === 1)) return v === 1
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase()
        if (['true', '1', 'yes', 'on', 't', 'y'].includes(s)) return true
        if (['false', '0', 'no', 'off', 'f', 'n'].includes(s)) return false
        return fail('Input should be a valid boolean, unable to interpret input')
      }
      return fail('Input should be a valid boolean')
    }
    case 'enum': {
      if (typeof v === 'string' && spec.values.includes(v)) return v
      return fail(enumMessage(spec.values))
    }
    case 'list': {
      if (!Array.isArray(v)) return fail('Input should be a valid list')
      const before = errors.length
      const out = v.map((item, i) => check(spec.item, item, [...loc, i], errors))
      if (errors.length > before) return undefined
      if (spec.min !== undefined && out.length < spec.min)
        return fail(`List should have at least ${plural(spec.min, 'item')} after validation, not ${out.length}`)
      return out
    }
    case 'model': {
      if (!v || typeof v !== 'object' || Array.isArray(v))
        return fail('Input should be a valid dictionary or object to extract fields from')
      const before = errors.length
      const out = {}
      const provided = []
      for (const [name, raw] of Object.entries(spec.fields)) {
        const f = asField(raw)
        const present = Object.prototype.hasOwnProperty.call(v, name) && v[name] !== undefined
        if (!present) {
          if (f.default === NO_DEFAULT) fail('Field required', [...loc, name])
          else out[name] = f.default
          continue
        }
        provided.push(name)
        if (v[name] === null && f.nullable) {
          out[name] = null
          continue
        }
        out[name] = check(f.spec, v[name], [...loc, name], errors)
      }
      if (errors.length > before) return undefined
      if (spec.after) {
        const problem = spec.after(out)
        if (problem) return fail(`Value error, ${problem}`)
      }
      Object.defineProperty(out, '$provided', { value: new Set(provided), enumerable: false })
      return out
    }
    default:
      throw new Error(`unknown spec kind ${spec.kind}`)
  }
}

const toDetails = (errors, root) =>
  errors.map((e) => ({ field: e.loc.length ? e.loc.join('.') : root, message: e.message }))

/** Throw the API's 400 envelope when there are collected errors. */
export function raise(details) {
  if (details.length) throw ApiError.badRequest('Validation failed', details)
}

/**
 * Validate a JSON request body against a model spec. Returns the coerced object;
 * `value.$provided` is the set of keys the client actually sent (exclude_unset).
 */
export function parseBody(req, spec) {
  const errors = []
  // express.json() turns an empty JSON request into {}; FastAPI reports the body as missing.
  const length = req.headers['content-length']
  const sentBytes = (length !== undefined && Number(length) > 0) || req.headers['transfer-encoding'] !== undefined
  const hasBody = sentBytes && req.body !== undefined && req.is('application/json')
  if (!hasBody || req.body === null) {
    raise([{ field: 'body', message: 'Field required' }])
  }
  const value = check(spec, req.body, [], errors)
  raise(toDetails(errors, 'body'))
  return value
}

/** Validate a single (form or query) value; pushes { field, message } to `details`. */
export function field(details, name, raw, spec, { required = false, fallback = null } = {}) {
  if (raw === undefined) {
    if (required) details.push({ field: name, message: 'Field required' })
    return fallback
  }
  const errors = []
  const value = check(spec, raw, [name], errors)
  details.push(...toDetails(errors, name))
  return errors.length ? fallback : value
}

/** Last value of a query parameter (repeated keys: the last one wins, like Starlette). */
export function qp(query, name) {
  const v = query[name]
  if (Array.isArray(v)) return v.length ? String(v[v.length - 1]) : undefined
  if (v === undefined) return undefined
  return typeof v === 'string' ? v : String(v)
}

/** Query value helper: q(details, req.query, 'limit', int({ ge: 1 }), { fallback: 20 }). Strings are not trimmed. */
export function q(details, query, name, spec, opts = {}) {
  const raw = qp(query, name)
  if (spec.kind === 'str') {
    if (raw === undefined) {
      if (opts.required) details.push({ field: name, message: 'Field required' })
      return opts.fallback ?? null
    }
    if (spec.pattern && !spec.pattern.test(raw)) {
      details.push({ field: name, message: `String should match pattern '${spec.pattern.source}'` })
      return opts.fallback ?? null
    }
    return raw
  }
  return field(details, name, raw, spec, opts)
}

/** The shared ?page&limit&search&sort&order dependency (PageDep), collecting errors into `details`. */
export function pageParams(details, query) {
  const page = q(details, query, 'page', int({ ge: 1 }), { fallback: 1 })
  const limit = q(details, query, 'limit', int({ ge: 1, le: 100 }), { fallback: 20 })
  const rawSearch = qp(query, 'search')
  const sort = qp(query, 'sort') ?? null
  const order = q(details, query, 'order', enumOf(['asc', 'desc']), { fallback: 'desc' })
  const search = rawSearch ? rawSearch.trim() || null : null
  return { page, limit, search, sort, order, skip: (page - 1) * limit }
}

// ---------------------------------------------------------------- Python number formatting

/** Python's round(x, 2): exact decimal rounding, ties to even. */
export function pyRound2(x) {
  if (!Number.isFinite(x)) return x
  const scaled = x * 100
  const floor = Math.floor(scaled)
  // An exact tie needs x to be an odd multiple of 1/8 (the only dyadic values ending in 5 at the 3rd decimal).
  if (scaled - floor === 0.5 && Number.isInteger(x * 8)) return (floor % 2 === 0 ? floor : floor + 1) / 100
  return Number(x.toFixed(2))
}

/** str(float) as Python prints it: 3 -> "3.0", 0.00001 -> "1e-05". */
export function pyFloat(x) {
  if (Number.isNaN(x)) return 'nan'
  if (x === Infinity) return 'inf'
  if (x === -Infinity) return '-inf'
  const abs = Math.abs(x)
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e16)) {
    const [mantissa, exp] = x.toExponential().split('e')
    const sign = exp.startsWith('-') ? '-' : '+'
    const digits = exp.replace(/^[+-]/, '').padStart(2, '0')
    return `${mantissa}e${sign}${digits}`
  }
  if (Number.isInteger(x)) return `${x}.0`
  return String(x)
}
