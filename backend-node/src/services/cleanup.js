// Automatic clean-ups the owner chose (docs/mysql-plan.md), so tables that only ever grow stay small.
// Run from the alarm timer at most once an hour, and from the CRON_KEY endpoint.
import { at, run } from '../db.js'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

let lastRun = 0

/** Deletes what the owner decided not to keep. Returns the number of rows removed per table. */
export async function cleanUp(now = Date.now()) {
  const removed = {}
  const del = async (name, sql, ...params) => {
    removed[name] = (await run(sql, ...params)).changes
  }
  // Sign-in history and finished sign-ins: 30 days.
  await del('login_history', 'DELETE FROM login_history WHERE created_at < ?', at(now - 30 * DAY_MS))
  await del('sign_in_sessions', 'DELETE FROM sign_in_sessions WHERE (expires_at < ? OR revoked_at IS NOT NULL) AND created_at < ?', at(now), at(now - 30 * DAY_MS))
  await del('otp_codes', 'DELETE FROM otp_codes WHERE expires_at < ?', at(now - DAY_MS))
  await del('phone_checks', 'DELETE FROM phone_checks WHERE expires_at < ?', at(now - DAY_MS))
  await del('reset_codes', 'DELETE FROM reset_codes WHERE expires_at < ?', at(now - DAY_MS))
  await del('email_codes', 'DELETE FROM email_codes WHERE expires_at < ?', at(now - DAY_MS))
  // Notifications: 15 days.
  await del('notifications', 'DELETE FROM notifications WHERE created_at < ?', at(now - 15 * DAY_MS))
  // Recent searches: the last 10 per person.
  await del(
    'recent_searches',
    `DELETE r FROM recent_searches r
     JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY searched_at DESC, id DESC) AS n FROM recent_searches) ranked ON ranked.id = r.id
     WHERE ranked.n > 10`,
  )
  // Games: the board and moves go 3 days after the end; who played and the points stay.
  await del('game_rooms', "UPDATE game_rooms SET game_data = NULL WHERE status IN ('FINISHED', 'CANCELLED') AND game_data IS NOT NULL AND updated_at < ?", at(now - 3 * DAY_MS))
  // Activity log: 1 year.
  await del('activity_log', 'DELETE FROM activity_log WHERE created_at < ?', at(now - 365 * DAY_MS))
  return removed
}

/** cleanUp(), but only when the last run was more than an hour ago. */
export async function cleanUpHourly(now = Date.now()) {
  if (now - lastRun < HOUR_MS) return null
  lastRun = now
  return cleanUp(now)
}
