// Fires the bus-arrival reminders set on the Set Alarm screen
// (port of app/jobs/alarm_scheduler.py).
//
// Runs once a minute inside the API process. Times are compared in Asia/Kolkata,
// so it works the same on a UTC server. GET /api/internal/run-alarms?key=CRON_KEY
// runs the same job, as a backup from an hPanel cron job.
import { all, at, byId, day, run, tx } from './db.js'
import { cleanUpHourly } from './services/cleanup.js'
import { notify } from './services/common.js'
import { kolkataNow, startOfDay, to12h, toMinutes } from './time.js'

export async function processDueAlarms(when = new Date()) {
  const now = kolkataNow(when)
  const today = startOfDay(now.date)
  let fired = 0

  await tx(async () => {
    const alarms = await all('SELECT * FROM alarms WHERE status = ? AND travel_date = ?', 'ACTIVE', day(today))
    for (const alarm of alarms) {
      const notifyMinutes = toMinutes(alarm.busArrivesAt) - alarm.remindMinutesBefore
      // Fire within a one-minute window so a late tick still delivers.
      if (!(notifyMinutes <= now.minutes && now.minutes <= notifyMinutes + 1)) continue
      const bus = await byId('buses', alarm.busId)
      const stop = await byId('bus_stops', alarm.getOnStopId)
      if (!bus || !stop) continue
      // Many buses are known only by name (the bus number is optional).
      const label = bus.busNumber || bus.busName || 'Your bus'
      const soon = alarm.remindMinutesBefore === 0 ? 'is arriving now' : `arrives in ${alarm.remindMinutesBefore} minutes`
      await notify({
        userId: alarm.userId,
        title: `Bus ${label} ${soon}`,
        message: `${label} reaches ${stop.name} at ${to12h(alarm.busArrivesAt)}.`,
        type: 'ALARM',
        link: `/buses/${alarm.busId}`,
      })
      await run('UPDATE alarms SET status = ?, rang_at = ? WHERE id = ?', 'TRIGGERED', at(when.getTime()), alarm.id)
      fired += 1
    }
    // Retire earlier days' leftovers so "My Alarms" stays clean.
    await run('UPDATE alarms SET status = ? WHERE status = ? AND travel_date < ?', 'EXPIRED', 'ACTIVE', day(today))
  })
  return fired
}

export function startScheduler() {
  const tick = async () => {
    try {
      const n = await processDueAlarms()
      if (n) console.log(`[alarms] sent ${n} reminder(s)`)
      const removed = await cleanUpHourly()
      if (removed) console.log('[cleanup]', JSON.stringify(removed))
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
