// Clock-time and calendar helpers (port of app/core/timeutils.py).
//
// Datetimes are epoch milliseconds (UTC). Date-only values ("2026-05-24") are
// stored as midnight UTC of that date, exactly like the other services.
//
// One deliberate improvement over the Python service: "now" and "today" use
// Asia/Kolkata time explicitly, so timetables, "Next: in N min" and alarms are
// right even when the hosting server runs on UTC.
import { config } from './config.js'

export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export const nowMs = () => Date.now()

/** "07:30" -> 450 */
export function toMinutes(hhmm) {
  const [h, m = '0'] = String(hhmm).split(':')
  return Number(h) * 60 + Number(m || 0)
}

/** 450 -> "07:30" (wraps around midnight) */
export function toHHMM(minutes) {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** "07:30" -> "07:30 AM" */
export function to12h(hhmm) {
  const [hs, ms = '0'] = String(hhmm).split(':')
  const h = Number(hs)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${String(hour12).padStart(2, '0')}:${String(Number(ms || 0)).padStart(2, '0')} ${suffix}`
}

/** Minutes between two clock times, crossing midnight if needed. */
export function durationMinutes(start, end) {
  const s = toMinutes(start)
  const e = toMinutes(end)
  return e >= s ? e - s : 1440 - s + e
}

/** 75 -> "1h 15m" */
export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/** Midnight UTC (ms) of a "YYYY-MM-DD" string, an ISO timestamp, a Date or ms. */
export function startOfDay(value) {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (m && value.length === 10) return Date.UTC(+m[1], +m[2] - 1, +m[3])
    const d = new Date(value.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const d = value instanceof Date ? value : new Date(value)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

const kolkataParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Current wall-clock time in Kolkata: { date: "YYYY-MM-DD", hour, minute, minutes } */
export function kolkataNow(at = new Date()) {
  const parts = Object.fromEntries(kolkataParts.formatToParts(at).map((p) => [p.type, p.value]))
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute, minutes: hour * 60 + minute }
}

/** Today's date (Kolkata) as midnight-UTC ms - the value date-only columns hold. */
export const todayMs = () => startOfDay(kolkataNow().date)

export const addDays = (ms, days) => ms + days * 86400000

/** Monday-first day code ("FRI") of a date-only ms value. */
export const dayCode = (ms) => DAY_ORDER[(new Date(ms).getUTCDay() + 6) % 7]

export const parseServiceDays = (csv) =>
  String(csv || '')
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter((d) => DAY_ORDER.includes(d))

export const runsOnDay = (csv, ms) => parseServiceDays(csv).includes(dayCode(ms))

/** Minutes from now (Kolkata) until that clock time today; null once it has passed. */
export function minutesUntil(hhmm) {
  const now = kolkataNow().minutes
  const target = toMinutes(hhmm)
  return target >= now ? target - now : null
}

/** ms -> "2026-05-24T07:30:00.000Z" (null-safe) */
export const isoZ = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString())

/** ms -> "2026-05-24" (UTC date part) */
export const dateOnly = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString().slice(0, 10))

/** Parse an ISO datetime string from a request body to ms. */
export function parseDateTime(value) {
  const s = String(value)
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
  return Number.isNaN(ms) ? null : ms
}
