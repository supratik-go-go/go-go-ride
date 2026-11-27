// Buses from the owner's Excel sheet (docs/bus-import-template.xlsx): one row per bus, all its
// stops and times in one cell. Rows are checked first and shown to the admin, then imported.
// The bigger sheet with Buses and Stops tabs (and two trips per bus) is read by busTripImport.js.
import readXlsxFile from 'read-excel-file/node'
import { at, get, insert, run, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { newId } from '../ids.js'
import { haversineKm } from '../routes/network.js'
import { getSettingsRow } from '../routes/platform.js'
import { logActivity } from './common.js'
import { insertStopages, OTHER_NAME_IS } from './buses.js'
import { applyTripImport, planTripImport, readTripSheets } from './busTripImport.js'

const MAX_ROWS = 500
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Header text the sheet may use for each column. Matching is loose so a renamed header still works.
const COLUMNS = {
  busNumber: /bus\s*(number|no)/i,
  busName: /bus\s*name/i,
  ac: /^\s*ac\b/i,
  fare: /fare/i,
  contact: /contact/i,
  runsOn: /runs|days/i,
  stops: /stops?/i,
}

export const text = (v) => (v === null || v === undefined ? '' : String(v).trim())

export function readDays(raw) {
  const value = text(raw).toUpperCase().replace(/\s+/g, '')
  if (!value || value === 'DAILY' || value === 'EVERYDAY') return DAYS
  const days = []
  for (const part of value.split(/[,/]+/).filter(Boolean)) {
    const [from, to] = part.split('-').map((d) => DAYS.indexOf(d.slice(0, 3)))
    if (from < 0 || (part.includes('-') && to < 0)) return null
    if (!part.includes('-')) days.push(DAYS[from])
    else for (let i = from; ; i = (i + 1) % 7) {
      days.push(DAYS[i])
      if (i === to) break
    }
  }
  return [...new Set(days)]
}

/** "Howrah Station 07:00, Esplanade 7.35 pm" -> [{ name, time: '07:00' }, ...] or an error message. */
function readStops(raw) {
  const parts = text(raw).split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return { error: 'Needs at least 2 stops, each with a time' }
  const stops = []
  for (const part of parts) {
    const m = part.match(/^(.*?)[\s\-–@]*(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i)
    if (!m || m[1].trim().length < 2) return { error: `Can't read "${part}". Write the stop name, then the time, like "Esplanade 07:35"` }
    let hour = Number(m[2])
    const minute = Number(m[3])
    if (m[4]) hour = (hour % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0)
    if (hour > 23 || minute > 59) return { error: `"${part}" has an impossible time` }
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const previous = stops[stops.length - 1]
    if (previous && time < previous.time) return { error: `Times must go forward: ${previous.name} ${previous.time} comes before ${m[1].trim()} ${time}` }
    stops.push({ name: m[1].trim().replace(/\s+/g, ' '), time })
  }
  const names = stops.map((s) => s.name.toLowerCase())
  if (new Set(names).size !== names.length) return { error: 'The same stop appears twice' }
  return { stops }
}

// The collation compares without case, so "esplanade" finds "Esplanade".
// A known other name (a stop joined to another with "Same place") finds that stop too.
const findStop = async (name) =>
  (await get(`SELECT id, name, latitude, longitude FROM bus_stops WHERE name = ? ORDER BY status = 'ACTIVE' DESC, created_at, id LIMIT 1`, name)) ||
  get(`SELECT s.id, s.name, s.latitude, s.longitude FROM bus_stops s WHERE ${OTHER_NAME_IS} ORDER BY s.status = 'ACTIVE' DESC, s.created_at, s.id LIMIT 1`, name)

/**
 * Read the uploaded workbook into one object per filled row, keeping the Excel row number.
 * The bigger sheet (Buses and Stops tabs) comes back as { trips: true, buses, stops }.
 */
export async function readSheet(buffer) {
  let sheets
  try {
    sheets = await readXlsxFile(buffer)
  } catch {
    throw ApiError.badRequest('That file could not be read. Save it as an Excel .xlsx file and try again.')
  }
  const tripSheet = readTripSheets(sheets)
  if (tripSheet) return tripSheet
  // The bus table may not be the first tab, so use whichever tab has a Bus Number header.
  const hasHeader = (r) => r.some((c) => COLUMNS.busNumber.test(text(c)))
  const rows = sheets.find((s) => s.data.some(hasHeader))?.data
  if (!rows) throw ApiError.badRequest("This doesn't look like the GO-GO Ride bus sheet. Download the sample sheet and fill that in.")
  const headerAt = rows.findIndex(hasHeader)
  const header = rows[headerAt].map(text)
  const at = Object.fromEntries(Object.entries(COLUMNS).map(([key, re]) => [key, header.findIndex((h) => re.test(h))]))
  if (at.stops < 0) throw ApiError.badRequest('The sheet needs a "Stops and Times" column.')
  const filled = rows
    .map((cells, i) => ({ row: i + 1, cells }))
    .slice(headerAt + 1)
    .filter(({ cells }) => cells.some((c) => text(c)))
  if (filled.length > MAX_ROWS) throw ApiError.badRequest(`Please import at most ${MAX_ROWS} buses at a time.`)
  return filled.map(({ row, cells }) => ({ row, ...Object.fromEntries(Object.entries(at).map(([key, i]) => [key, i < 0 ? null : cells[i]])) }))
}

/** What would happen to each row. Nothing is written. */
export async function planImport(rows) {
  if (rows.trips) return planTripImport(rows)
  const seen = new Set()
  const plan = []
  for (const r of rows) {
    const errors = []
    const busNumber = text(r.busNumber).toUpperCase().replace(/\s+/g, ' ')
    if (!/^[A-Z0-9 -]{4,20}$/.test(busNumber)) errors.push(busNumber ? 'Bus number should be 4 to 20 letters and numbers' : 'Bus number is missing')
    else if (seen.has(busNumber)) errors.push('This bus number is already on an earlier row')
    seen.add(busNumber)

    const existing = busNumber ? await get('SELECT id, bus_name, fare, contact_number FROM buses WHERE bus_number = ?', busNumber) : null

    const fareText = text(r.fare).replace(/^(rs\.?|₹)\s*/i, '')
    const fare = fareText === '' ? null : Number(fareText)
    if (fare === null && !existing) errors.push('Fare is missing')
    if (fare !== null && !(fare >= 0)) errors.push('Fare must be a number')

    const contact = text(r.contact).replace(/[^\d+]/g, '')
    if (contact && (contact.replace(/\D/g, '').length < 6 || contact.length > 15)) errors.push('Contact number looks wrong')

    const days = readDays(r.runsOn)
    if (!days) errors.push('Runs On should be Daily, Mon-Sat, Mon-Fri, Sat-Sun, or days like Mon,Wed,Fri')

    const parsed = readStops(r.stops)
    if (parsed.error) errors.push(parsed.error)
    const stops = []
    for (const s of parsed.stops || []) {
      const known = await findStop(s.name)
      stops.push({ ...s, name: known?.name ?? s.name, stopId: known?.id ?? null, point: known && known.latitude != null ? known : null })
    }

    const busName = text(r.busName)
    plan.push({
      row: r.row,
      busNumber,
      busName: busName || null,
      ac: /^(y|yes|ac|true|1)$/i.test(text(r.ac)),
      fare,
      contact: contact || null,
      days,
      stops,
      action: errors.length ? 'error' : existing ? 'update' : 'create',
      existingId: existing?.id ?? null,
      errors,
    })
  }
  return plan
}

/** Route length so far, from stop coordinates where both ends have them. */
function distances(stops) {
  let total = 0
  return stops.map((s, i) => {
    const prev = stops[i - 1]
    if (prev?.point && s.point) total += haversineKm(prev.point.latitude, prev.point.longitude, s.point.latitude, s.point.longitude)
    return Math.round(total * 100) / 100
  })
}

async function stopIdFor(stop) {
  const known = await findStop(stop.name)
  if (known) {
    // An admin importing it confirms the stop, even one a passenger typed earlier.
    await run(`UPDATE bus_stops SET status = 'ACTIVE', updated_at = ? WHERE id = ? AND status != 'ACTIVE'`, at(Date.now()), known.id)
    return known.id
  }
  const now = Date.now()
  return (await insert('bus_stops', { id: newId(), name: stop.name, area: null, city: 'Kolkata', latitude: null, longitude: null, status: 'ACTIVE', createdAt: now, updatedAt: now })).id
}

/** Write every row without errors. `publish` makes new buses live straight away. */
export async function applyImport(plan, admin, { publish }) {
  const ready = plan.filter((p) => p.action !== 'error')
  if (plan.some((p) => p.trips)) return { ...(await applyTripImport(ready, admin, { publish })), skipped: plan.length - ready.length }
  const contactFallback = (await getSettingsRow()).contactNumber
  let created = 0
  let updated = 0
  await tx(async () => {
    for (const p of ready) {
      const km = distances(p.stops)
      const stopages = p.stops.map((s, i) => ({ arrivalTime: s.time, departureTime: s.time, distanceKm: km[i] }))
      const stopIds = []
      for (const s of p.stops) stopIds.push(await stopIdFor(s))
      const now = Date.now()
      if (p.action === 'update') {
        const changes = { isAc: p.ac ? 1 : 0, runsOn: p.days.join(','), updatedAt: now }
        if (p.busName) changes.busName = p.busName
        if (p.fare !== null) changes.fare = p.fare
        if (p.contact) changes.contactNumber = p.contact
        await update('buses', p.existingId, changes)
        await run('DELETE FROM bus_timetable WHERE bus_id = ?', p.existingId)
        // This sheet gives one trip per bus, so any later trips are switched off.
        await run('UPDATE bus_trips SET is_active = 0, updated_at = ? WHERE bus_id = ? AND trip_number > 1', at(now), p.existingId)
        await insertStopages(p.existingId, stopages, stopIds)
        updated += 1
      } else {
        const bus = await insert('buses', {
          id: newId(),
          busNumber: p.busNumber,
          busName: p.busName,
          ownerId: admin.id,
          routeId: null,
          isAc: p.ac ? 1 : 0,
          category: 'NORMAL',
          operator: null,
          totalSeats: 45,
          fare: p.fare,
          contactNumber: p.contact || contactFallback,
          callFrom: '06:00',
          callUntil: '22:00',
          runsOn: p.days.join(','),
          pictureUrl: null,
          status: publish ? 'APPROVED' : 'PENDING',
          rejectionReason: null,
          ratingAverage: 0,
          ratingCount: 0,
          submittedAt: now,
          reviewedAt: publish ? now : null,
          reviewedBy: publish ? admin.id : null,
          createdAt: now,
          updatedAt: now,
        })
        await insertStopages(bus.id, stopages, stopIds)
        created += 1
      }
    }
    await logActivity({
      actorId: admin.id,
      action: 'BUSES_IMPORTED',
      entityType: 'BUS',
      entityId: null,
      message: `${admin.name} imported buses from Excel: ${created} added, ${updated} updated`,
    })
  })
  return { created, updated, skipped: plan.length - ready.length }
}
