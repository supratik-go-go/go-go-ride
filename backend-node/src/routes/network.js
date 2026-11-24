// Bus stops and routes - the network the timetables hang off (port of app/api/network.py).
import { Router } from 'express'
import { requireAdmin } from '../auth.js'
import { all, at, byId, insert, like, placeholders, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { routeStopOut, stopById, stopOut } from '../serialize.js'
import { busCountsByRoute, countBusesOnRoute } from '../services/buses.js'
import { logActivity } from '../services/common.js'
import { understandTrip } from '../services/voiceSearch.js'
import {
  enumOf,
  float,
  int,
  list,
  model,
  optional,
  pageParams,
  parseBody,
  pyFloat,
  pyRound2,
  q,
  raise,
  str,
  withDefault,
} from '../services/pydantic.js'
import { ENUMS } from '../validate.js'

const router = Router()

// Voice search: what the phone heard (its best guesses, most likely first), in English, Hindi or Bengali.
const VoiceTripBody = model({ heard: list(str({ min: 1, max: 200 }), { min: 1 }) })

// ---------------------------------------------------------------- request bodies (schemas/requests.py)

const StopBody = model({
  name: str({ min: 2, max: 80 }),
  area: optional(str({ max: 80 })),
  city: withDefault(str({ max: 80 }), 'Kolkata'),
  latitude: optional(float({ ge: -90, le: 90 })),
  longitude: optional(float({ ge: -180, le: 180 })),
  status: withDefault(enumOf(ENUMS.recordStatus), 'ACTIVE'),
})

const StopUpdateBody = model({
  name: optional(str({ min: 2, max: 80 })),
  area: optional(str()),
  city: optional(str()),
  latitude: optional(float({ ge: -90, le: 90 })),
  longitude: optional(float({ ge: -180, le: 180 })),
  status: optional(enumOf(ENUMS.recordStatus)),
})

const RouteStopBody = model({
  stopId: str(),
  distanceFromStartKm: withDefault(float(), 0),
})

const RouteBody = model({
  name: str({ min: 2, max: 120 }),
  routeNumber: str({ min: 1, max: 20, upper: true }),
  fromStopId: optional(str()),
  toStopId: optional(str()),
  distanceKm: withDefault(float({ ge: 0 }), 0),
  status: withDefault(enumOf(ENUMS.recordStatus), 'ACTIVE'),
  stops: optional(list(RouteStopBody)),
})

const RouteUpdateBody = model({
  name: optional(str()),
  routeNumber: optional(str()),
  fromStopId: optional(str()),
  toStopId: optional(str()),
  distanceKm: optional(float({ ge: 0 })),
  status: optional(enumOf(ENUMS.recordStatus)),
  stops: optional(list(RouteStopBody)),
})

// ---------------------------------------------------------------- helpers

/** Great-circle distance in kilometres (same formula as the Python service). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371
  const rad = (deg) => deg * (Math.PI / 180)
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const sLat = Math.sin(dLat / 2)
  const sLon = Math.sin(dLon / 2)
  const a = sLat * sLat + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * sLon * sLon
  return 2 * radius * Math.asin(Math.sqrt(a))
}

/** Per-stop counts of buses (busesAvailable; a bus out and back counts once) and route memberships (routes). */
async function stopCounts(stopIds) {
  const buses = new Map()
  const routes = new Map()
  if (!stopIds.length) return { buses, routes }
  const ph = placeholders(stopIds)
  for (const r of await all(`SELECT stop_id AS id, COUNT(DISTINCT bus_id) AS n FROM bus_timetable WHERE stop_id IN (${ph}) GROUP BY stop_id`, ...stopIds)) {
    buses.set(r.id, Number(r.n))
  }
  for (const r of await all(`SELECT stop_id AS id, COUNT(id) AS n FROM bus_route_stops WHERE stop_id IN (${ph}) GROUP BY stop_id`, ...stopIds)) {
    routes.set(r.id, Number(r.n))
  }
  return { buses, routes }
}

const stopColumns = (s) => ({
  id: s.id,
  name: s.name,
  area: s.area ?? null,
  city: s.city ?? null,
  latitude: s.latitude ?? null,
  longitude: s.longitude ?? null,
  status: s.status ?? null,
})

/** StopListItem: built from a dict without timestamps, so createdAt/updatedAt are null (as in Python). */
const stopListItem = (s, counts) => ({
  ...stopColumns(s),
  createdAt: null,
  updatedAt: null,
  busesAvailable: counts.buses.get(s.id) || 0,
  routes: counts.routes.get(s.id) || 0,
})

/**
 * RouteOut as the Python service returns it: _route_payload() carries no
 * fromStopId/toStopId/createdAt/updatedAt, so those serialise as null.
 */
async function routePayload(route, busCounts) {
  const count = busCounts ? busCounts.get(route.id) || 0 : await countBusesOnRoute(route.id)
  const [fromStop, toStop, stops] = await Promise.all([stopById(route.fromStopId), stopById(route.toStopId), routeStops(route.id)])
  return {
    id: route.id,
    name: route.name,
    routeNumber: route.routeNumber,
    distanceKm: route.distanceKm ?? null,
    status: route.status,
    fromStopId: null,
    toStopId: null,
    createdAt: null,
    updatedAt: null,
    fromStop,
    toStop,
    stops: await Promise.all(stops.map(routeStopOut)),
    totalBuses: count,
  }
}

const routeStops = (routeId) => all('SELECT * FROM bus_route_stops WHERE route_id = ? ORDER BY stop_order', routeId)

async function insertRouteStops(routeId, stops) {
  for (const [index, s] of stops.entries()) {
    await insert('bus_route_stops', { id: newId(), routeId, stopId: s.stopId, stopOrder: index + 1, distanceFromStartKm: s.distanceFromStartKm })
  }
}

/** UPDATE only the columns whose value changes; updatedAt moves only then. Returns true when written. */
async function writeChanges(table, row, values) {
  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => row[k] !== v))
  if (!Object.keys(changed).length) return false
  await update(table, row.id, { ...changed, updatedAt: Date.now() })
  return true
}

