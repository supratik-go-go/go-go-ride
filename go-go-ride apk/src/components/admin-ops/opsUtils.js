// Pure helpers for the admin operations screens (routes, stops, rides, local
// cars, notifications, support, settings). Nothing here talks to the API
// except `fetchAll`, which only pages through a service's list call.

import { parseTimestamp } from '../../utils/format'

const pad = (n) => String(n).padStart(2, '0')

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" (local time) for <input type="datetime-local">. */
export function toLocalInput(value) {
  if (!value) return ''
  const d = parseTimestamp(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value (local time) -> ISO-8601 UTC string for the API. */
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '')

/** Form text -> number. '' / null -> null, junk -> NaN. */
export function toNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : NaN
}

/** Keep the fields of `next` whose value differs from `base` (JSON compare). */
export function changedFields(base, next) {
  const out = {}
  for (const [k, v] of Object.entries(next)) {
    if (JSON.stringify(v ?? null) !== JSON.stringify(base?.[k] ?? null)) out[k] = v
  }
  return out
}

/** Every page of a `service.list(params) -> { data, meta }` call (100 per page). */
export async function fetchAll(fetcher, params = {}, { limit = 100, maxPages = 10 } = {}) {
  const rows = []
  let page = 1
  let meta = null
  do {
    const res = await fetcher({ ...params, page, limit })
    rows.push(...(res.data || []))
    meta = res.meta
    page += 1
  } while (meta && page <= meta.totalPages && page <= maxPages)
  return { rows, total: meta?.total ?? rows.length, truncated: Boolean(meta && meta.totalPages > maxPages) }
}

/** "2 routes" / "1 route" */
export const plural = (n, one, many = `${one}s`) => `${n ?? 0} ${n === 1 ? one : many}`

/** Coordinate for display, 5 decimals (~1 m). */
export const fmtCoord = (v) => (v == null || v === '' ? '' : Number(v).toFixed(5))

/** Round a picked coordinate to 6 decimals before it goes in a form. */
export const roundCoord = (v) => Math.round(Number(v) * 1e6) / 1e6

/** tel: link for an Indian mobile number. */
export function telHref(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return undefined
  return d.length === 10 ? `tel:+91${d}` : `tel:${d.startsWith('91') && d.length === 12 ? `+${d}` : d}`
}

/** First `n` characters of a text, with an ellipsis. */
export function snippet(text, n = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** BUS_APPROVED -> "Bus approved" */
export function humanizeCode(code) {
  const s = String(code || '').replace(/_/g, ' ').toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/** Stable keys for editable rows (survive reorders). */
let seq = 0
export const rowKey = () => `r${Date.now().toString(36)}${(seq += 1)}`

/** A blank intermediate stop row for <RouteStopsEditor>. */
export const newRouteStopRow = (patch) => ({ key: rowKey(), stop: null, km: '', ...patch })

export const RECORD_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
