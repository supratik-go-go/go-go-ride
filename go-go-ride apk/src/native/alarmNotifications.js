// Phone notifications for bus alarms.
//
// The backend records alarms and drops an in-app notification when one is
// due, but that only reaches someone who has the app open. In the Android app
// we additionally schedule a *local* notification on the phone for the
// reminder time, so it rings even when the app is closed or offline.
//
// Every function is a no-op in the browser, so callers never need to check.

import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from './platform'

const CHANNEL_ID = 'bus-alarms'
let channelReady = false

/** Stable 31-bit int id from an alarm id (Android needs integer ids). */
function notificationId(alarmId) {
  let h = 0
  for (let i = 0; i < alarmId.length; i += 1) h = (Math.imul(31, h) + alarmId.charCodeAt(i)) | 0
  return Math.abs(h) % 2147483647 || 1
}

/** Local Date the reminder should fire, from the alarm's date + notifyAt (HH:mm). */
export function reminderTime(alarm) {
  const day = String(alarm?.alarmDate || '').slice(0, 10)
  const at = alarm?.notifyAt
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(at || '')) return null
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = at.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

function describe(alarm) {
  const bus = alarm.bus || {}
  const badge = bus.route?.routeNumber || bus.busNumber || 'Your bus'
  const stop = alarm.boardingStop?.name || 'your stop'
  const lead = alarm.remindBeforeMin
  return {
    title: lead > 0 ? `${badge} arrives in ${lead} min` : `${badge} is arriving now`,
    body: `Be at ${stop} by ${alarm.expectedArrival12h || alarm.expectedArrival}. ${bus.route?.name || bus.busName || ''}`.trim(),
  }
}

async function ensureReady() {
  if (!isNativeApp()) return false
  let perm = await LocalNotifications.checkPermissions()
  if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
    perm = await LocalNotifications.requestPermissions()
  }
  if (perm.display !== 'granted') return false
  if (!channelReady) {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Bus alarms',
      description: 'Reminders before your bus reaches your stop',
      importance: 5,
      visibility: 1,
      vibration: true,
    })
    channelReady = true
  }
  return true
}

export const alarmNotifications = {
  /** 'granted' | 'denied' | 'prompt' | 'unsupported' */
  async permission() {
    if (!isNativeApp()) return 'unsupported'
    const p = await LocalNotifications.checkPermissions()
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
  },

  async requestPermission() {
    return ensureReady()
  },

  /**
   * Android 12+ can delay reminders by several minutes unless "Alarms &
   * reminders" (exact alarms) is allowed for the app. Returns 'granted' | 'denied' | 'unsupported'.
   */
  async exactAlarmSetting() {
    if (!isNativeApp()) return 'unsupported'
    try {
      const r = await LocalNotifications.checkExactNotificationSetting()
      return r.exact_alarm === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'unsupported'
    }
  },

  async openExactAlarmSetting() {
    try {
      await LocalNotifications.changeExactNotificationSetting()
    } catch {
      /* older Android: nothing to change */
    }
  },

  /** Schedule (or re-schedule) the phone reminder for one alarm. */
  async schedule(alarm) {
    if (!alarm?.id || alarm.status !== 'ACTIVE') return
    const at = reminderTime(alarm)
    if (!at || at.getTime() <= Date.now()) return
    if (!(await ensureReady())) return
    const id = notificationId(alarm.id)
    await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {})
    const { title, body } = describe(alarm)
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: CHANNEL_ID,
          schedule: { at, allowWhileIdle: true },
          extra: { alarmId: alarm.id, busId: alarm.busId, link: '/alarms' },
          smallIcon: 'ic_stat_notify',
          iconColor: '#0b2a7a',
        },
      ],
    })
  },

  async cancel(alarmId) {
    if (!isNativeApp() || !alarmId) return
    await LocalNotifications.cancel({ notifications: [{ id: notificationId(alarmId) }] }).catch(() => {})
  },

  /**
   * Make the phone's scheduled reminders match the account's ACTIVE alarms
   * (covers alarms set on the website or another phone, and cancelled ones).
   */
  async sync(activeAlarms) {
    if (!isNativeApp()) return
    const perm = await LocalNotifications.checkPermissions().catch(() => null)
    if (perm?.display !== 'granted') return
    const wanted = new Set((activeAlarms || []).map((a) => notificationId(a.id)))
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }))
    const stale = pending.notifications.filter((n) => !wanted.has(n.id)).map((n) => ({ id: n.id }))
    if (stale.length) await LocalNotifications.cancel({ notifications: stale }).catch(() => {})
    for (const alarm of activeAlarms || []) await this.schedule(alarm).catch(() => {})
  },

  /** Remove every scheduled reminder (on logout). */
  async clearAll() {
    if (!isNativeApp()) return
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }))
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) }).catch(() => {})
    }
  },

  /** Tapping a reminder opens the app on the given route. */
  onTap(navigate) {
    if (!isNativeApp()) return () => {}
    const handle = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      navigate(e.notification?.extra?.link || '/alarms')
    })
    return () => {
      handle.then((h) => h.remove()).catch(() => {})
    }
  },
}
