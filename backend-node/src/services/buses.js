// Bus search, details and owner submission (port of app/services/buses.py).
//
// The search is the heart of the product: it returns each bus timed for the
// requested stop pair, and keeps the buses that do NOT run on the chosen date in
// the result so the app can render the "Not Running" card rather than silently
// hiding them.
import { config } from '../config.js'
import { all, byId, day, get, insert, like, placeholders, run, scalar, update } from '../db.js'
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

/**
 * Timetables of many buses at once: for each bus its trips (first trip first), each trip in stop
 * order with its stops attached. Two queries instead of one per bus and one per stop, so search
 * stays fast with a thousand buses. A bus that goes out and back has two trips.
 */
async function loadTripsFor(busIds) {
  const byBus = new Map(busIds.map((id) => [id, []]))
  if (!busIds.length) return byBus
  const rows = await all(
    `SELECT t.* FROM bus_timetable t JOIN bus_trips r ON r.id = t.trip_id
     WHERE t.bus_id IN (${placeholders(busIds)}) AND r.is_active = 1 ORDER BY t.bus_id, r.trip_number, t.stop_order`,
    ...busIds,
  )
  const stopIds = [...new Set(rows.map((r) => r.stopId))]
  const stops = new Map((stopIds.length ? await all(`SELECT * FROM bus_stops WHERE id IN (${placeholders(stopIds)})`, ...stopIds) : []).map((s) => [s.id, s]))
  for (const r of rows) {
    const trips = byBus.get(r.busId)
    if (trips.at(-1)?.[0].tripId !== r.tripId) trips.push([])
    trips.at(-1).push({ ...r, stop: stops.get(r.stopId) })
  }
  return byBus
}

/** One bus's trips, each in stop order (without the stops attached). */
export async function tripsOf(busId) {
  const trips = []
  const rows = await all(
    'SELECT t.* FROM bus_timetable t JOIN bus_trips r ON r.id = t.trip_id WHERE t.bus_id = ? AND r.is_active = 1 ORDER BY r.trip_number, t.stop_order',
    busId,
  )
  for (const r of rows) {
    if (trips.at(-1)?.[0].tripId !== r.tripId) trips.push([])
    trips.at(-1).push(r)
  }
  return trips
}

/** The first trip that goes from one stop to the other (stop ids; a missing one matches any). */
export function tripBetween(trips, fromStopId, toStopId) {
  return trips.find((t) => findLeg(t, fromStopId, toStopId)) ?? null
}

/** The portion of a timetable between two stops; null when the bus does not serve that pair in that direction. */
export function findLeg(stopages, fromStopId, toStopId) {
  if (!stopages.length) return null
  const origin = fromStopId ? stopages.find((s) => s.stopId === fromStopId) : stopages[0]
  const destination = toStopId ? stopages.find((s) => s.stopId === toStopId) : stopages[stopages.length - 1]
  if (!origin || !destination) return null
  if (origin.stopOrder >= destination.stopOrder) return null // wrong direction
  return {
    fromStop: origin.stop,
    toStop: destination.stop,
    departureTime: origin.departureTime,
    arrivalTime: destination.arrivalTime,
    duration: durationMinutes(origin.departureTime, destination.arrivalTime),
  }
}

/** True when the via stop lies between the passenger's boarding and alighting stops. */
function passesThrough(stopages, viaStopId, fromStopId, toStopId) {
  const sequenceOf = (id) => stopages.find((s) => s.stopId === id)?.stopOrder
  const via = sequenceOf(viaStopId)
  if (via === undefined) return false
  const from = fromStopId ? sequenceOf(fromStopId) : -Infinity
  const to = toStopId ? sequenceOf(toStopId) : Infinity
  return from < via && via < to
}

// ---------------------------------------------------------------- stops

/**
 * The stop someone typed (without picking it from the list). Best first: the exact name, a shown
 * stop, a name that starts with the words, the stop most buses use, the shortest name. So "Sealdah"
 * is Sealdah, not North Sealdah, and "Howrah" is the busy Howrah Station. The second-language name
 * counts too, so "হাওড়া" finds Howrah Station.
 */
/** SQL: is ? exactly one of the stop's other names (a comma-separated list, e.g. after "Same place")? */
export const OTHER_NAME_IS = "FIND_IN_SET(?, REPLACE(REPLACE(s.other_name, ', ', ','), ' ,', ',')) > 0"