const provided = (body, keys) => Object.fromEntries(keys.filter((k) => body.$provided.has(k)).map((k) => [k, body[k]]))

// ---------------------------------------------------------------- stops

router.post('/stops/voice-trip', async (req, res) => {
  const b = parseBody(req, VoiceTripBody)
  ok(res, await understandTrip(b.heard))
})

router.get('/stops', async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const city = q(d, req.query, 'city', str())
  const status = q(d, req.query, 'status', enumOf(ENUMS.recordStatus))
  raise(d)

  const where = []
  const params = []
  if (page.search) {
    // A stop's second-language name is searched too.
    where.push('(name LIKE ? OR area LIKE ? OR other_name LIKE ?)')
    params.push(like(page.search), like(page.search), like(page.search))
  }
  if (city) {
    where.push('city = ?')
    params.push(city)
  }
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT COUNT(id) FROM bus_stops${clause}`, ...params)) || 0)
  const stops = await all(`SELECT * FROM bus_stops${clause} ORDER BY name, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  const counts = await stopCounts(stops.map((s) => s.id))
  okPage(res, stops.map((s) => stopListItem(s, counts)), total, page)
})

router.get('/stops/nearby', async (req, res) => {
  const d = []
  const lat = q(d, req.query, 'lat', float({ ge: -90, le: 90 }), { required: true })
  const lng = q(d, req.query, 'lng', float({ ge: -180, le: 180 }), { required: true })
  const radiusKm = q(d, req.query, 'radiusKm', float({ gt: 0, le: 50 }), { fallback: 3 })
  const limit = q(d, req.query, 'limit', int({ ge: 1, le: 50 }), { fallback: 20 })
  raise(d)

  const stops = await all('SELECT * FROM bus_stops WHERE status = ? AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at, id', 'ACTIVE')
  const counts = await stopCounts(stops.map((s) => s.id))

  let nearby = []
  for (const stop of stops) {
    const distance = pyRound2(haversineKm(lat, lng, stop.latitude, stop.longitude))
    if (distance > radiusKm) continue
    nearby.push({ ...stopListItem(stop, counts), distanceKm: distance })
  }
  nearby.sort((a, b) => a.distanceKm - b.distanceKm)
  nearby = nearby.slice(0, limit)
  // radiusKm is a float in Python, so it prints as "3.0".
  ok(res, nearby, `${nearby.length} stops within ${pyFloat(radiusKm)} km`)
})

