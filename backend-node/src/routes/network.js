// Bus stops and routes - the network the timetables hang off (port of app/api/network.py).
import { Router } from 'express'
import { requireAdmin } from '../auth.js'
import { all, byId, insert, like, placeholders, run, scalar, tx } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { routeStopOut, stopById, stopOut } from '../serialize.js'
import { busCountsByRoute, countBusesOnRoute } from '../services/buses.js'
import { logActivity } from '../services/common.js'
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

/** Per-stop counts of timetable rows (busesAvailable) and route memberships (routes). */
function stopCounts(stopIds) {
  const buses = new Map()
  const routes = new Map()
  if (!stopIds.length) return { buses, routes }
  const ph = placeholders(stopIds)
  for (const r of all(`SELECT "stopId" AS id, COUNT(id) AS n FROM "BusStopage" WHERE "stopId" IN (${ph}) GROUP BY "stopId"`, ...stopIds)) {
    buses.set(r.id, Number(r.n))
  }
  for (const r of all(`SELECT "stopId" AS id, COUNT(id) AS n FROM "RouteStop" WHERE "stopId" IN (${ph}) GROUP BY "stopId"`, ...stopIds)) {
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
function routePayload(route, busCounts) {
  const count = busCounts ? busCounts.get(route.id) || 0 : countBusesOnRoute(route.id)
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
    fromStop: stopById(route.fromStopId),
    toStop: stopById(route.toStopId),
    stops: routeStops(route.id).map(routeStopOut),
    totalBuses: count,
  }
}

const routeStops = (routeId) => all('SELECT * FROM "RouteStop" WHERE "routeId" = ? ORDER BY sequence', routeId)

function insertRouteStops(routeId, stops) {
  stops.forEach((s, index) => {
    insert('RouteStop', { id: newId(), routeId, stopId: s.stopId, sequence: index + 1, distanceFromStartKm: s.distanceFromStartKm })
  })
}

/** UPDATE only the columns whose value changes; updatedAt moves only then. Returns true when written. */
function writeChanges(table, row, values) {
  const keys = Object.keys(values).filter((k) => row[k] !== values[k])
  if (!keys.length) return false
  run(
    `UPDATE "${table}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')}, "updatedAt" = ? WHERE id = ?`,
    ...keys.map((k) => values[k]),
    Date.now(),
    row.id,
  )
  return true
}

const provided = (body, keys) => Object.fromEntries(keys.filter((k) => body.$provided.has(k)).map((k) => [k, body[k]]))

// ---------------------------------------------------------------- stops

router.get('/stops', (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const city = q(d, req.query, 'city', str())
  const status = q(d, req.query, 'status', enumOf(ENUMS.recordStatus))
  raise(d)

  const where = []
  const params = []
  if (page.search) {
    where.push('("BusStop".name LIKE ? OR "BusStop".area LIKE ?)')
    params.push(like(page.search), like(page.search))
  }
  if (city) {
    where.push('"BusStop".city = ?')
    params.push(city)
  }
  if (status) {
    where.push('"BusStop".status = ?')
    params.push(status)
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number(scalar(`SELECT COUNT("BusStop".id) FROM "BusStop"${clause}`, ...params) || 0)
  const stops = all(`SELECT * FROM "BusStop"${clause} ORDER BY "BusStop".name LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  const counts = stopCounts(stops.map((s) => s.id))
  okPage(res, stops.map((s) => stopListItem(s, counts)), total, page)
})

router.get('/stops/nearby', (req, res) => {
  const d = []
  const lat = q(d, req.query, 'lat', float({ ge: -90, le: 90 }), { required: true })
  const lng = q(d, req.query, 'lng', float({ ge: -180, le: 180 }), { required: true })
  const radiusKm = q(d, req.query, 'radiusKm', float({ gt: 0, le: 50 }), { fallback: 3 })
  const limit = q(d, req.query, 'limit', int({ ge: 1, le: 50 }), { fallback: 20 })
  raise(d)

  const stops = all('SELECT * FROM "BusStop" WHERE "BusStop".status = ? AND "BusStop".latitude IS NOT NULL AND "BusStop".longitude IS NOT NULL', 'ACTIVE')
  const counts = stopCounts(stops.map((s) => s.id))

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

router.get('/stops/:stopId', (req, res) => {
  const stop = byId('BusStop', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')

  const stopages = all('SELECT * FROM "BusStopage" WHERE "BusStopage"."stopId" = ? ORDER BY "BusStopage"."departureTime"', stop.id)
  const buses = []
  for (const s of stopages) {
    const bus = byId('Bus', s.busId)
    if (!bus || bus.status !== 'APPROVED') continue
    const route = byId('Route', bus.routeId)
    buses.push({
      id: bus.id,
      busNumber: bus.busNumber,
      busName: bus.busName ?? null,
      type: bus.type,
      category: bus.category,
      fare: bus.fare,
      status: bus.status,
      ratingAvg: bus.ratingAvg,
      route: route ? { id: route.id, name: route.name, routeNumber: route.routeNumber } : null,
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
    })
  }
  ok(res, { ...stopColumns(stop), buses })
})

router.post('/stops', requireAdmin, (req, res) => {
  const b = parseBody(req, StopBody)
  const now = Date.now()
  const stop = insert('BusStop', {
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

router.patch('/stops/:stopId', requireAdmin, (req, res) => {
  const b = parseBody(req, StopUpdateBody)
  const stop = byId('BusStop', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')
  writeChanges('BusStop', stop, provided(b, ['name', 'area', 'city', 'latitude', 'longitude', 'status']))
  ok(res, stopById(stop.id), 'Bus stop updated')
})

router.delete('/stops/:stopId', requireAdmin, (req, res) => {
  const stop = byId('BusStop', req.params.stopId)
  if (!stop) throw ApiError.notFound('Bus stop not found')
  // The Python ORM refuses to orphan timetable / route rows (it tries to null their
  // NOT NULL stopId), so a stop still in use is not deleted - no cascade here.
  const inUse =
    scalar('SELECT 1 FROM "BusStopage" WHERE "stopId" = ? LIMIT 1', stop.id) || scalar('SELECT 1 FROM "RouteStop" WHERE "stopId" = ? LIMIT 1', stop.id)
  if (inUse) throw new ApiError(400, 'Could not save the record', 'DB_ERROR')
  run('DELETE FROM "BusStop" WHERE id = ?', stop.id)
  ok(res, null, 'Bus stop deleted')
})

// ---------------------------------------------------------------- routes

router.get('/routes', (req, res) => {
  const d = []
  const page = pageParams(d, req.query)
  const status = q(d, req.query, 'status', enumOf(ENUMS.recordStatus))
  raise(d)

  const where = []
  const params = []
  if (status) {
    where.push('"Route".status = ?')
    params.push(status)
  }
  if (page.search) {
    where.push('("Route".name LIKE ? OR "Route"."routeNumber" LIKE ?)')
    params.push(like(page.search), like(page.search.toUpperCase()))
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const total = Number(scalar(`SELECT COUNT("Route".id) FROM "Route"${clause}`, ...params) || 0)
  const routes = all(`SELECT * FROM "Route"${clause} ORDER BY "Route"."routeNumber" LIMIT ? OFFSET ?`, ...params, page.limit, page.skip)
  const counts = busCountsByRoute(routes.map((r) => r.id))
  okPage(res, routes.map((r) => routePayload(r, counts)), total, page)
})

router.get('/routes/popular', (req, res) => {
  const d = []
  const limit = q(d, req.query, 'limit', int({ ge: 1, le: 20 }), { fallback: 6 })
  raise(d)

  const routes = all('SELECT * FROM "Route" WHERE "Route".status = ?', 'ACTIVE')
  const counts = busCountsByRoute(routes.map((r) => r.id))
  routes.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)) // stable, like Python's reverse sort

  const data = routes.slice(0, limit).map((route) => {
    const stops = routeStops(route.id)
    const first = stops.length ? byId('BusStop', stops[0].stopId)?.name ?? null : null
    const last = stops.length ? byId('BusStop', stops[stops.length - 1].stopId)?.name ?? null : null
    const fromStop = byId('BusStop', route.fromStopId)
    const toStop = byId('BusStop', route.toStopId)
    return {
      id: route.id,
      name: route.name,
      routeNumber: route.routeNumber,
      from: fromStop ? fromStop.name : first,
      to: toStop ? toStop.name : last,
      distanceKm: route.distanceKm,
      totalBuses: counts.get(route.id) || 0,
    }
  })
  ok(res, data)
})

router.get('/routes/:routeId', (req, res) => {
  const route = byId('Route', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')
  const payload = routePayload(route)
  payload.buses = all('SELECT * FROM "Bus" WHERE "Bus"."routeId" = ? AND "Bus".status = ?', route.id, 'APPROVED').map((b) => ({
    id: b.id,
    busNumber: b.busNumber,
    busName: b.busName ?? null,
    type: b.type,
    category: b.category,
    fare: b.fare,
    ratingAvg: b.ratingAvg,
  }))
  ok(res, payload)
})

router.post('/routes', requireAdmin, (req, res) => {
  const b = parseBody(req, RouteBody)
  const admin = req.user
  const routeId = tx(() => {
    const now = Date.now()
    const route = insert('Route', {
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
    insertRouteStops(route.id, b.stops || [])
    logActivity({
      actorId: admin.id,
      action: 'ROUTE_CREATED',
      entityType: 'ROUTE',
      entityId: route.id,
      message: `Route ${route.routeNumber} created (${route.name})`,
    })
    return route.id
  })
  ok(res, routePayload(byId('Route', routeId)), 'Route created', 201)
})

router.patch('/routes/:routeId', requireAdmin, (req, res) => {
  const b = parseBody(req, RouteUpdateBody)
  const route = byId('Route', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')

  tx(() => {
    writeChanges('Route', route, provided(b, ['name', 'routeNumber', 'fromStopId', 'toStopId', 'distanceKm', 'status']))
    if (b.stops !== null) {
      run('DELETE FROM "RouteStop" WHERE "routeId" = ?', route.id)
      insertRouteStops(route.id, b.stops)
    }
    const updated = byId('Route', route.id)
    logActivity({
      actorId: req.user.id,
      action: 'ROUTE_UPDATED',
      entityType: 'ROUTE',
      entityId: route.id,
      message: `Route ${updated.routeNumber} updated (${updated.name})`,
    })
  })
  ok(res, routePayload(byId('Route', route.id)), 'Route updated')
})

router.delete('/routes/:routeId', requireAdmin, (req, res) => {
  const route = byId('Route', req.params.routeId)
  if (!route) throw ApiError.notFound('Route not found')
  tx(() => {
    // Buses on the route are detached (routeId -> null), its stop list goes with it.
    run('UPDATE "Bus" SET "routeId" = NULL, "updatedAt" = ? WHERE "routeId" = ?', Date.now(), route.id)
    run('DELETE FROM "RouteStop" WHERE "routeId" = ?', route.id)
    run('DELETE FROM "Route" WHERE id = ?', route.id)
  })
  ok(res, null, 'Route deleted')
})

export default router