export async function resolveStopIdByName(name) {
  const text = String(name ?? '').trim()
  if (!text) return null
  // A stop joined to another ("Chandrakona" into "Chandrakona Town") lives on as an other name, and
  // counts as an exact match right after a real name.
  const stop = await get(
    `SELECT s.id FROM bus_stops s WHERE s.name LIKE ? OR s.other_name LIKE ?
     ORDER BY s.name = ? DESC, ${OTHER_NAME_IS} DESC, s.status = 'ACTIVE' DESC, s.name LIKE ? DESC,
       (SELECT COUNT(DISTINCT t.bus_id) FROM bus_timetable t WHERE t.stop_id = s.id) DESC, CHAR_LENGTH(s.name), s.name, s.id
     LIMIT 1`,
    like(text),
    like(text),
    text,
    text,
    `${text}%`,
  )
  return stop ? stop.id : null
}

/** Find an existing stop by name, or create it - owners type new stopages. */
export async function resolveStopId({ stopId, stopName }, status = 'ACTIVE') {
  if (stopId) {
    const stop = await byId('bus_stops', stopId)
    if (!stop) throw ApiError.badRequest(`Bus stop ${stopId} does not exist`)
    return stop.id
  }
  const name = (stopName || '').trim()
  const existing =
    (await get('SELECT id FROM bus_stops WHERE name = ? ORDER BY created_at, id LIMIT 1', name)) ||
    (await get(`SELECT s.id FROM bus_stops s WHERE ${OTHER_NAME_IS} ORDER BY s.created_at, s.id LIMIT 1`, name))
  if (existing) return existing.id
  const now = Date.now()
  const created = await insert('bus_stops', {
    id: newId(),
    name,
    area: null,
    city: 'Kolkata',
    latitude: null,
    longitude: null,
    status,
    createdAt: now,
    updatedAt: now,
  })
  return created.id
}

// ---------------------------------------------------------------- search

const stopRef = (stop) => (stop ? { id: stop.id, name: stop.name ?? null } : null)

