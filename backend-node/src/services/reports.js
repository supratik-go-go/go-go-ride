// Dashboard statistics and the Reports & Analytics figures (port of app/services/reports.py).
//
// Bookings are read in id order (ids start with their creation time, so this is the order they were
// added in, as the old SQLite rowid order was). Float sums and first-seen orders stay the same.
//
// (Python's reports.platform_counters lives in routes/platform.js here.)
import { all, at, byId, scalar } from '../db.js'
import { ApiError } from '../errors.js'
import { addDays, dateOnly, startOfDay, todayMs } from '../time.js'

// ---------------------------------------------------------------- Python-compatible number helpers

/**
 * Python's round(x, nd): rounds the exact binary value of x, ties (only possible
 * when x is exactly halfway) go to the even digit. Math.round(x * 10 ** nd) differs
 * on values like 2.675 and 0.125.
 */
export function pyRound(x, nd = 0) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x === 0) return x
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  if (ax >= 1e21) return x
  // toFixed(100) is the exact decimal expansion for any value this API rounds.
  const [ip, fp] = ax.toFixed(100).split('.')
  const kept = fp.slice(0, nd)
  const rest = fp.slice(nd).replace(/0+$/, '')
  let up
  if (rest === '5') {
    const last = nd > 0 ? kept[nd - 1] : ip[ip.length - 1]
    up = Number(last) % 2 === 1
  } else {
    up = rest !== '' && rest[0] >= '5'
  }
  let digits = BigInt(ip + kept)
  if (up) digits += 1n
  const s = digits.toString().padStart(nd + 1, '0')
  const text = nd > 0 ? `${s.slice(0, s.length - nd)}.${s.slice(s.length - nd)}` : s
  return sign * Number(text)
}

/** str(float) in Python: always carries a decimal point ("0.0", "120.5", "1e+16"). */
export function pyFloatStr(x) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf'
  const ax = Math.abs(x)
  if (x !== 0 && (ax >= 1e16 || ax < 1e-4)) {
    // Python: 1e+16, 1.5e-05 (two-digit exponent minimum)
    return x.toExponential().replace(/e([+-])(\d)$/, 'e$10$2')
  }
  const s = String(x)
  return /[.e]/.test(s) ? s : `${s}.0`
}

// ---------------------------------------------------------------- date window

function lastValue(v) {
  return Array.isArray(v) ? v[v.length - 1] : v
}

