import { http } from '../api/client'

export const alarmService = {
  /** params: status (ACTIVE | TRIGGERED | CANCELLED | EXPIRED), page, limit */
  list: (params) => http.page('/alarms', params),
  /**
   * { busId, boardingStopId, arrivalStopId, date, remindBeforeMin: 30|15|5|0 }
   * Never send the arrival time - the server reads it from the timetable and
   * returns expectedArrival(12h) and notifyAt(12h).
   */
  create: (body) => http.post('/alarms', body),
  update: (id, body) => http.patch(`/alarms/${id}`, body),
  cancel: (id) => http.patch(`/alarms/${id}`, { status: 'CANCELLED' }),
  remove: (id) => http.del(`/alarms/${id}`),
}