const SORTERS = {
  departure: (r) => r.departureTime,
  fare: (r) => r.fare ?? Infinity, // fare not known: last
  duration: (r) => r.durationMinutes,
  rating: (r) => -r.rating.average,
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export async function searchBuses({
  fromText = null,
  toText = null,
  viaText = null,
  fromStopId = null,
  toStopId = null,
  viaStopId = null,
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

  const fromId = fromStopId || (await resolveStopIdByName(fromText))
  const toId = toStopId || (await resolveStopIdByName(toText))
  const viaId = searchType === 'ROUTE' ? viaStopId || (await resolveStopIdByName(viaText)) : null

  if (searchType === 'ROUTE') {
    if ((fromText || fromStopId) && !fromId) throw ApiError.notFound(`No bus stop found matching "${fromText}"`)
    if ((toText || toStopId) && !toId) throw ApiError.notFound(`No bus stop found matching "${toText}"`)
    if ((viaText || viaStopId) && !viaId) throw ApiError.notFound(`No bus stop found matching "${viaText}"`)
  }

  const where = ['b.status = ?']
  const params = ['APPROVED']
  if (busType) {
    where.push('b.is_ac = ?')
    params.push(busType === 'AC' ? 1 : 0)
  }
  if (category) {
    where.push('b.category = ?')
    params.push(category)
  }
  if (maxFare !== null && maxFare !== undefined) {
    where.push('b.fare <= ?')
    params.push(maxFare)
  }
  const servesStop = '(EXISTS (SELECT 1 FROM bus_timetable t WHERE t.bus_id = b.id AND t.stop_id = ?))'
  if (searchType === 'BUS_NUMBER' && q) {
    where.push('b.bus_number LIKE ?')
    params.push(like(q.toUpperCase()))
  } else if (searchType === 'BUS_NAME' && q) {
    where.push('(b.bus_name LIKE ? OR b.other_name LIKE ?)')
    params.push(like(q), like(q))
  } else if (fromId && toId) {
    where.push(servesStop, servesStop)
    params.push(fromId, toId)
  } else if (fromId) {
    where.push(servesStop)
    params.push(fromId)
  }

  const buses = await all(`SELECT b.* FROM buses b WHERE ${where.join(' AND ')} ORDER BY b.created_at, b.id`, ...params)

  // One query for the off days falling on the travel date, one for all timetables, one for the routes.
  const excepted = new Map()
  const ids = buses.map((b) => b.id)
  if (ids.length) {
    for (const row of await all(`SELECT * FROM bus_off_days WHERE bus_id IN (${placeholders(ids)}) AND off_date = ?`, ...ids, day(travelDate))) {
      excepted.set(row.busId, row)
    }
  }
  const timetables = await loadTripsFor(ids)
  const routeIds = [...new Set(buses.map((b) => b.routeId).filter(Boolean))]
  const routes = new Map((routeIds.length ? await all(`SELECT * FROM bus_routes WHERE id IN (${placeholders(routeIds)})`, ...routeIds) : []).map((r) => [r.id, r]))

  let results = []
  for (const bus of buses) {
    const trips = timetables.get(bus.id)
    // A bus that goes out and back shows the trip in the passenger's direction (else its first trip).
    const stopages =
      trips.find((t) => findLeg(t, fromId, toId) && (!viaId || passesThrough(t, viaId, fromId, toId))) ?? trips[0] ?? []
    const leg = findLeg(stopages, fromId, toId)
    if (!leg && searchType === 'ROUTE' && fromId && toId) continue
    if (viaId && !passesThrough(stopages, viaId, fromId, toId)) continue

    const scheduled = runsOnDay(bus.runsOn, travelDate)
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
    const route = routes.get(bus.routeId)

    results.push({
      id: bus.id,
      busNumber: bus.busNumber,
      busName: bus.busName ?? null,
      routeName: route ? route.name : `${startName} - ${endName}`,
      routeNumber: route ? route.routeNumber : null,
      type: bus.isAc ? 'AC' : 'NON_AC',
      category: bus.category,
      operator: bus.operator ?? null,
      fare: bus.fare === null ? null : Number(bus.fare),
      totalSeats: bus.totalSeats,
      rating: { average: Number(bus.ratingAverage), count: bus.ratingCount },
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
export async function busDetails(busId, date = null) {
  const bus = await byId('buses', busId)
  if (!bus) throw ApiError.notFound('Bus not found')

  const today = todayMs()
  const travelDate = date ? parseDay(date) : today
  const upcoming = await all('SELECT * FROM bus_off_days WHERE bus_id = ? AND off_date >= ? ORDER BY off_date', bus.id, day(today))
  const exception = upcoming.find((e) => e.offDate === travelDate)
  const scheduled = runsOnDay(bus.runsOn, travelDate)

  const stopageRows = await busStopages(bus.id)
  const first = stopageRows[0]
  const last = stopageRows[stopageRows.length - 1]
  const duration = first && last ? durationMinutes(first.departureTime, last.arrivalTime) : 0

  let reason = null
  if (!scheduled) reason = 'This bus does not operate on this day of the week'
  else if (exception) reason = exception.reason || 'The owner has reported no service on this date'

  // Newest first, top 10 - a stable sort like Python's sorted(). Reviews an admin hid are left out.
  const reviews = (await all('SELECT * FROM reviews WHERE bus_id = ? AND is_hidden = 0 ORDER BY created_at, id', bus.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
  const [owner, route, documents, timetable] = await Promise.all([
    userBriefById(bus.ownerId),
    byId('bus_routes', bus.routeId),
    all('SELECT * FROM bus_documents WHERE bus_id = ? ORDER BY uploaded_at, id', bus.id),
    timetableRows(stopageRows),
  ])

  return {
    ...busColumns(bus),
    owner,
    route: routeBrief(route),
    stopages: timetable,
    documents: documents.map(busDocumentOut),
    timetable,
    journey: {
      departureTime: first ? first.departureTime : null,
      arrivalTime: last ? last.arrivalTime : null,
      durationMinutes: duration,
      durationLabel: formatDuration(duration),
      totalDistanceKm: last ? Number(last.distanceFromStartKm) : 0,
    },
    availability: {
      date: dateOnly(travelDate),
      isRunning: scheduled && !exception,
      reason,
    },
    exceptions: upcoming.map(busExceptionOut),
    reviews: await Promise.all(reviews.map(reviewOut)),
  }
}

// ---------------------------------------------------------------- writes

/**
 * The bus's first trip (every bus has exactly one until the trips update), created when missing.
 * Its from / to stop and departure time follow the timetable.
 */
async function firstTrip(busId, stopIds, stopages) {
  const id = `t_${busId}`
  const now = Date.now()
  const shape = {
    fromStopId: stopIds[0] ?? null,
    toStopId: stopIds[stopIds.length - 1] ?? null,
    departsAt: stopages[0]?.departureTime ?? null,
  }
  if (await byId('bus_trips', id)) await update('bus_trips', id, { ...shape, updatedAt: now })
  else await insert('bus_trips', { id, busId, tripNumber: 1, ...shape, isActive: 1, createdAt: now, updatedAt: now })
  return id
}

/** Insert a bus timetable, in order (stop order 1..n), as the bus's first trip. */
export async function insertStopages(busId, stopages, stopIds) {
  const tripId = await firstTrip(busId, stopIds, stopages)
  for (const [index, s] of stopages.entries()) {
    await insert('bus_timetable', {
      id: newId(),
      tripId,
      busId,
      stopId: stopIds[index],
      stopOrder: index + 1,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      distanceFromStartKm: s.distanceKm,
    })
  }
}

/** Rewrites the timetable of a bus's first trip in order (its other trips stay as they are). */
export async function replaceStopages(busId, stopages, stopStatus = 'ACTIVE') {
  const stopIds = []
  for (const s of stopages) stopIds.push(await resolveStopId(s, stopStatus))
  await run('DELETE FROM bus_timetable WHERE trip_id = ?', `t_${busId}`)
  await insertStopages(busId, stopages, stopIds)
}

/** Owners must give the configured notice; admins may override it. Returns the BusException row. */
export async function addException(busId, { date, reason, enforceNotice }) {
  const offDay = parseDay(date)
  const daysAhead = Math.floor((offDay - todayMs()) / DAY_MS)

  if (daysAhead < 0) throw ApiError.badRequest('Pick a future date')
  if (enforceNotice && daysAhead < config.busExceptionMinDays) {
    throw ApiError.badRequest(`Non-operating dates must be reported at least ${config.busExceptionMinDays} days in advance`)
  }

  const existing = await get('SELECT * FROM bus_off_days WHERE bus_id = ? AND off_date = ?', busId, day(offDay))
  if (existing) {
    await update('bus_off_days', existing.id, { reason })
    return byId('bus_off_days', existing.id)
  }
  return insert('bus_off_days', { id: newId(), busId, offDate: offDay, reason, createdAt: Date.now() })
}

/** Average + count of a bus's reviews onto the bus row (updatedAt moves only when they change). */
export async function recomputeRating(bus) {
  const row = await get('SELECT AVG(rating) AS avg, COUNT(id) AS count FROM reviews WHERE bus_id = ?', bus.id)
  const ratingAverage = pyRound2(Number(row?.avg || 0))
  const ratingCount = Number(row?.count || 0)
  if (ratingAverage !== Number(bus.ratingAverage) || ratingCount !== bus.ratingCount) {
    await update('buses', bus.id, { ratingAverage, ratingCount, updatedAt: Date.now() })
  }
}

export async function assertOwnership(busId, userId) {
  const bus = await byId('buses', busId)
  if (!bus) throw ApiError.notFound('Bus not found')
  if (bus.ownerId !== userId) throw ApiError.forbidden('You can only manage your own buses')
  return bus
}

/** Free-text filter shared by the bus list endpoints: [sql, params]. */
export function searchFilter(term) {
  return [
    '(buses.bus_number LIKE ? OR buses.bus_name LIKE ? OR buses.operator LIKE ?)',
    [like(term.toUpperCase()), like(term), like(term)],
  ]
}

/** Number of buses per route id (any status). */
export async function busCountsByRoute(routeIds) {
  const out = new Map()
  if (!routeIds.length) return out
  for (const row of await all(
    `SELECT route_id AS id, COUNT(id) AS n FROM buses WHERE route_id IN (${placeholders(routeIds)}) GROUP BY route_id`,
    ...routeIds,
  )) {
    out.set(row.id, Number(row.n))
  }
  return out
}

export const countBusesOnRoute = async (routeId) => Number((await scalar('SELECT COUNT(id) FROM buses WHERE route_id = ?', routeId)) || 0)