/** "YYYY-MM-DD" (or an ISO datetime) -> midnight UTC ms; null when not a real date. */
function parseDay(raw) {
  const value = String(raw).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) {
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3])
    return dateOnly(ms) === value ? ms : null
  }
  // Full timestamps, like Python's datetime.fromisoformat (offsets are converted to UTC).
  const iso = value.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, '$1T')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(iso)) return null
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`)
  return Number.isNaN(ms) ? null : startOfDay(ms)
}

/**
 * The report window: `from` defaults to 7 days before `to`, `to` (inclusive)
 * defaults to today, so the default window is 8 calendar days, like Python.
 * Returns { start, end } in ms, `end` exclusive.
 *
 * Python answers an unparseable date with a bare 500; here it is a 400.
 */
export function resolveRange(fromRaw, toRaw) {
  const from = lastValue(fromRaw)
  const to = lastValue(toRaw)
  const errors = []
  let fromMs = null
  let toMs = null
  if (from) {
    fromMs = parseDay(from)
    if (fromMs === null) errors.push({ field: 'from', message: 'Use YYYY-MM-DD' })
  }
  if (to) {
    toMs = parseDay(to)
    if (toMs === null) errors.push({ field: 'to', message: 'Use YYYY-MM-DD' })
  }
  if (errors.length) throw ApiError.badRequest('Validation failed', errors)
  const endDay = toMs ?? todayMs()
  const start = fromMs ?? addDays(endDay, -7)
  return { start, end: addDays(endDay, 1) }
}

// ---------------------------------------------------------------- figures

export function trend(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100
  return pyRound(((current - previous) / previous) * 100, 1)
}

async function count(table, start, end) {
  const n =
    start === undefined
      ? await scalar(`SELECT COUNT(id) FROM ${table}`)
      : await scalar(`SELECT COUNT(id) FROM ${table} WHERE created_at >= ? AND created_at < ?`, at(start), at(end))
  return Number(n || 0)
}

export async function dashboardStats(window) {
  const span = window.end - window.start
  const prev = { start: window.start - span, end: window.start }

  const totalBuses = await count('buses')
  const pending = Number((await scalar(`SELECT COUNT(id) FROM buses WHERE status IN ('PENDING', 'UNDER_REVIEW')`)) || 0)
  const totalRoutes = await count('bus_routes')
  const totalUsers = await count('users')

  const busesNow = await count('buses', window.start, window.end)
  const busesPrev = await count('buses', prev.start, prev.end)
  const usersNow = await count('users', window.start, window.end)
  const usersPrev = await count('users', prev.start, prev.end)
  const routesNow = await count('bus_routes', window.start, window.end)
  const routesPrev = await count('bus_routes', prev.start, prev.end)
  const bookingsNow = await count('bookings', window.start, window.end)
  const bookingsPrev = await count('bookings', prev.start, prev.end)

  // Alphabetical, as before: MySQL would otherwise sort a status list in its defined order.
  const breakdown = (await all('SELECT status, COUNT(id) AS n FROM buses GROUP BY status ORDER BY CAST(status AS CHAR)')).map((r) => ({
    status: r.status,
    count: Number(r.n),
    percentage: totalBuses === 0 ? 0 : pyRound((Number(r.n) / totalBuses) * 100, 1),
  }))

  return {
    cards: {
      totalBuses: { value: totalBuses, trend: trend(busesNow, busesPrev) },
      pendingApprovals: { value: pending },
      totalRoutes: { value: totalRoutes, trend: trend(routesNow, routesPrev) },
      totalUsers: { value: totalUsers, trend: trend(usersNow, usersPrev) },
    },
    busStatusOverview: { total: totalBuses, breakdown },
    busesAdded: { value: busesNow, trend: trend(busesNow, busesPrev) },
    bookingsOverview: { value: bookingsNow, trend: trend(bookingsNow, bookingsPrev) },
  }
}

const bookingsIn = (window) =>
  all('SELECT * FROM bookings WHERE created_at >= ? AND created_at < ? ORDER BY id', at(window.start), at(window.end))

/** Per-day counts behind the dashboard line charts (one row per day of the window). */
export async function dailySeries(window) {
  const buses = await all('SELECT * FROM buses WHERE created_at >= ? AND created_at < ? ORDER BY created_at, id', at(window.start), at(window.end))
  const bookings = await bookingsIn(window)

  const days = []
  for (let cursor = window.start; cursor < window.end; cursor = addDays(cursor, 1)) days.push(dateOnly(cursor))

  const busMap = new Map()
  for (const bus of buses) {
    const key = dateOnly(bus.createdAt)
    busMap.set(key, (busMap.get(key) || 0) + 1)
  }

  const bookingMap = new Map()
  const revenueMap = new Map()
  for (const booking of bookings) {
    const key = dateOnly(booking.createdAt)
    bookingMap.set(key, (bookingMap.get(key) || 0) + 1)
    if (booking.status !== 'CANCELLED') revenueMap.set(key, (revenueMap.get(key) || 0) + Number(booking.amount))
  }

  return days.map((day) => ({
    date: day,
    buses: busMap.get(day) || 0,
    bookings: bookingMap.get(day) || 0,
    revenue: pyRound(revenueMap.get(day) || 0, 2),
  }))
}

/** Bus + route of a booking, memoised per call. */
function busRouteLookup() {
  const buses = new Map()
  const routes = new Map()
  const bus = async (id) => {
    if (!id) return null
    if (!buses.has(id)) buses.set(id, (await byId('buses', id)) || null)
    return buses.get(id)
  }
  const route = async (b) => {
    if (!b || !b.routeId) return null
    if (!routes.has(b.routeId)) routes.set(b.routeId, (await byId('bus_routes', b.routeId)) || null)
    return routes.get(b.routeId)
  }
  return { bus, route }
}

/** Revenue, trips, occupancy, distance and the payment-mode split. */
export async function reportSummary(window) {
  const bookings = await bookingsIn(window)
  const { bus, route } = busRouteLookup()

  const completed = bookings.filter((b) => b.status !== 'CANCELLED')
  let totalRevenue = 0
  let seatsBooked = 0
  let totalDistance = 0
  let capacity = 0
  for (const b of completed) totalRevenue += Number(b.amount)
  for (const b of completed) seatsBooked += b.seats
  for (const b of completed) {
    const bb = await bus(b.busId)
    const r = await route(bb)
    totalDistance += (bb && r ? Number(r.distanceKm) : 0) * b.seats
  }
  for (const b of completed) {
    const bb = await bus(b.busId)
    capacity += bb ? bb.totalSeats : 0
  }
  const occupancy = capacity === 0 ? 0 : pyRound((seatsBooked / capacity) * 100, 1)

  const byMode = new Map()
  for (const b of completed) byMode.set(b.paymentMethod, (byMode.get(b.paymentMethod) || 0) + Number(b.amount))
  const paymentSplit = [...byMode].map(([mode, amount]) => ({
    mode,
    amount: pyRound(amount, 2),
    percentage: totalRevenue === 0 ? 0 : pyRound((amount / totalRevenue) * 100, 1),
  }))

  const statusCounts = {}
  for (const b of bookings) statusCounts[b.status] = (statusCounts[b.status] || 0) + 1

  return {
    range: { from: dateOnly(window.start), to: dateOnly(addDays(window.end, -1)) },
    totalRevenue: pyRound(totalRevenue, 2),
    totalTrips: completed.length,
    totalBookings: bookings.length,
    avgOccupancy: occupancy,
    totalDistanceKm: pyRound(totalDistance, 1),
    paymentSplit,
    statusCounts,
  }
}

/** The "Top Routes by Bookings" panel (seats booked per route, most first). */
export async function topRoutes(window, limit = 5) {
  const bookings = await all(
    'SELECT * FROM bookings WHERE created_at >= ? AND created_at < ? AND bus_id IS NOT NULL ORDER BY id',
    at(window.start),
    at(window.end),
  )
  const { bus, route } = busRouteLookup()

  const tally = new Map()
  for (const booking of bookings) {
    const r = await route(await bus(booking.busId))
    if (!r) continue
    if (!tally.has(r.id)) tally.set(r.id, { routeId: r.id, name: r.name, routeNumber: r.routeNumber, bookings: 0 })
    tally.get(r.id).bookings += booking.seats
  }
  // Array.prototype.sort is stable, like Python's sorted(..., reverse=True).
  return [...tally.values()].sort((a, b) => b.bookings - a.bookings).slice(0, limit)
}
