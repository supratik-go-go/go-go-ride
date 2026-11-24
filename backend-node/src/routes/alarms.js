// Bus arrival reminders - the Set Alarm and My Alarms screens (port of app/api/alarms.py).
import { Router } from 'express'
import { requireUser } from '../auth.js'
import { all, byId, get, insert, run, scalar, update } from '../db.js'
import { ApiError } from '../errors.js'
import { ok, okPage } from '../http.js'
import { newId } from '../ids.js'
import { DATE_ONLY, Query, fail, oneOf, optional, parseBody, required, saveChanges, startOfDayStrict, str } from '../pyfields.js'
import { alarmOut } from '../serialize.js'
import { publicBus } from '../services/privacy.js'
import { runsOnDay, todayMs } from '../time.js'
import { ENUMS, REMIND_BEFORE_OPTIONS } from '../validate.js'

const router = Router()

/** The passenger's alarm, without the bus owner's personal contact details. */
function view(alarm) {
  const data = alarmOut(alarm)
  data.bus = publicBus(data.bus)
  return data
}

// ---------------------------------------------------------------- My Alarms

router.get('/alarms', requireUser, (req, res) => {
  const q = new Query(req.query)
  const page = q.page()
  const status = q.oneOf('status', ENUMS.alarmStatus)
  q.done()

  const where = ['"userId" = ?']
  const params = [req.user.id]
  if (status) {
    where.push('status = ?')
    params.push(status)
  }
  const sqlWhere = where.join(' AND ')
  const total = Number(scalar(`SELECT count("Alarm".id) FROM "Alarm" WHERE ${sqlWhere}`, ...params) || 0)
  const rows = all(
    `SELECT * FROM "Alarm" WHERE ${sqlWhere} ORDER BY "alarmDate", "expectedArrival" LIMIT ? OFFSET ?`,
    ...params,
    page.limit,
    page.skip,
  )
  okPage(res, rows.map(view), total, page)
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
router.post('/alarms', requireUser, (req, res) => {
  const { data: b } = parseBody(req, AlarmCreateBody)
  const user = req.user

  const alarmDate = startOfDayStrict(b.date)
  // Python answers an impossible calendar date (2026-02-30) with a 500; a 400 is kinder.
  if (alarmDate === null) fail([{ field: 'date', message: 'Input should be a valid date' }])
  if (alarmDate < todayMs()) throw ApiError.badRequest('Pick today or a future date')

  const bus = byId('Bus', b.busId)
  if (!bus) throw ApiError.notFound('Bus not found')
  if (bus.status !== 'APPROVED') throw ApiError.badRequest('This bus is not active yet')

  const stopages = all('SELECT * FROM "BusStopage" WHERE "busId" = ? ORDER BY sequence', bus.id)
  const boarding = stopages.find((s) => s.stopId === b.boardingStopId)
  const arrival = stopages.find((s) => s.stopId === b.arrivalStopId)
  if (!boarding) throw ApiError.badRequest('This bus does not stop at the boarding stop')
  if (!arrival) throw ApiError.badRequest('This bus does not stop at the arrival stop')
  if (boarding.sequence >= arrival.sequence) throw ApiError.badRequest('The arrival stop must come after the boarding stop')

  if (!runsOnDay(bus.serviceDays, alarmDate)) throw ApiError.badRequest('This bus does not operate on the selected day')
  if (get('SELECT id FROM "BusException" WHERE "busId" = ? AND date = ?', bus.id, alarmDate)) {
    throw ApiError.badRequest('This bus is not running on the selected date')
  }

  const duplicate = get(
    'SELECT id FROM "Alarm" WHERE "userId" = ? AND "busId" = ? AND "alarmDate" = ? AND "boardingStopId" = ? AND status = ?',
    user.id,
    bus.id,
    alarmDate,
    b.boardingStopId,
    'ACTIVE',
  )
  if (duplicate) throw ApiError.conflict('You already have an alarm for this bus and date')

  const now = Date.now()
  const alarm = insert('Alarm', {
    id: newId(),
    userId: user.id,
    busId: bus.id,
    boardingStopId: b.boardingStopId,
    arrivalStopId: b.arrivalStopId,
    alarmDate,
    expectedArrival: boarding.arrivalTime,
    remindBeforeMin: b.remindBeforeMin,
    status: 'ACTIVE',
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
  })
  ok(res, view(byId('Alarm', alarm.id)), 'Alarm saved. We will remind you before your bus arrives.', 201)
})

// ---------------------------------------------------------------- change / cancel / delete

const AlarmUpdateBody = {
  remindBeforeMin: optional(oneOf(REMIND_BEFORE_OPTIONS)),
  status: optional(oneOf(['ACTIVE', 'CANCELLED'])),
}

router.patch('/alarms/:id', requireUser, (req, res) => {
  const { data, set } = parseBody(req, AlarmUpdateBody)
  const alarm = get('SELECT * FROM "Alarm" WHERE id = ? AND "userId" = ?', req.params.id, req.user.id)
  if (!alarm) throw ApiError.notFound('Alarm not found')

  // Like setattr() over model_dump(exclude_unset=True): an explicit null is written
  // too (and rejected by the NOT NULL column, as in Python).
  saveChanges(update, 'Alarm', alarm, Object.fromEntries(set.map((k) => [k, data[k]])))
  ok(res, view(byId('Alarm', alarm.id)), 'Alarm updated')
})

router.delete('/alarms/:id', requireUser, (req, res) => {
  const alarm = get('SELECT id FROM "Alarm" WHERE id = ? AND "userId" = ?', req.params.id, req.user.id)
  if (!alarm) throw ApiError.notFound('Alarm not found')
  run('DELETE FROM "Alarm" WHERE id = ?', alarm.id)
  ok(res, null, 'Alarm removed')
})

export default router
