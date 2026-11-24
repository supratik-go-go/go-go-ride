// Bus arrival reminders - the Set Alarm and My Alarms screens (port of app/api/alarms.py).
import { Router } from 'express'
import { requireUser } from '../auth.js'
import { all, byId, day, get, insert, run, scalar, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { DATE_ONLY, Query, fail, oneOf, optional, parseBody, required, saveChanges, startOfDayStrict, str } from '../pyfields.js'
import { alarmOut } from '../serialize.js'
import { tripBetween, tripsOf } from '../services/buses.js'
import { publicBus } from '../services/privacy.js'
import { runsOnDay, todayMs } from '../time.js'
import { ENUMS, REMIND_BEFORE_OPTIONS } from '../validate.js'

const router = Router()

/** The passenger's alarm, without the bus owner's personal contact details. */
async function view(alarm) {
  const data = await alarmOut(alarm)
  data.bus = publicBus(data.bus)
  return data
}

// ---------------------------------------------------------------- My Alarms

router.get('/alarms', requireUser, async (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const status = q.oneOf('status', ENUMS.alarmStatus)
  q.done()

  const where = ['user_id = ?']
  const params = [req.user.id]
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const sqlWhere = where.join(' AND ')
  const total = Number((await scalar(`SELECT count(id) FROM alarms WHERE ${sqlWhere}`, ...params)) || 0)
  const rows = await all(
    `SELECT * FROM alarms WHERE ${sqlWhere} ORDER BY travel_date, bus_arrives_at, created_at, id LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  okPage(res, await Promise.all(rows.map(view)), total, page)
})

// ---------------------------------------------------------------- Set Alarm

const AlarmCreateBody = {
  busId: required(str()),
  boardingStopId: required(str()),
  arrivalStopId: required(str()),
  date: required(str({ pattern: DATE_ONLY })),
  remindBeforeMin: required(oneOf(REMIND_BEFORE_OPTIONS)),
}

/**
 * The expected arrival time is read from the bus timetable at the boarding stop, so
 * the client never sends it. Rejected if the bus does not run that day, the stops are
 * in the wrong order, or an alarm already exists.
 */
router.post('/alarms', requireUser, async (req, res) => {
  const { data: b } = parseBody(req, AlarmCreateBody)
  const user = req.user

  const alarmDate = startOfDayStrict(b.date)
  // Python answers an impossible calendar date (2026-02-30) with a 500; a 400 is kinder.
  if (alarmDate === null) fail([{ field: 'date', message: 'Input should be a valid date' }])
  if (alarmDate < todayMs()) throw ApiError.badRequest('Pick today or a future date')

  const bus = await byId('buses', b.busId)
  if (!bus) throw ApiError.notFound('Bus not found')
  if (bus.status !== 'APPROVED') throw ApiError.badRequest('This bus is not active yet')

  // A bus that goes out and back: the trip in the passenger's direction gives the time.
  const trips = await tripsOf(bus.id)
  const stopages = tripBetween(trips, b.boardingStopId, b.arrivalStopId) ?? trips[0] ?? []
  const boarding = stopages.find((s) => s.stopId === b.boardingStopId)
  const arrival = stopages.find((s) => s.stopId === b.arrivalStopId)
  if (!boarding) throw ApiError.badRequest('This bus does not stop at the boarding stop')
  if (!arrival) throw ApiError.badRequest('This bus does not stop at the arrival stop')
  if (boarding.stopOrder >= arrival.stopOrder) throw ApiError.badRequest('The arrival stop must come after the boarding stop')

  if (!runsOnDay(bus.runsOn, alarmDate)) throw ApiError.badRequest('This bus does not operate on the selected day')
  if (await get('SELECT id FROM bus_off_days WHERE bus_id = ? AND off_date = ?', bus.id, day(alarmDate))) {
    throw ApiError.badRequest('This bus is not running on the selected date')
  }

  const duplicate = await get(
    'SELECT id FROM alarms WHERE user_id = ? AND bus_id = ? AND travel_date = ? AND get_on_stop_id = ? AND status = ?',
    user.id,
    bus.id,
    day(alarmDate),
    b.boardingStopId,
    'ACTIVE',
  )
  if (duplicate) throw ApiError.conflict('You already have an alarm for this bus and date')

  const now = Date.now()
  const alarm = await insert('alarms', {
    id: newId(),
    userId: user.id,
    busId: bus.id,
    tripId: boarding.tripId,
    getOnStopId: b.boardingStopId,
    getOffStopId: b.arrivalStopId,
    travelDate: alarmDate,
    busArrivesAt: boarding.arrivalTime,
    remindMinutesBefore: b.remindBeforeMin,
    status: 'ACTIVE',
    rangAt: null,
    createdAt: now,
    updatedAt: now,
  })
  ok(res, await view(await byId('alarms', alarm.id)), 'Alarm saved. We will remind you before your bus arrives.', 201)
})

// ---------------------------------------------------------------- change / cancel / delete

const AlarmUpdateBody = {
  remindBeforeMin: optional(oneOf(REMIND_BEFORE_OPTIONS)),
  status: optional(oneOf(['ACTIVE', 'CANCELLED'])),
}

router.patch('/alarms/:id', requireUser, async (req, res) => {
  const { data, set } = parseBody(req, AlarmUpdateBody)
  const alarm = await get('SELECT * FROM alarms WHERE id = ? AND user_id = ?', req.params.id, req.user.id)
  if (!alarm) throw ApiError.notFound('Alarm not found')

  // Like setattr() over model_dump(exclude_unset=True): an explicit null is written
  // too (and rejected by the NOT NULL column, as in Python). remindBeforeMin is remind_minutes_before now.
  const column = (k) => (k === 'remindBeforeMin' ? 'remindMinutesBefore' : k)
  await saveChanges(update, 'alarms', alarm, Object.fromEntries(set.map((k) => [column(k), data[k]])))
  ok(res, await view(await byId('alarms', alarm.id)), 'Alarm updated')
})

router.delete('/alarms/:id', requireUser, async (req, res) => {
  const alarm = await get('SELECT id FROM alarms WHERE id = ? AND user_id = ?', req.params.id, req.user.id)
  if (!alarm) throw ApiError.notFound('Alarm not found')
  await run('DELETE FROM alarms WHERE id = ?', alarm.id)
  ok(res, null, 'Alarm removed')
})

export default router
