// Timetable-based bus position estimate.
//
// The backend has no GPS feed from buses, so "live" tracking is computed from
// the published timetable: at any clock time a bus is either waiting at a stop
// (between its arrival and departure there) or moving between two stops, in
// which case its position is interpolated along the straight line between
// them. The UI must label this as an *estimated* position.
//
// When a real GPS feed exists, replace `estimate()` with a call to it - the
// returned shape is what the map and tracking screens consume.

import { haversineKm, stopPoint } from './locationService'

export const toMinutes = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const minutesNow = (date = new Date()) => date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60

export function format12h(totalMinutes) {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  return `${String(h % 12 || 12).padStart(2, '0')}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/** Normalise a bus's timetable/stopages into ordered stops with times in minutes. */
export function normaliseStops(bus) {
  const list = bus?.timetable?.length ? bus.timetable : bus?.stopages || []
  return [...list]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((s) => {
      const arr = toMinutes(s.arrivalTime)
      const dep = toMinutes(s.departureTime) ?? arr
      return {
        id: s.stop?.id ?? s.stopId ?? s.id,
        name: s.stop?.name ?? s.stopName ?? 'Stop',
        point: stopPoint(s.stop),
        arr,
        dep: dep < arr ? arr : dep,
        arrivalTime12h: s.arrivalTime12h,
        departureTime12h: s.departureTime12h,
        distanceKm: s.distanceKm ?? 0,
      }
    })
}

/**
 * @returns {{
 *   status: 'NOT_RUNNING' | 'NOT_STARTED' | 'AT_STOP' | 'MOVING' | 'COMPLETED' | 'NO_DATA',
 *   point: {lat,lng} | null, heading: number | null,
 *   currentIndex: number, nextIndex: number | null,
 *   progress: number,           // 0..1 along the whole trip, by distance
 *   segmentProgress: number,    // 0..1 between currentIndex and nextIndex
 *   minutesToNext: number | null,
 *   label: string,
 *   stops: ReturnType<typeof normaliseStops>,
 * }}
 */
export function estimate(bus, { now = new Date(), isRunning = true } = {}) {
  const stops = normaliseStops(bus)
  const base = { stops, heading: null, nextIndex: null, minutesToNext: null, segmentProgress: 0 }

  if (stops.length < 2 || stops.some((s) => s.arr == null)) {
    return { ...base, status: 'NO_DATA', point: stops[0]?.point ?? null, currentIndex: 0, progress: 0, label: 'Timetable unavailable' }
  }
  const first = stops[0]
  const last = stops[stops.length - 1]
  const totalKm = last.distanceKm || 0
  const progressAt = (km) => (totalKm > 0 ? Math.min(1, Math.max(0, km / totalKm)) : 0)

  if (!isRunning) {
    return { ...base, status: 'NOT_RUNNING', point: first.point, currentIndex: 0, progress: 0, label: 'Not running today' }
  }

  const t = minutesNow(now)

  if (t < first.dep) {
    const wait = first.dep - t
    return {
      ...base,
      status: 'NOT_STARTED',
      point: first.point,
      currentIndex: 0,
      nextIndex: 1,
      minutesToNext: Math.ceil(wait),
      progress: 0,
      label: `Departs ${first.name} at ${format12h(first.dep)}`,
    }
  }

  if (t >= last.arr) {
    return { ...base, status: 'COMPLETED', point: last.point, currentIndex: stops.length - 1, progress: 1, label: `Reached ${last.name} at ${format12h(last.arr)}` }
  }

  for (let i = 0; i < stops.length - 1; i += 1) {
    const cur = stops[i]
    const nxt = stops[i + 1]

    if (t >= cur.arr && t < cur.dep) {
      return {
        ...base,
        status: 'AT_STOP',
        point: cur.point,
        currentIndex: i,
        nextIndex: i + 1,
        minutesToNext: Math.ceil(nxt.arr - t),
        progress: progressAt(cur.distanceKm),
        label: `At ${cur.name}, leaves ${format12h(cur.dep)}`,
      }
    }

    if (t >= cur.dep && t < nxt.arr) {
      const span = Math.max(1, nxt.arr - cur.dep)
      const f = (t - cur.dep) / span
      const point =
        cur.point && nxt.point
          ? { lat: cur.point.lat + (nxt.point.lat - cur.point.lat) * f, lng: cur.point.lng + (nxt.point.lng - cur.point.lng) * f }
          : cur.point || nxt.point
      const heading =
        cur.point && nxt.point ? (Math.atan2(nxt.point.lng - cur.point.lng, nxt.point.lat - cur.point.lat) * 180) / Math.PI : null
      return {
        ...base,
        status: 'MOVING',
        point,
        heading,
        currentIndex: i,
        nextIndex: i + 1,
        segmentProgress: f,
        minutesToNext: Math.max(0, Math.ceil(nxt.arr - t)),
        progress: progressAt(cur.distanceKm + (nxt.distanceKm - cur.distanceKm) * f),
        label: `Between ${cur.name} and ${nxt.name}`,
      }
    }
  }

  return { ...base, status: 'COMPLETED', point: last.point, currentIndex: stops.length - 1, progress: 1, label: 'Trip completed' }
}

/** Minutes until the bus reaches stop `stopId` (null if passed / unknown). */
export function minutesUntilStop(bus, stopId, now = new Date()) {
  const stop = normaliseStops(bus).find((s) => s.id === stopId)
  if (!stop) return null
  const diff = stop.arr - minutesNow(now)
  return diff >= 0 ? Math.ceil(diff) : null
}

/** Nearest stop on the bus's route to `origin` ({lat,lng}). */
export function nearestStopOnRoute(bus, origin) {
  let best = null
  for (const s of normaliseStops(bus)) {
    const d = haversineKm(origin, s.point)
    if (!best || d < best.distanceKm) best = { ...s, distanceKm: d }
  }
  return best
}

export const trackingService = { estimate, normaliseStops, minutesUntilStop, nearestStopOnRoute, toMinutes, format12h }
