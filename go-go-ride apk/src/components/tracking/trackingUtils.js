// Helpers shared by the tracking screens (passenger live tracking + admin fleet map).
// Positions come from trackingService.estimate(), which interpolates along the
// published timetable - there is no GPS feed, so everything here is "estimated".

import { splitDays, toISODate, formatDateLong, parseISODate } from '../../utils/format'

export const TRACKING_REFRESH_MS = Number(import.meta.env.VITE_TRACKING_REFRESH_MS) || 5000

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Day code ("MON") for a local date. */
export const dayCode = (date = new Date()) => DAY_CODES[date.getDay()]

/** Does the bus's weekly schedule include this date? (ignores declared exceptions) */
export const runsOnDay = (bus, date = new Date()) => splitDays(bus?.serviceDays).includes(dayCode(date))

/**
 * Next date (from tomorrow, up to 3 weeks out) the bus is scheduled to run,
 * skipping declared non-operating dates. Returns a "Monday, 19 October 2026" label or null.
 */
export function nextRunLabel(bus, from = new Date()) {
  const blocked = new Set((bus?.exceptions || []).map((e) => String(e.date).slice(0, 10)))
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let i = 1; i <= 21; i += 1) {
    d.setDate(d.getDate() + 1)
    const iso = toISODate(d)
    if (runsOnDay(bus, d) && !blocked.has(iso)) {
      return i === 1 ? 'Tomorrow' : formatDateLong(iso)
    }
  }
  return null
}

/** Display metadata per estimate status. `tone` is a map.css bus-marker tone. */
export const STATUS_META = {
  MOVING: { label: 'On the way', tone: 'primary', chip: 'success' },
  AT_STOP: { label: 'At a stop', tone: 'success', chip: 'warning' },
  NOT_STARTED: { label: 'Not started', tone: 'muted', chip: 'info' },
  COMPLETED: { label: 'Completed', tone: 'muted', chip: 'neutral' },
  NOT_RUNNING: { label: 'Not running', tone: 'muted', chip: 'danger' },
  NO_DATA: { label: 'No timetable', tone: 'muted', chip: 'neutral' },
}

export const STATUS_ORDER = ['MOVING', 'AT_STOP', 'NOT_STARTED', 'COMPLETED', 'NOT_RUNNING', 'NO_DATA']

/** Split the route into the travelled part (muted) and the part still ahead (navy). */
export function splitRoute(est) {
  if (!est) return { travelled: [], upcoming: [] }
  const pts = est.stops.map((s) => s.point)
  switch (est.status) {
    case 'COMPLETED':
      return { travelled: pts, upcoming: [] }
    case 'MOVING':
      return {
        travelled: [...pts.slice(0, est.currentIndex + 1), est.point],
        upcoming: [est.point, ...pts.slice(est.nextIndex)],
      }
    case 'AT_STOP':
      return { travelled: pts.slice(0, est.currentIndex + 1), upcoming: pts.slice(est.currentIndex) }
    default:
      return { travelled: [], upcoming: pts }
  }
}

/** 'passed' | 'current' | 'next' | 'upcoming' for the stop at index i. */
export function stopState(est, i) {
  if (!est) return 'upcoming'
  switch (est.status) {
    case 'COMPLETED':
      return 'passed'
    case 'MOVING':
      if (i <= est.currentIndex) return 'passed'
      return i === est.nextIndex ? 'next' : 'upcoming'
    case 'AT_STOP':
      if (i < est.currentIndex) return 'passed'
      if (i === est.currentIndex) return 'current'
      return i === est.nextIndex ? 'next' : 'upcoming'
    case 'NOT_STARTED':
      return i === 0 ? 'next' : 'upcoming'
    default:
      return 'upcoming'
  }
}

/** Marker kind for map.css: board / alight / end / passed / start / stop. */
export function stopKind(est, i, { fromId, toId } = {}) {
  const s = est.stops[i]
  if (fromId && s.id === fromId) return 'board'
  if (toId && s.id === toId) return 'alight'
  const last = est.stops.length - 1
  if (i === last) return 'end'
  if (stopState(est, i) === 'passed') return 'passed'
  if (i === 0) return 'start'
  return 'stop'
}

/** Find a stop in the estimate by id, falling back to a case-insensitive name match. */
export function findStop(est, idOrName) {
  if (!est || !idOrName) return null
  const needle = String(idOrName).trim().toLowerCase()
  const index = est.stops.findIndex((s) => s.id === idOrName)
  const i = index >= 0 ? index : est.stops.findIndex((s) => s.name.toLowerCase() === needle)
  return i >= 0 ? { ...est.stops[i], index: i } : null
}

/** "S12 · Howrah Station → Esplanade" style route text. */
export function routeText(bus) {
  if (bus?.route?.name) return bus.route.name
  const list = bus?.timetable?.length ? bus.timetable : bus?.stopages || []
  if (list.length < 2) return bus?.busName || 'Route not set'
  const first = list[0]?.stop?.name
  const last = list[list.length - 1]?.stop?.name
  return first && last ? `${first} → ${last}` : bus?.busName || 'Route not set'
}

/** Google Maps directions to a point (the user's own location is used as the origin by Maps). */
export function directionsUrl(point) {
  if (!point) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`
}

/** "in 5 min" / "in 1h 20m" / "now" */
export function inMinutes(mins) {
  if (mins == null) return ''
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `in ${h}h${m ? ` ${m}m` : ''}`
}

/** Seconds since a Date, as "just now" / "12 s ago" / "3 min ago". */
export function secondsAgo(at, now = new Date()) {
  if (!at) return ''
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 3) return 'just now'
  if (s < 60) return `${s} s ago`
  return `${Math.floor(s / 60)} min ago`
}

export const isSameLocalDay = (iso, d = new Date()) => !iso || toISODate(parseISODate(iso)) === toISODate(d)
