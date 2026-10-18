// Fires the bus-arrival reminders set on the Set Alarm screen
// (port of app/jobs/alarm_scheduler.py).
//
// Runs once a minute inside the API process. Times are compared in Asia/Kolkata,
// so it works the same on a UTC server. GET /api/internal/run-alarms?key=CRON_KEY
// runs the same job, as a backup from an hPanel cron job.
import { all, byId, run, tx } from './db.js'
import { notify } from './services/common.js'
import { kolkataNow, startOfDay, to12h, toMinutes } from './time.js'

export function processDueAlarms(at = new Date()) {
  const now = kolkataNow(at)
  const today = startOfDay(now.date)
  let fired = 0

  tx(() => {
    const alarms = all('SELECT * FROM "Alarm" WHERE status = ? AND "alarmDate" = ?', 'ACTIVE', today)
    for (const alarm of alarms) {
      const notifyMinutes = toMinutes(alarm.expectedArrival) - alarm.remindBeforeMin
      // Fire within a one-minute window so a late tick still delivers.
      if (!(notifyMinutes <= now.minutes && now.minutes <= notifyMinutes + 1)) continue
      const bus = byId('Bus', alarm.busId)
      const stop = byId('BusStop', alarm.boardingStopId)
      if (!bus || !stop) continue
      const when = alarm.remindBeforeMin === 0 ? 'is arriving now' : `arrives in ${alarm.remindBeforeMin} minutes`
      notify({
        userId: alarm.userId,
        title: `Bus ${bus.busNumber} ${when}`,
        message: `${bus.busNumber} reaches ${stop.name} at ${to12h(alarm.expectedArrival)}.`,
        type: 'ALARM',
        link: `/buses/${alarm.busId}`,
      })
      run('UPDATE "Alarm" SET status = ?, "notifiedAt" = ? WHERE id = ?', 'TRIGGERED', at.getTime(), alarm.id)
      fired += 1
    }
    // Retire earlier days' leftovers so "My Alarms" stays clean.
    run('UPDATE "Alarm" SET status = ? WHERE status = ? AND "alarmDate" < ?', 'EXPIRED', 'ACTIVE', today)
  })
  return fired
}

export function startScheduler() {
  const tick = () => {
    try {
      const n = processDueAlarms()
      if (n) console.log(`[alarms] sent ${n} reminder(s)`)
    } catch (err) {
      console.error('[alarms] tick failed', err)
    }
  }
  // Align to the start of each minute, then every 60 s.
  const delay = 60000 - (Date.now() % 60000) + 500
  const timer = setTimeout(() => {
    tick()
    setInterval(tick, 60000).unref()
  }, delay)
  timer.unref()
  console.log('[alarms] scheduler started')
}