router.get('/stops/:stopId', async (req, res) => {
  const stop = await byId('bus_stops', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')

  const stopages = await all('SELECT * FROM bus_timetable WHERE stop_id = ? ORDER BY departure_time, id', stop.id)
  const buses = []
  for (const s of stopages) {
    const bus = await byId('buses', s.busId)
    if (!bus || bus.status !== 'APPROVED') continue
    const route = await byId('bus_routes', bus.routeId)
    buses.push({
      id: bus.id,
      busNumber: bus.busNumber,
      busName: bus.busName ?? null,
      type: bus.isAc ? 'AC' : 'NON_AC',
      category: bus.category,
      fare: bus.fare,
      status: bus.status,
      ratingAvg: bus.ratingAverage,
      route: route ? { id: route.id, name: route.name, routeNumber: route.routeNumber } : null,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
    })
  }
  ok(res, { ...stopColumns(stop), buses })
})

router.post('/stops', requireAdmin, async (req, res) => {
  const b = parseBody(req, StopBody)
  const now = Date.now()
  const stop = await insert('bus_stops', {
    id: newId(),
    name: b.name,
    area: b.area,
    city: b.city,
    latitude: b.latitude,
    longitude: b.longitude,
    status: b.status,
    createdAt: now,
    updatedAt: now,
  })
  ok(res, stopOut(stop), 'Bus stop added', 201)
})

router.patch('/stops/:stopId', requireAdmin, async (req, res) => {
  const b = parseBody(req, StopUpdateBody)
  const stop = await byId('bus_stops', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')
  await writeChanges('bus_stops', stop, provided(b, ['name', 'area', 'city', 'latitude', 'longitude', 'status']))
  ok(res, await stopById(stop.id), 'Bus stop updated')
})

router.delete('/stops/:stopId', requireAdmin, async (req, res) => {
  const stop = await byId('bus_stops', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')
  // The Python ORM refuses to orphan timetable / route rows (it tries to null their
  // NOT NULL stopId), so a stop still in use is not deleted - no cascade here.
  const inUse =
    (await scalar('SELECT 1 FROM bus_timetable WHERE stop_id = ? LIMIT 1', stop.id)) ||
    (await scalar('SELECT 1 FROM bus_route_stops WHERE stop_id = ? LIMIT 1', stop.id))
  if (inUse) throw new ApiError(400, 'Could not save the record', 'DB_ERROR')
  await run('DELETE FROM bus_stops WHERE id = ?', stop.id)
  ok(res, null, 'Bus stop deleted')
})

// ---------------------------------------------------------------- routes

router.get('/routes', async (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const status = q(d, req.query, 'status', enumOf(ENUMS.recordStatus))
  raise(d)

  const where = []
  const params = []
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  if (page.search) {
    where.push('(name LIKE ? OR route_number LIKE ? OR other_name LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()), like(page.search))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number((await scalar(`SELECT COUNT(id) FROM bus_routes${clause}`, ...params)) || 0)
  const routes = await all(`SELECT * FROM bus_routes${clause} ORDER BY route_number, id LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  const counts = await busCountsByRoute(routes.map((r) => r.id))
  okPage(res, await Promise.all(routes.map((r) => routePayload(r, counts))), total, page)
})

router.get('/routes/popular', async (req, res) => {
  const d = []
  const limit = q(d, req.query, 'limit', int({ ge: 1, le: 20 }), { fallback: 6 })
  raise(d)

  const routes = await all('SELECT * FROM bus_routes WHERE status = ? ORDER BY created_at, id', 'ACTIVE')
  const counts = await busCountsByRoute(routes.map((r) => r.id))
  routes.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)) // stable, like Python's reverse sort

  const data = await Promise.all(routes.slice(0, limit).map(async (route) => {
    const stops = await routeStops(route.id)
    const first = stops.length ? (await byId('bus_stops', stops[0].stopId))?.name ?? null : null
    const last = stops.length ? (await byId('bus_stops', stops[stops.length - 1].stopId))?.name ?? null : null
    const fromStop = await byId('bus_stops', route.fromStopId)
    const toStop = await byId('bus_stops', route.toStopId)
    return {
      id: route.id,
      name: route.name,
      routeNumber: route.routeNumber,
      from: fromStop ? fromStop.name : first,
      to: toStop ? toStop.name : last,
      distanceKm: route.distanceKm,
      totalBuses: counts.get(route.id) || 0,
    }
  }))
  ok(res, data)
})

router.get('/routes/:routeId', async (req, res) => {
  const route = await byId('bus_routes', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')
  const payload = await routePayload(route)
  payload.buses = (await all('SELECT * FROM buses WHERE route_id = ? AND status = ? ORDER BY created_at, id', route.id, 'APPROVED')).map((b) => ({
    id: b.id,
    busNumber: b.busNumber,
    busName: b.busName ?? null,
    type: b.isAc ? 'AC' : 'NON_AC',
    category: b.category,
    fare: b.fare,
    ratingAvg: b.ratingAverage,
  }))
  ok(res, payload)
})

router.post('/routes', requireAdmin, async (req, res) => {
  const b = parseBody(req, RouteBody)
  const admin = req.user
  const routeId = await tx(async () => {
    const now = Date.now()
    const route = await insert('bus_routes', {
      id: newId(),
      name: b.name,
      routeNumber: b.routeNumber,
      fromStopId: b.fromStopId,
      toStopId: b.toStopId,
      distanceKm: b.distanceKm,
      status: b.status,
      createdAt: now,
      updatedAt: now,
    })
    await insertRouteStops(route.id, b.stops || [])
    await logActivity({
      actorId: admin.id,
      action: 'ROUTE_CREATED',
      entityType: 'ROUTE',
      entityId: route.id,
      message: `Route ${route.routeNumber} created (${route.name})`,
    })
    return route.id
  })
  ok(res, await routePayload(await byId('bus_routes', routeId)), 'Route created', 201)
})

router.patch('/routes/:routeId', requireAdmin, async (req, res) => {
  const b = parseBody(req, RouteUpdateBody)
  const route = await byId('bus_routes', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')

  await tx(async () => {
    await writeChanges('bus_routes', route, provided(b, ['name', 'routeNumber', 'fromStopId', 'toStopId', 'distanceKm', 'status']))
    if (b.stops !== null) {
      await run('DELETE FROM bus_route_stops WHERE route_id = ?', route.id)
      await insertRouteStops(route.id, b.stops)
    }
    const updated = await byId('bus_routes', route.id)
    await logActivity({
      actorId: req.user.id,
      action: 'ROUTE_UPDATED',
      entityType: 'ROUTE',
      entityId: route.id,
      message: `Route ${updated.routeNumber} updated (${updated.name})`,
    })
  })
  ok(res, await routePayload(await byId('bus_routes', route.id)), 'Route updated')
})

router.delete('/routes/:routeId', requireAdmin, async (req, res) => {
  const route = await byId('bus_routes', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')
  await tx(async () => {
    // Buses on the route are detached (routeId -> null), its stop list goes with it.
    await run('UPDATE buses SET route_id = NULL, updated_at = ? WHERE route_id = ?', at(Date.now()), route.id)
    await run('DELETE FROM bus_route_stops WHERE route_id = ?', route.id)
    await run('DELETE FROM bus_routes WHERE id = ?', route.id)
  })
  ok(res, null, 'Route deleted')
})

export default router
