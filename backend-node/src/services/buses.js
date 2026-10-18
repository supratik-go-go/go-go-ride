// Bus search, details and owner submission (port of app/services/buses.py).
//
// The search is the heart of the product: it returns each bus timed for the
// requested stop pair, and keeps the buses that do NOT run on the chosen date in
// the result so the app can render the "Not Running" card rather than silently
// hiding them.
import { config } from '../config.js'
import { all, byId, get, insert, like, placeholders, run, scalar, update } from '../db.js'
import { ApiError } from '../errors.js'
import { newId } from '../ids.js'
import { busColumns, busDocumentOut, busExceptionOut, busStopages, reviewOut, routeBrief, timetableRows, userBriefById } from '../serialize.js'
import { dateOnly, durationMinutes, formatDuration, minutesUntil, runsOnDay, startOfDay, to12h, todayMs } from '../time.js'
import { pyRound2 } from './pydantic.js'

const DAY_MS = 86400000

// ---------------------------------------------------------------- dates

/**
 * start_of_day() for a client-supplied date (query ?date= or a body date).
 * Accepts what Python's datetime.fromisoformat accepts in practice: YYYY-MM-DD,
 * YYYYMMDD and full ISO timestamps. The Python service answers an unparsable
 * date with a bare 500; here it is a 400 validation error instead.
 */
export function parseDay(value, fieldName = 'date') {
  const s = String(value).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const ms = Date.UTC(y, mo - 1, d)
    const back = new Date(ms)
    if (y >= 1 && back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d) return ms
  } else if ((m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})(:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(s))) {
    const iso = s.replace(' ', 'T')
    const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
    if (!Number.isNaN(ms)) return startOfDay(ms)
  }
  throw ApiError.badRequest('Validation failed', [{ field: fieldName, message: 'Input should be a valid date in the format YYYY-MM-DD' }])
}

// ---------------------------------------------------------------- legs

/** Stopages of a bus (by sequence) with their stop rows attached. */
function loadStopages(busId) {
  return busStopages(busId).map((s) => ({ ...s, stop: byId('BusStop', s.stopId) }))
}

/** The portion of a timetable between two stops; null when the bus does not serve that pair in that direction. */
export function findLeg(stopages, fromStopId, toStopId) {
  if (!stopages.length) return null
  const origin = fromStopId ? stopages.find((s) => s.stopId === fromStopId) : stopages[0]
  const destination = toStopId ? stopages.find((s) => s.stopId === toStopId) : stopages[stopages.length - 1]
  if (!origin || !destination) return null
  if (origin.sequence >= destination.sequence) return null // wrong direction
  return {
    fromStop: origin.stop,
    toStop: destination.stop,
    departureTime: origin.departureTime,
    arrivalTime: destination.arrivalTime,
    duration: durationMinutes(origin.departureTime, destination.arrivalTime),
  }
}

// ---------------------------------------------------------------- stops

export function resolveStopIdByName(name) {
  if (!name) return null
  const stop = get('SELECT id FROM "BusStop" WHERE name LIKE ? ORDER BY name LIMIT 1', like(name))
  return stop ? stop.id : null
}

/** Find an existing stop by name, or create it - owners type new stopages. */
export function resolveStopId({ stopId, stopName }) {
  if (stopId) {
    const stop = byId('BusStop', stopId)
    if (!stop) throw ApiError.badRequest(`Bus stop ${stopId} does not exist`)
    return stop.id
  }
  const name = (stopName || '').trim()
  const existing = get('SELECT id FROM "BusStop" WHERE name = ? LIMIT 1', name)
  if (existing) return existing.id
  const now = Date.now()
  const created = insert('BusStop', {
    id: newId(),
    name,
    area: null,
    city: 'Kolkata',
    latitude: null,
    longitude: null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  })
  return created.id
}

// ---------------------------------------------------------------- search

const stopRef = (stop) => (stop ? { id: stop.id, name: stop.name ?? null } : null)

