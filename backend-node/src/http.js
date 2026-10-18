// Response envelope helpers: { success, message, data } (+ meta on lists).
import { ApiError } from './errors.js'

export function ok(res, data = null, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data })
}

export const created = (res, data, message = 'Created') => ok(res, data, message, 201)

/** The `meta` block carried by every list response. */
export function meta(total, page, extra = {}) {
  return {
    page: page.page,
    limit: page.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / page.limit)),
    ...extra,
  }
}

export function okPage(res, items, total, page, { message = 'Success', extraMeta = {} } = {}) {
  return res.status(200).json({ success: true, message, data: items, meta: meta(total, page, extraMeta) })
}

function intParam(query, name, fallback, { min, max }) {
  const raw = query[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n)) throw ApiError.badRequest('Validation failed', [{ field: name, message: 'Input should be a valid integer' }])
  if (min !== undefined && n < min)
    throw ApiError.badRequest('Validation failed', [{ field: name, message: `Input should be greater than or equal to ${min}` }])
  if (max !== undefined && n > max)
    throw ApiError.badRequest('Validation failed', [{ field: name, message: `Input should be less than or equal to ${max}` }])
  return n
}

/** Shared ?page=&limit=&search=&sort=&order= of every list endpoint. */
export function parsePage(query) {
  const page = intParam(query, 'page', 1, { min: 1 })
  const limit = intParam(query, 'limit', 20, { min: 1, max: 100 })
  const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : null
  const order = query.order === 'asc' ? 'asc' : 'desc'
  if (query.order && !['asc', 'desc'].includes(query.order)) {
    throw ApiError.badRequest('Validation failed', [{ field: 'order', message: "Input should be 'asc' or 'desc'" }])
  }
  return { page, limit, search, sort: query.sort || null, order, skip: (page - 1) * limit }
}

/** Read an optional integer query parameter with bounds. */
export const queryInt = (query, name, fallback, bounds = {}) => intParam(query, name, fallback, bounds)

/** Read an optional enum query parameter; 400 when the value is not allowed. */
export function queryEnum(query, name, allowed) {
  const v = query[name]
  if (v === undefined || v === '') return null
  if (!allowed.includes(v)) {
    throw ApiError.badRequest('Validation failed', [
      { field: name, message: `Input should be ${allowed.map((a) => `'${a}'`).join(', ')}` },
    ])
  }
  return v
}

/** Optional boolean query parameter ("true"/"false"/"1"/"0"). */
export function queryBool(query, name) {
  const v = query[name]
  if (v === undefined || v === '') return null
  if (['true', '1', 'yes'].includes(String(v).toLowerCase())) return true
  if (['false', '0', 'no'].includes(String(v).toLowerCase())) return false
  throw ApiError.badRequest('Validation failed', [{ field: name, message: 'Input should be a valid boolean' }])
}
