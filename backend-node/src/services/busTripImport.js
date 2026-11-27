// The bigger bus sheet: a "Buses" tab (one row per bus) and a "Stops" tab (one row per stop of each
// trip). A bus that goes out and back has two trips; each trip's Stop Order starts again at 1.
// Times that are unknown ('--:--') or out of order are worked out from the stops around them and
// from how long that stretch of road takes the buses whose times are known, and saved marked as
// estimated so they can be checked later. A bus number with no letters (1, 2, 3...) only links
// the two tabs: those buses are saved without a bus number.
import { all, at, insertMany, run, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { newId } from '../ids.js'
import { to12h } from '../time.js'
import { readDays, text } from './busImport.js'
import { logActivity } from './common.js'

const MAX_BUSES = 2000
const CATEGORIES = ['NORMAL', 'SUPER_FAST', 'EXPRESS', 'DELUXE']

// Header text for each column. Matching is loose so a renamed header still works.
const BUS_COLUMNS = {
  busNumber: /bus\s*(number|no)/i,
  busName: /bus\s*name/i,
  type: /^\s*(type|ac)\b/i,
  category: /categor/i,
  operator: /operator/i,
  seats: /seat/i,
  fare: /fare/i,
  contact: /contact\s*(number|no)|phone|mobile/i,
  callFrom: /(contact|call)\s*from/i,
  callUntil: /(contact|call)\s*(to|until)/i,
  runsOn: /days|runs/i,
}
const STOP_COLUMNS = {
  busNumber: /bus\s*(number|no)/i,
  order: /order|sequence/i,
  stop: /stop\s*name/i,
  arrival: /arriv/i,
  departure: /depart/i,
  distance: /distance|\bkm\b/i,
}

const norm = (name) => text(name).toLowerCase().replace(/\s+/g, ' ')

// A header row names at least three of the columns (a help tab may mention one or two in its text).
const headerIndex = (data, columns) =>
  data.findIndex((r) => Object.values(columns).filter((re) => r.some((c) => re.test(text(c)))).length >= 3)

/** The rows of one tab as objects keyed as in `columns`, each with its Excel row number. */
function tableRows(data, columns) {
  const headerAt = headerIndex(data, columns)
  const header = data[headerAt].map(text)
  const index = Object.entries(columns).map(([key, re]) => [key, header.findIndex((h) => re.test(h))])
  const rows = []
  data.forEach((cells, i) => {
    if (i <= headerAt || !cells.some((c) => text(c))) return
    rows.push({ row: i + 1, ...Object.fromEntries(index.map(([key, col]) => [key, col < 0 ? null : cells[col]])) })
  })
  return rows
}

/** The Buses and Stops tabs, or null when the workbook is the one-row-per-bus sheet. */
export function readTripSheets(sheets) {
  const stops = sheets.find((s) => headerIndex(s.data, STOP_COLUMNS) >= 0 && s.data.some((r) => r.some((c) => /stop\s*order/i.test(text(c)))))
  if (!stops) return null
  const buses = sheets.find((s) => s !== stops && headerIndex(s.data, BUS_COLUMNS) >= 0)
  if (!buses) throw ApiError.badRequest('The sheet has a Stops tab but no Buses tab.')
  const busRows = tableRows(buses.data, BUS_COLUMNS)
  if (busRows.length > MAX_BUSES) throw ApiError.badRequest(`Please import at most ${MAX_BUSES} buses at a time.`)
  return { trips: true, buses: busRows, stops: tableRows(stops.data, STOP_COLUMNS) }
}

// ---------------------------------------------------------------- times

const UNKNOWN = /^[-–—:.\s]*$|^(na|n\/a|unknown|\?+)$/i

/** Minutes after midnight; null when unknown ('--:--', blank); undefined when it can't be read. */
function minutesOf(value) {
  if (value instanceof Date) return value.getUTCHours() * 60 + value.getUTCMinutes()
  if (typeof value === 'number') return value >= 0 && value < 1 ? Math.round(value * 1440) % 1440 : undefined
  let t = text(value)
  if (UNKNOWN.test(t)) return null
  // "10:30/10:35 AM", "8:55–9:00 AM", "7:30 AM (Approx)": the first time, with the AM/PM at the end.
  t = t.replace(/\(.*?\)/g, '').trim()
  const suffix = t.match(/[ap]\.?\s*m\.?$/i)?.[0] ?? ''
  t = t.split(/\s*(?:\/|–|—|\bto\b|-(?=\s*\d))\s*/i)[0]
  if (!/[ap]\.?\s*m\.?$/i.test(t)) t = `${t} ${suffix}`.trim()
  const m = t.match(/^(\d{1,2})\s*[:.]\s*(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?$/i)
  if (!m) return undefined
  let hour = Number(m[1])
  const minute = Number(m[2])
  if (m[3]) {
    if (hour < 1 || hour > 12) return undefined
    hour = (hour % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0)
  }
  return hour > 23 || minute > 59 ? undefined : hour * 60 + minute
}

const clock = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const median = (list) => {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Indexes of the longest run of times that never goes back, so one wrong time doesn't spoil the rest. */
function inOrder(points) {
  if (!points.length) return new Set()
  const len = points.map(() => 1)
  const prev = points.map(() => -1)
  for (let a = 0; a < points.length; a++) {
    for (let b = 0; b < a; b++) {
      if (points[b].t <= points[a].t && len[b] + 1 > len[a]) {
        len[a] = len[b] + 1
        prev[a] = b
      }
    }
  }
  // Of equally long runs, the one ending earliest: a slip usually makes a time too late (AM written as PM).
  let end = 0
  for (let a = 1; a < points.length; a++) if (len[a] > len[end] || (len[a] === len[end] && points[a].t < points[end].t)) end = a
  const keep = new Set()
  for (let k = end; k >= 0; k = prev[k]) keep.add(points[k].i)
  return keep
}

/**
 * First pass over one trip: read the times, carry them past midnight, drop the ones out of order.
 * Each stop gets `t` (minutes, may pass 1440) when its time is kept.
 */
function readTrip(trip, warn) {
  let offset = 0
  let last = null
  const points = []
  trip.stops.forEach((s, i) => {
    for (const [raw, key] of [[s.arrivalRaw, 'arrival'], [s.departureRaw, 'departure']]) {
      const m = minutesOf(raw)
      if (m === undefined) warn(`Trip ${trip.number}: can't read the ${key} time "${text(raw)}" at ${s.name}, worked it out instead`)
      s[key] = m ?? null
    }
    const t = s.arrival ?? s.departure
    if (t === null) return
    // A drop of more than 12 hours means the trip ran past midnight.
    if (last !== null && t + offset < last - 720) offset += 1440
    last = t + offset
    points.push({ i, t: last })
  })
  const keep = inOrder(points)
  for (const p of points) {
    if (keep.has(p.i)) trip.stops[p.i].t = p.t
    else warn(`Trip ${trip.number}: ${trip.stops[p.i].name} ${to12h(clock(p.t))} is out of order, worked it out again`)
  }
}

/** Second pass: fill every stop without a kept time, then write the HH:MM times. */
function fillTrip(trip, gap, warn) {
  const stops = trip.stops
  const given = stops.map((s) => s.t !== undefined)
  const known = stops.map((s, i) => (given[i] ? i : -1)).filter((i) => i >= 0)
  const stretch = (i) => gap(stops[i].name, stops[i + 1].name)

  // Between two known stops: share the time out by how long each stretch usually takes.
  for (let k = 0; k + 1 < known.length; k++) {
    const [a, b] = [known[k], known[k + 1]]
    if (b - a < 2) continue
    const usual = []
    for (let i = a; i < b; i++) usual.push(stretch(i))
    const weights = usual.every((u) => u !== null) && usual.some((u) => u > 0) ? usual : usual.map(() => 1)
    const total = weights.reduce((x, y) => x + y, 0)
    let sum = 0
    for (let i = a + 1; i < b; i++) {
      sum += weights[i - a - 1]
      stops[i].t = stops[a].t + ((stops[b].t - stops[a].t) * sum) / total
    }
  }
  // Before the first and after the last known stop: add the usual stretch times.
  for (let i = known[0] - 1; i >= 0; i--) stops[i].t = stops[i + 1].t - (stretch(i) ?? gap())
  for (let i = known.at(-1) + 1; i < stops.length; i++) stops[i].t = stops[i - 1].t + (stretch(i - 1) ?? gap())

  let estimated = 0
  for (const [i, s] of stops.entries()) {
    s.estimated = !given[i]
    if (s.estimated) {
      estimated += 1
      s.arrival = s.departure = s.t
    } else {
      s.arrival ??= s.departure
      s.departure ??= s.arrival
    }
    s.arrival = clock(s.arrival)
    s.departure = clock(s.departure)
    s.time = s.departure
  }
  if (estimated) warn(`Trip ${trip.number}: ${estimated} of ${stops.length} times worked out`)
}

// ---------------------------------------------------------------- plan

/** What would happen to each bus. Nothing is written. */
export async function planTripImport(sheet) {
  // Every stop and bus the database already has, read once.
  const stopsByName = new Map()
  const stops = await all("SELECT id, name, other_name, status FROM bus_stops ORDER BY status = 'ACTIVE' DESC, created_at, id")
  for (const s of stops) {
    if (!stopsByName.has(norm(s.name))) stopsByName.set(norm(s.name), s)
  }
  // Other names (e.g. a stop joined to another with "Same place") find the stop too, after real names.
  for (const s of stops) {
    for (const other of String(s.otherName || '').split(',')) {
      if (other.trim() && !stopsByName.has(norm(other))) stopsByName.set(norm(other), s)
    }
  }
  const numbered = new Map((await all('SELECT id, bus_number FROM buses WHERE bus_number IS NOT NULL')).map((b) => [b.busNumber, b.id]))
  const unnumbered = new Map()
  for (const b of await all(
    'SELECT b.id, b.bus_name, r.from_stop_id, r.departs_at FROM buses b JOIN bus_trips r ON r.bus_id = b.id AND r.trip_number = 1 WHERE b.bus_number IS NULL',
  )) {
    unnumbered.set(`${norm(b.busName)}|${b.fromStopId}|${b.departsAt}`, b.id)
  }

  // A new stop typed in several ways ("khatra", "Khatra") is saved once, with a capital if any spelling has one.
  const spellings = new Map()
  for (const r of sheet.stops) {
    const name = text(r.stop).replace(/\s+/g, ' ')
    if (!name) continue
    const counts = spellings.get(norm(name)) ?? new Map()
    counts.set(name, (counts.get(name) ?? 0) + 1)
    spellings.set(norm(name), counts)
  }
  const spelling = (key) => {
    const ranked = [...spellings.get(key)].sort((a, b) => Number(/^\p{Lu}/u.test(b[0])) - Number(/^\p{Lu}/u.test(a[0])) || b[1] - a[1])
    const name = ranked[0][0]
    return name.charAt(0).toLocaleUpperCase() + name.slice(1)
  }

  // Stop rows grouped by the bus key, in sheet order, split into trips where the order starts again.
  const key = (v) => text(v).toUpperCase().replace(/\s+/g, ' ')
  const tripsOf = new Map()
  for (const r of sheet.stops) {
    const k = key(r.busNumber)
    const name = text(r.stop).replace(/\s+/g, ' ')
    if (!k || !name) continue
    const order = Number(text(r.order))
    const trips = tripsOf.get(k) ?? []
    const trip = trips.at(-1)
    if (!trip || order === 1 || (Number.isFinite(order) && order <= trip.lastOrder)) trips.push({ number: trips.length + 1, stops: [], lastOrder: order })
    const current = trips.at(-1)
    const known = stopsByName.get(norm(name))
    current.stops.push({
      name: known?.name ?? spelling(norm(name)),
      stopId: known?.id ?? null,
      stopStatus: known?.status ?? null,
      arrivalRaw: r.arrival,
      departureRaw: r.departure,
      distanceKm: Number(text(r.distance)) || 0,
    })
    current.lastOrder = order
    tripsOf.set(k, trips)
  }

  // Pass 1 on every trip, then the usual minutes for each stretch of road from all kept times.
  const warnings = new Map()
  const warner = (k) => (message) => warnings.set(k, [...(warnings.get(k) ?? []), message])
  for (const [k, trips] of tripsOf) for (const trip of trips) if (trip.stops.length > 1) readTrip(trip, warner(k))
  const stretches = new Map()
  const allStretches = []
  const pair = (a, b) => [norm(a), norm(b)].sort().join('|')
  for (const trips of tripsOf.values()) {
    for (const trip of trips) {
      trip.stops.forEach((s, i) => {
        const next = trip.stops[i + 1]
        if (s.t === undefined || next?.t === undefined) return
        const minutes = next.t - s.t
        if (minutes < 0 || minutes > 360) return
        stretches.set(pair(s.name, next.name), [...(stretches.get(pair(s.name, next.name)) ?? []), minutes])
        allStretches.push(minutes)
      })
    }
  }
  const usual = new Map([...stretches].map(([k, list]) => [k, median(list)]))
  const fallback = median(allStretches) ?? 10
  const gap = (a, b) => (a === undefined ? fallback : (usual.get(pair(a, b)) ?? null))

  const plan = []
  const seen = new Map()
  for (const r of sheet.buses) {
    const errors = []
    const k = key(r.busNumber)
    const warn = warner(k)
    // Registration numbers have letters; a plain 1, 2, 3 only links the Buses and Stops tabs.
    const busNumber = /[A-Z]/.test(k) ? k : null
    if (busNumber && !/^[A-Z0-9 -]{4,20}$/.test(busNumber)) errors.push('Bus number should be 4 to 20 letters and numbers')
    if (!k) errors.push('Bus number (or a row number like 1, 2, 3) is missing: it links the bus to its stops')
    else if (seen.has(`n:${k}`)) errors.push(`Row ${seen.get(`n:${k}`)} has the same bus number`)
    seen.set(`n:${k}`, r.row)

    const busName = text(r.busName) || null
    if (!busName && !busNumber) errors.push('Bus name is missing')

    const fareText = text(r.fare).replace(/^(rs\.?|₹)\s*/i, '')
    const fare = fareText === '' ? null : Number(fareText)
    if (fare !== null && !(fare >= 0)) errors.push('Fare must be a number')
    const contact = text(r.contact).replace(/[^\d+]/g, '')
    if (contact && (contact.replace(/\D/g, '').length < 6 || contact.length > 15)) errors.push('Contact number looks wrong')
    const days = readDays(r.runsOn)
    if (!days) errors.push('Service days should be Daily, Mon-Sat, or days like MON,TUE,WED')
    const seats = Number(text(r.seats))
    const callFrom = minutesOf(r.callFrom)
    const callUntil = minutesOf(r.callUntil)
    const category = text(r.category).toUpperCase().replace(/[\s-]+/g, '_')

    const trips = []
    for (const trip of tripsOf.get(k) ?? []) {
      if (trip.stops.length < 2) warn(`Trip ${trip.number} has only one stop, left out`)
      else if (!trip.stops.some((s) => s.t !== undefined)) warn(`Trip ${trip.number} has no times, left out`)
      else {
        fillTrip(trip, gap, warn)
        trips.push(trip)
      }
    }
    if (k && !tripsOf.has(k)) errors.push('No stops for this bus on the Stops tab')
    else if (k && !trips.length) errors.push('No trip has at least 2 stops and a known time')

    const first = trips[0]?.stops[0]
    const sameBus = first ? `${norm(busName)}|${norm(first.name)}|${first.departure}` : null
    if (!busNumber && sameBus && seen.has(sameBus)) errors.push(`Same bus as row ${seen.get(sameBus)} (same name, first stop and time)`)
    if (sameBus) seen.set(sameBus, r.row)
    const existingId = busNumber
      ? (numbered.get(busNumber) ?? null)
      : first?.stopId
        ? (unnumbered.get(`${norm(busName)}|${first.stopId}|${first.departure}`) ?? null)
        : null

    plan.push({
      row: r.row,
      busNumber,
      busName,
      ac: /^(ac|yes|y|true|1)$/i.test(text(r.type)),
      category: CATEGORIES.includes(category) ? category : 'NORMAL',
      operator: text(r.operator) || null,
      seats: Number.isInteger(seats) && seats > 0 ? seats : 0,
      fare,
      contact: contact || null,
      callFrom: callFrom == null ? '06:00' : clock(callFrom),
      callUntil: callUntil == null ? '22:00' : clock(callUntil),
      days,
      trips: trips.map((t) => ({ number: t.number, stops: t.stops })),
      stops: trips[0]?.stops ?? [],
      estimated: trips.reduce((n, t) => n + t.stops.filter((s) => s.estimated).length, 0),
      warnings: warnings.get(k) ?? [],
      action: errors.length ? 'error' : existingId ? 'update' : 'create',
      existingId,
      errors,
    })
  }
  return plan
}

// ---------------------------------------------------------------- apply

/** Write every bus without errors, with all its trips. `publish` makes new buses live straight away. */
export async function applyTripImport(ready, admin, { publish }) {
  const now = Date.now()
  let created = 0
  let updated = 0
  await tx(async () => {
    // New stops once each; stops a passenger suggested earlier become confirmed.
    const stopIds = new Map()
    const newStops = []
    const confirm = new Set()
    for (const p of ready) {
      for (const t of p.trips) {
        for (const s of t.stops) {
          if (s.stopId) {
            stopIds.set(norm(s.name), s.stopId)
            if (s.stopStatus !== 'ACTIVE') confirm.add(s.stopId)
          } else if (!stopIds.has(norm(s.name))) {
            const id = newId()
            stopIds.set(norm(s.name), id)
            newStops.push({ id, name: s.name, area: null, city: 'Kolkata', latitude: null, longitude: null, status: 'ACTIVE', createdAt: now, updatedAt: now })
          }
        }
      }
    }
    await insertMany('bus_stops', newStops)
    if (confirm.size) await run(`UPDATE bus_stops SET status = 'ACTIVE', updated_at = ? WHERE id IN (${[...confirm].map(() => '?').join(', ')})`, at(now), ...confirm)

    const buses = []
    const trips = []
    const timetable = []
    for (const p of ready) {
      const busId = p.existingId ?? newId()
      const fields = {
        busNumber: p.busNumber,
        busName: p.busName,
        isAc: p.ac ? 1 : 0,
        category: p.category,
        operator: p.operator,
        totalSeats: p.seats,
        fare: p.fare,
        contactNumber: p.contact,
        callFrom: p.callFrom,
        callUntil: p.callUntil,
        runsOn: p.days.join(','),
        updatedAt: now,
      }
      if (p.action === 'update') {
        await update('buses', busId, fields)
        await run('DELETE FROM bus_timetable WHERE bus_id = ?', busId)
        // Trip ids stay the same (alarms point at them); trips the sheet no longer has are switched off.
        await run('UPDATE bus_trips SET is_active = 0, updated_at = ? WHERE bus_id = ? AND trip_number > ?', at(now), busId, p.trips.length)
        updated += 1
      } else {
        buses.push({
          id: busId,
          ...fields,
          ownerId: admin.id,
          routeId: null,
          pictureUrl: null,
          status: publish ? 'APPROVED' : 'PENDING',
          rejectionReason: null,
          ratingAverage: 0,
          ratingCount: 0,
          submittedAt: now,
          reviewedAt: publish ? now : null,
          reviewedBy: publish ? admin.id : null,
          createdAt: now,
        })
        created += 1
      }
      p.trips.forEach((trip, i) => {
        const tripId = i === 0 ? `t_${busId}` : `t${i + 1}_${busId}`
        const ids = trip.stops.map((s) => stopIds.get(norm(s.name)))
        trips.push({
          id: tripId,
          busId,
          tripNumber: i + 1,
          fromStopId: ids[0],
          toStopId: ids.at(-1),
          departsAt: trip.stops[0].departure,
          runsOn: null,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        trip.stops.forEach((s, n) =>
          timetable.push({
            id: newId(),
            tripId,
            busId,
            stopId: ids[n],
            stopOrder: n + 1,
            arrivalTime: s.arrival,
            departureTime: s.departure,
            isEstimated: s.estimated ? 1 : 0,
            distanceFromStartKm: s.distanceKm,
          }),
        )
      })
    }
    await insertMany('buses', buses)
    await insertMany('bus_trips', trips, { refresh: ['from_stop_id', 'to_stop_id', 'departs_at', 'is_active', 'updated_at'] })
    await insertMany('bus_timetable', timetable)
    await logActivity({
      actorId: admin.id,
      action: 'BUSES_IMPORTED',
      entityType: 'BUS',
      entityId: null,
      message: `${admin.name} imported buses from Excel: ${created} added, ${updated} updated`,
    })
  })
  return { created, updated }
}