const SORTERS = {
  departure: (r) => r.departureTime,
  fare: (r) => r.fare,
  duration: (r) => r.durationMinutes,
  rating: (r) => -r.rating.average,
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function searchBuses({
  fromText = null,
  toText = null,
  fromStopId = null,
  toStopId = null,
  q = null,
  searchType = 'ROUTE',
  date = null,
  time = null,
  busType = null,
  category = null,
  maxFare = null,
  sort = 'departure',
  includeNotRunning = true,
}) {
  const today = todayMs()
  const travelDate = date ? parseDay(date) : today
  const isToday = travelDate === today

  const fromId = fromStopId || resolveStopIdByName(fromText)
  const toId = toStopId || resolveStopIdByName(toText)

  if (searchType === 'ROUTE') {
    if ((fromText || fromStopId) && !fromId) throw ApiError.notFound(`No bus stop found matching "${fromText}"`)
    if ((toText || toStopId) && !toId) throw ApiError.notFound(`No bus stop found matching "${toText}"`)
  }

  const where = ['"Bus".status = ?']
  const params = ['APPROVED']
  if (busType) {
    where.push('"Bus".type = ?')
    params.push(busType)
  }
  if (category) {
    where.push('"Bus".category = ?')
    params.push(category)
  }
  if (maxFare !== null && maxFare !== undefined) {
    where.push('"Bus".fare <= ?')
    params.push(maxFare)
  }
  const servesStop = '(EXISTS (SELECT 1 FROM "BusStopage" WHERE "Bus".id = "BusStopage"."busId" AND "BusStopage"."stopId" = ?))'
  if (searchType === 'BUS_NUMBER' && q) {
    where.push('"Bus"."busNumber" LIKE ?')
    params.push(like(q.toUpperCase()))
  } else if (searchType === 'BUS_NAME' && q) {
    where.push('"Bus"."busName" LIKE ?')
    params.push(like(q))
  } else if (fromId && toId) {
    where.push(servesStop, servesStop)
    params.push(fromId, toId)
  } else if (fromId) {
    where.push(servesStop)
    params.push(fromId)
  }

  const buses = all(`SELECT * FROM "Bus" WHERE ${where.join(' AND ')}`, ...params)

  // One query for the exceptions falling on the travel date.
  const excepted = new Map()
  if (buses.length) {
    const ids = buses.map((b) => b.id)
    for (const row of all(`SELECT * FROM "BusException" WHERE "busId" IN (${placeholders(ids)}) AND date = ?`, ...ids, travelDate)) {
      excepted.set(row.busId, row)
    }
  }

  let results = []
  for (const bus of buses) {
    const stopages = loadStopages(bus.id)
    const leg = findLeg(stopages, fromId, toId)
    if (!leg && searchType === 'ROUTE' && fromId && toId) continue

    const scheduled = runsOnDay(bus.serviceDays, travelDate)
    const exception = excepted.get(bus.id)
    const isRunning = scheduled && !exception

    const first = stopages[0]
    const last = stopages[stopages.length - 1]
    const departure = leg ? leg.departureTime : first ? first.departureTime : '00:00'
    const arrival = leg ? leg.arrivalTime : last ? last.arrivalTime : '00:00'
    const duration = leg ? leg.duration : durationMinutes(departure, arrival)

    let reason = null
    if (!scheduled) reason = 'This bus does not operate on this day of the week'
    else if (exception) reason = exception.reason || 'The owner has reported no service on this date'

    const startName = first ? first.stop.name : ''
    const endName = last ? last.stop.name : ''
    const route = byId('Route', bus.routeId)

    results.push({
      id: bus.id,
      busNumber: bus.busNumber,
      busName: bus.busName ?? null,
      routeName: route ? route.name : `${startName} - ${endName}`,
      routeNumber: route ? route.routeNumber : null,
      type: bus.type,
      category: bus.category,
      operator: bus.operator ?? null,
      fare: Number(bus.fare),
      totalSeats: bus.totalSeats,
      rating: { average: Number(bus.ratingAvg), count: bus.ratingCount },
      from: leg ? stopRef(leg.fromStop) : null,
      to: leg ? stopRef(leg.toStop) : null,
      departureTime: departure,
      departureTime12h: to12h(departure),
      arrivalTime: arrival,
      arrivalTime12h: to12h(arrival),
      durationMinutes: duration,
      durationLabel: formatDuration(duration),
      isRunning,
      notRunningReason: reason,
      // "Next: 07:30 AM" chip - only meaningful for today.
      nextDepartureInMinutes: isToday && isRunning ? minutesUntil(departure) : null,
    })
  }

  if (!includeNotRunning) results = results.filter((r) => r.isRunning)
  if (time) results = results.filter((r) => r.departureTime >= time)

  const key = SORTERS[sort] || SORTERS.departure
  results.sort((a, b) => cmp(key(a), key(b))) // stable, like Python's sort
  // Running buses always come before the "Not Running" cards.
  results.sort((a, b) => Number(!a.isRunning) - Number(!b.isRunning))

  return {
    date: dateOnly(travelDate),
    from: fromId ? { id: fromId, name: fromText ?? null } : null,
    to: toId ? { id: toId, name: toText ?? null } : null,
    total: results.length,
    buses: results,
  }
}

// ---------------------------------------------------------------- details

/** BusDetails payload: BusOut columns + timetable, journey, availability, upcoming exceptions, latest reviews. */
export function busDetails(busId, date = null) {
  const bus = byId('Bus', busId)
  if (!bus) throw ApiError.notFound('Bus not found')

  const today = todayMs()
  const travelDate = date ? parseDay(date) : today
  const upcoming = all('SELECT * FROM "BusException" WHERE "busId" = ? AND date >= ? ORDER BY date', bus.id, today)
  const exception = upcoming.find((e) => e.date === travelDate)
  const scheduled = runsOnDay(bus.serviceDays, travelDate)

  const stopageRows = busStopages(bus.id)
  const first = stopageRows[0]
  const last = stopageRows[stopageRows.length - 1]
  const duration = first && last ? durationMinutes(first.departureTime, last.arrivalTime) : 0

  let reason = null
  if (!scheduled) reason = 'This bus does not operate on this day of the week'
  else if (exception) reason = exception.reason || 'The owner has reported no service on this date'

  // bus.reviews (loaded in table order), newest first, top 10 - a stable sort like Python's sorted().
  const reviews = all('SELECT * FROM "Review" WHERE "busId" = ? ORDER BY rowid', bus.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)

  return {
    ...busColumns(bus),
    owner: userBriefById(bus.ownerId),
    route: routeBrief(byId('Route', bus.routeId)),
    stopages: timetableRows(stopageRows),
    documents: all('SELECT * FROM "BusDocument" WHERE "busId" = ? ORDER BY rowid', bus.id).map(busDocumentOut),
    timetable: timetableRows(stopageRows),
    journey: {
      departureTime: first ? first.departureTime : null,
      arrivalTime: last ? last.arrivalTime : null,
      durationMinutes: duration,
      durationLabel: formatDuration(duration),
      totalDistanceKm: last ? Number(last.distanceKm) : 0,
    },
    availability: {
      date: dateOnly(travelDate),
      isRunning: scheduled && !exception,
      reason,
    },
    exceptions: upcoming.map(busExceptionOut),
    reviews: reviews.map(reviewOut),
  }
}

// ---------------------------------------------------------------- writes

/** Insert a bus timetable, in order (sequence 1..n). */
export function insertStopages(busId, stopages, stopIds) {
  stopages.forEach((s, index) => {
    insert('BusStopage', {
      id: newId(),
      busId,
      stopId: stopIds[index],
      sequence: index + 1,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      distanceKm: s.distanceKm,
    })
  })
}

/** Rewrites a bus timetable in order. */
export function replaceStopages(busId, stopages) {
  const stopIds = stopages.map((s) => resolveStopId(s))
  run('DELETE FROM "BusStopage" WHERE "busId" = ?', busId)
  insertStopages(busId, stopages, stopIds)
}

/** Owners must give the configured notice; admins may override it. Returns the BusException row. */
export function addException(busId, { date, reason, enforceNotice }) {
  const day = parseDay(date)
  const daysAhead = Math.floor((day - todayMs()) / DAY_MS)

  if (daysAhead < 0) throw ApiError.badRequest('Pick a future date')
  if (enforceNotice && daysAhead < config.busExceptionMinDays) {
    throw ApiError.badRequest(`Non-operating dates must be reported at least ${config.busExceptionMinDays} days in advance`)
  }

  const existing = get('SELECT * FROM "BusException" WHERE "busId" = ? AND date = ?', busId, day)
  if (existing) {
    update('BusException', existing.id, { reason })
    return byId('BusException', existing.id)
  }
  return insert('BusException', { id: newId(), busId, date: day, reason, createdAt: Date.now() })
}

/** Average + count of a bus's reviews onto the bus row (updatedAt moves only when they change). */
export function recomputeRating(bus) {
  const row = get('SELECT AVG(rating) AS avg, COUNT(id) AS count FROM "Review" WHERE "busId" = ?', bus.id)
  const ratingAvg = pyRound2(Number(row?.avg || 0))
  const ratingCount = Number(row?.count || 0)
  if (ratingAvg !== Number(bus.ratingAvg) || ratingCount !== bus.ratingCount) {
    update('Bus', bus.id, { ratingAvg, ratingCount, updatedAt: Date.now() })
  }
}

export function assertOwnership(busId, userId) {
  const bus = byId('Bus', busId)
  if (!bus) throw ApiError.notFound('Bus not found')
  if (bus.ownerId !== userId) throw ApiError.forbidden('You can only manage your own buses')
  return bus
}

/** Free-text filter shared by the bus list endpoints: [sql, params]. */
export function searchFilter(term) {
  return [
    '("Bus"."busNumber" LIKE ? OR "Bus"."busName" LIKE ? OR "Bus".operator LIKE ?)',
    [like(term.toUpperCase()), like(term), like(term)],
  ]
}

/** Number of buses per route id (any status). */
export function busCountsByRoute(routeIds) {
  const out = new Map()
  if (!routeIds.length) return out
  for (const row of all(
    `SELECT "routeId" AS id, COUNT(id) AS n FROM "Bus" WHERE "routeId" IN (${placeholders(routeIds)}) GROUP BY "routeId"`,
    ...routeIds,
  )) {
    out.set(row.id, Number(row.n))
  }
  return out
}

export const countBusesOnRoute = (routeId) => Number(scalar('SELECT COUNT(id) FROM "Bus" WHERE "routeId" = ?', routeId) || 0)

