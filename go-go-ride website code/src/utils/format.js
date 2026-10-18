// Display helpers. Times from the API already ship with a `...12h` companion -
// use that rather than re-formatting. These cover dates, money and enums.

const pad = (n) => String(n).padStart(2, '0')

/** Local date as YYYY-MM-DD (never toISOString, which shifts to UTC). */
export function toISODate(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const todayISO = () => toISODate(new Date())

export function addDays(iso, days) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Parse YYYY-MM-DD (or an ISO timestamp's date part) as a *local* date. */
export function parseISODate(value) {
  if (!value) return new Date()
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "24 May 2026" */
export function formatDate(value) {
  if (!value) return '-'
  const d = parseISODate(value)
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** "Friday, 24 May 2026" */
export function formatDateLong(value) {
  const d = parseISODate(value)
  return `${DAY_LONG[d.getDay()]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** { day: 24, month: 'May', weekday: 'Fri' } for date strips. */
export function dateParts(iso) {
  const d = parseISODate(iso)
  return { day: d.getDate(), month: MONTH_SHORT[d.getMonth()], weekday: DAY_SHORT[d.getDay()] }
}

/** "Today", "Tomorrow" or "24 May" */
export function relativeDayLabel(iso) {
  const t = todayISO()
  if (iso === t) return 'Today'
  if (iso === addDays(t, 1)) return 'Tomorrow'
  if (iso === addDays(t, -1)) return 'Yesterday'
  const { day, month } = dateParts(iso)
  return `${day} ${month}`
}

/** Timestamp (ISO-8601) -> "24 May 2026, 09:30 AM". Handles timestamps without Z. */
export function formatDateTime(value) {
  if (!value) return '-'
  const d = parseTimestamp(value)
  const h = d.getHours()
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

export function formatTime(value) {
  const d = parseTimestamp(value)
  const h = d.getHours()
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

export function parseTimestamp(value) {
  if (value instanceof Date) return value
  const s = String(value)
  // Some admin endpoints omit the trailing Z - they are UTC regardless.
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
}

/** "5 min ago", "Yesterday", "3 days ago", then a date. */
export function timeAgo(value) {
  if (!value) return ''
  const diff = (Date.now() - parseTimestamp(value).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 172800) return 'Yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return formatDate(parseTimestamp(value).toISOString())
}

/** "HH:mm" -> "hh:mm AM" for values without a 12h companion (e.g. form inputs). */
export function to12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

export function formatMinutes(mins) {
  if (mins == null) return ''
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
export const formatCurrency = (n, withPaise = false) => (n == null ? '-' : (withPaise ? inrPaise : inr).format(n))

const num = new Intl.NumberFormat('en-IN')
export const formatNumber = (n) => (n == null ? '-' : num.format(n))

/** "9123456789" -> "+91 91234 56789" */
export function formatPhone(phone) {
  if (!phone) return ''
  const d = String(phone).replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return phone
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
}

/** Landline-ish contact numbers ("03324567890") -> "033 2456 7890" */
export function formatContact(phone) {
  if (!phone) return ''
  const d = String(phone).replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
  if (d.length === 10) return formatPhone(d)
  return phone
}

export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(String(p || '').replace(/\D/g, '').slice(-10))

export function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Route badge text: routeNumber, falling back to busNumber (owner buses have no route). */
export const busBadge = (bus) => bus?.routeNumber || bus?.route?.routeNumber || bus?.busNumber || ''

/** serviceDays arrives as "MON,TUE" and is sent as ["MON","TUE"]. */
export const splitDays = (value) => (Array.isArray(value) ? value : String(value || '').split(',').filter(Boolean))

// ---------------------------------------------------------------- enum labels

export const LABELS = {
  role: { PASSENGER: 'Passenger', BUS_OWNER: 'Bus Owner', DRIVER: 'Driver', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' },
  busType: { AC: 'AC', NON_AC: 'Non AC' },
  busCategory: { NORMAL: 'Normal', SUPER_FAST: 'Super Fast', EXPRESS: 'Express', DELUXE: 'Deluxe' },
  busStatus: { PENDING: 'Pending', UNDER_REVIEW: 'Under Review', APPROVED: 'Approved', REJECTED: 'Rejected' },
  docType: { RC_BOOK: 'RC Book', ROUTE_PERMIT: 'Route Permit', INSURANCE: 'Insurance', OTHER: 'Other Document' },
  day: { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' },
  alarmStatus: { ACTIVE: 'Active', TRIGGERED: 'Triggered', CANCELLED: 'Cancelled', EXPIRED: 'Expired' },
  bookingType: { BUS: 'Bus', RIDE: 'Shared Ride', LOCAL_CAR: 'Local Car' },
  bookingStatus: { PENDING: 'Pending', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  paymentMode: { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', WALLET: 'Wallet' },
  paymentStatus: { PENDING: 'Pending', PAID: 'Paid', REFUNDED: 'Refunded', FAILED: 'Failed' },
  userStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive', BLOCKED: 'Blocked' },
  recordStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  vehicleType: { CAR: 'Car', AUTO: 'Auto', BIKE: 'Bike' },
  rideStatus: { SCHEDULED: 'Scheduled', RUNNING: 'Running', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  ticketCategory: { GENERAL: 'General', BUS: 'Bus', BOOKING: 'Booking', PAYMENT: 'Payment', ACCOUNT: 'Account' },
  ticketStatus: { OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', CLOSED: 'Closed' },
  ticketPriority: { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High' },
  notificationType: { SYSTEM: 'System', USER: 'User', PROMO: 'Promo', ALARM: 'Alarm' },
}

export const label = (group, value) => LABELS[group]?.[value] ?? value ?? '-'

/** Badge tone for any status-like enum value. */
export function statusTone(value) {
  switch (value) {
    case 'APPROVED':
    case 'ACTIVE':
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'PAID':
    case 'RESOLVED':
    case 'RUNNING':
    case 'LIVE':
    case 'TRIGGERED':
      return 'success'
    case 'PENDING':
    case 'OPEN':
    case 'SCHEDULED':
    case 'COMING_SOON':
      return 'warning'
    case 'UNDER_REVIEW':
    case 'IN_PROGRESS':
    case 'REFUNDED':
      return 'info'
    case 'REJECTED':
    case 'BLOCKED':
    case 'CANCELLED':
    case 'FAILED':
    case 'HIGH':
      return 'danger'
    default:
      return 'neutral'
  }
}

export const ROLES_ADMIN = ['ADMIN', 'SUPER_ADMIN']
export const isAdminRole = (role) => ROLES_ADMIN.includes(role)
