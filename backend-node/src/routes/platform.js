// Health, public counters, public platform settings (port of app/api/platform.py),
// plus the cron backup endpoint for the alarm scheduler.
import { Router } from 'express'
import { config } from '../config.js'
import { insert, scalar } from '../db.js'
import { ApiError } from '../errors.js'
import { ok } from '../http.js'
import { processDueAlarms } from '../scheduler.js'
import { loadSettings, settingsOut } from '../serialize.js'

const router = Router()
const startedAt = Date.now()

router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: Math.round((Date.now() - startedAt) / 10) / 100, timestamp: new Date().toISOString() })
})

/** Homepage counters: buses, routes, stops, users. */
export const platformCounters = () => ({
  buses: Number(scalar('SELECT COUNT(id) FROM "Bus" WHERE status = ?', 'APPROVED') || 0),
  routes: Number(scalar('SELECT COUNT(id) FROM "Route" WHERE status = ?', 'ACTIVE') || 0),
  stops: Number(scalar('SELECT COUNT(id) FROM "BusStop" WHERE status = ?', 'ACTIVE') || 0),
  users: Number(scalar('SELECT COUNT(id) FROM "User"') || 0),
})

router.get('/stats', (req, res) => ok(res, platformCounters()))

/** The single settings row, created with defaults on first use. */
export function getSettingsRow() {
  let row = loadSettings()
  if (!row) {
    insert('Setting', {
      id: 'global',
      platformName: 'GO-GO Ride',
      platformEmail: 'support@gogoride.com',
      contactNumber: '+91 12345 43210',
      address: '123, Transport Office Road, Kolkata, West Bengal - 700001',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      dateFormat: 'DD MMM YYYY',
      timeFormat: '12h',
      updatedAt: Date.now(),
    })
    row = loadSettings()
  }
  return row
}

router.get('/settings', (req, res) => ok(res, settingsOut(getSettingsRow())))

// Backup trigger for the alarm job (e.g. an hPanel cron job hitting this every minute).
router.get('/internal/run-alarms', (req, res) => {
  if (!config.cronKey || req.query.key !== config.cronKey) throw ApiError.notFound('Not Found')
  ok(res, { fired: processDueAlarms() })
})

export default router
