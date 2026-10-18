import { http } from '../api/client'
import { alarmNotifications } from '../native/alarmNotifications'

// App build: every alarm change also updates the phone's scheduled reminder
// (see src/native/alarmNotifications.js). Phone-side failures never block
// the API call - the server-side alarm is the source of truth.
const quietly = (p) => Promise.resolve(p).catch(() => {})

export const alarmService = {
  /** params: status (ACTIVE | TRIGGERED | CANCELLED | EXPIRED), page, limit */
  async list(params) {
    const res = await http.page('/alarms', params)
    // A full list of active alarms lets us reconcile what the phone has scheduled.
    if (params?.status === 'ACTIVE' && (res.meta?.totalPages ?? 1) <= 1) quietly(alarmNotifications.sync(res.data))
    return res
  },
  /**
   * { busId, boardingStopId, arrivalStopId, date, remindBeforeMin: 30|15|5|0 }
   * Never send the arrival time - the server reads it from the timetable and
   * returns expectedArrival(12h) and notifyAt(12h).
   */
  async create(body) {
    const alarm = await http.post('/alarms', body)
    quietly(alarmNotifications.schedule(alarm))
    return alarm
  },
  async update(id, body) {
    const alarm = await http.patch(`/alarms/${id}`, body)
    quietly(alarm?.status === 'ACTIVE' ? alarmNotifications.schedule(alarm) : alarmNotifications.cancel(id))
    return alarm
  },
  cancel(id) {
    return this.update(id, { status: 'CANCELLED' })
  },
  async remove(id) {
    const res = await http.del(`/alarms/${id}`)
    quietly(alarmNotifications.cancel(id))
    return res
  },
}
