// Small helpers shared by the admin pages and the components in this folder.
// Pure functions only - nothing here talks to the API.

import { Bell, Bus, CheckCircle2, Clock, Hourglass, Route, Settings, Trash2, UserPlus, UserRound, XCircle } from 'lucide-react'
import { addDays, formatDate, parseISODate, todayISO } from '../../utils/format'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-05-18" -> "18 May" (chart axes). */
export function shortDate(iso) {
  if (!iso) return ''
  const d = parseISODate(iso)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

/** "24 May 2026 - 31 May 2026" (or "24 May - 31 May 2026" inside one year). */
export function formatRange(from, to) {
  if (!from || !to) return ''
  if (from === to) return formatDate(from)
  const a = parseISODate(from)
  const b = parseISODate(to)
  return a.getFullYear() === b.getFullYear() ? `${shortDate(from)} - ${formatDate(to)}` : `${formatDate(from)} - ${formatDate(to)}`
}

/** First word of a name, for greetings. */
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Admin'

/**
 * Human route text for a bus: the linked route's name, else first -> last
 * stopage (owner-submitted buses have no route until an admin links one).
 */
export function routeLabel(bus) {
  if (bus?.route?.name) return bus.route.name
  const stops = bus?.timetable?.length ? bus.timetable : bus?.stopages
  if (stops?.length >= 2) return `${stops[0].stop?.name} → ${stops[stops.length - 1].stop?.name}`
  if (stops?.length === 1) return stops[0].stop?.name
  return 'No route yet'
}

/** % change, same rule as the backend: previous 0 -> 0 (no change) or 100. */
export function computeTrend(current, previous) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (p === 0) return c === 0 ? 0 : 100
  return Math.round(((c - p) / p) * 1000) / 10
}

// ---------------------------------------------------------------- date ranges

/** Presets understood by <DateRangePicker>. */
export const RANGE_PRESETS = {
  today: { label: 'Today', days: 1, trendLabel: 'vs yesterday' },
  '7d': { label: 'Last 7 days', days: 7, trendLabel: 'vs last week' },
  '30d': { label: 'Last 30 days', days: 30, trendLabel: 'vs previous 30 days' },
  '90d': { label: 'Last 90 days', days: 90, trendLabel: 'vs previous 90 days' },
  custom: { label: 'Custom range', trendLabel: 'vs previous period' },
}

/** { preset, from, to } for a preset, ending today (inclusive). */
export function presetRange(preset) {
  const days = RANGE_PRESETS[preset]?.days ?? 7
  const to = todayISO()
  return { preset, from: addDays(to, -(days - 1)), to }
}

/** Number of days in an inclusive YYYY-MM-DD range. */
export function rangeDays(from, to) {
  return Math.round((parseISODate(to) - parseISODate(from)) / 86400000) + 1
}

/** The equally long window just before { from, to } - for trend comparisons. */
export function previousRange({ from, to }) {
  const n = rangeDays(from, to)
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

export const trendLabelFor = (range) => RANGE_PRESETS[range?.preset]?.trendLabel || 'vs previous period'

/** Range -> API params; a range without dates means "server default". */
export const rangeParams = (range) => (range?.from && range?.to ? { from: range.from, to: range.to } : {})

// ---------------------------------------------------------------- numbers

/** 1250 -> "1.3K", 1250000 -> "12.5L" style compact labels for chart axes. */
export function compactNumber(n) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  if (abs >= 1e7) return `${+(v / 1e7).toFixed(1)}Cr`
  if (abs >= 1e5) return `${+(v / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `${+(v / 1e3).toFixed(1)}K`
  return String(Math.round(v * 10) / 10)
}

// ---------------------------------------------------------------- devices

/**
 * Login-activity user agents -> "Windows · Chrome". Unknown agents (curl,
 * scripts) are returned as-is so nothing is invented.
 */
export function deviceLabel(ua) {
  const s = String(ua || '')
  if (!s) return { label: 'Unknown device', kind: 'other' }
  let os = ''
  let kind = 'desktop'
  if (/iPad/i.test(s)) {
    os = 'iPad'
    kind = 'tablet'
  } else if (/iPhone/i.test(s)) {
    os = 'iPhone'
    kind = 'mobile'
  } else if (/Android/i.test(s)) {
    os = 'Android'
    kind = /Mobile/i.test(s) ? 'mobile' : 'tablet'
  } else if (/Windows/i.test(s)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS'
  else if (/CrOS/i.test(s)) os = 'ChromeOS'
  else if (/Linux/i.test(s)) os = 'Linux'

  let browser = ''
  if (/Edg\//i.test(s)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(s)) browser = 'Opera'
  else if (/SamsungBrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/Firefox\//i.test(s)) browser = 'Firefox'
  else if (/Chrome\//i.test(s)) browser = 'Chrome'
  else if (/Safari\//i.test(s)) browser = 'Safari'

  if (!os && !browser) return { label: s.length > 40 ? `${s.slice(0, 40)}…` : s, kind: 'other' }
  return { label: [os, browser].filter(Boolean).join(' · '), kind }
}

/** File looks like an image we can thumbnail. */
export const isImageFile = (path) => /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(String(path || ''))

// ---------------------------------------------------------------- events

/**
 * Fired on window after a bus is approved / rejected / moved to review, so
 * anything showing the pending count (e.g. the sidebar badge) can re-fetch.
 */
export const BUS_REQUESTS_CHANGED_EVENT = 'gogo:bus-requests-changed'

// ---------------------------------------------------------------- colours

/** Chart palette: navy + orange lead, blue / grey for secondary series. */
export const CHART_COLORS = {
  navy: '#0b2a7a',
  orange: '#ff5a1f',
  blue: '#3b82f6',
  grey: '#cbd3e1',
  sky: '#7aa2f7',
}

/** Badge tone per user role. */
export const ROLE_TONE = {
  SUPER_ADMIN: 'accent',
  ADMIN: 'warning',
  BUS_OWNER: 'primary',
  DRIVER: 'info',
  PASSENGER: 'neutral',
}

/**
 * Icon + colour for an audit-log `action` (GET /admin/activities,
 * dashboard.recentActivities). Unknown actions fall back to a bell.
 */
export function activityMeta(action = '') {
  if (action === 'BUS_APPROVED') return { Icon: CheckCircle2, tone: 'success' }
  if (action === 'BUS_REJECTED') return { Icon: XCircle, tone: 'danger' }
  if (action === 'BUS_SUBMITTED') return { Icon: UserRound, tone: 'accent' }
  if (action === 'BUS_UNDER_REVIEW') return { Icon: Hourglass, tone: 'info' }
  if (action === 'BUS_PENDING') return { Icon: Clock, tone: 'warning' }
  if (action.startsWith('BUS_')) return { Icon: Bus, tone: 'primary' }
  if (action.startsWith('ROUTE_')) return { Icon: Route, tone: 'primary' }
  if (action.endsWith('_DELETED')) return { Icon: Trash2, tone: 'danger' }
  if (action.startsWith('USER_')) return { Icon: UserPlus, tone: 'violet' }
  if (action.startsWith('SETTINGS_')) return { Icon: Settings, tone: 'neutral' }
  return { Icon: Bell, tone: 'primary' }
}

