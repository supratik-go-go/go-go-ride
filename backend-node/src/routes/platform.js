// Health, public counters, public platform settings (port of app/api/platform.py),
// plus the cron backup endpoint for the alarm scheduler.
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { config } from '../config.js'
import { insert, scalar } from '../db.js'
import { ApiError } from '../errors.js'
import { ok } from '../http.js'
import { processDueAlarms } from '../scheduler.js'
import { cleanUpHourly } from '../services/cleanup.js'
import { latestNews } from '../services/news.js'
import { loadSettings, settingsOut } from '../serialize.js'

const router = Router()
const startedAt = Date.now()

router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', uptime: Math.round((Date.now() - startedAt) / 10) / 100, timestamp: new Date().toISOString() })
})

/** Newest Android build, for the app's update popup. */
router.get('/app-version', (req, res) => {
  const file = path.join(config.downloadDir, 'app-info.json')
  if (!fs.existsSync(file)) return ok(res, null)
  ok(res, { ...JSON.parse(fs.readFileSync(file, 'utf8')), url: '/download/GO-GO-Ride.apk' })
})

/** Headlines for the Daily News tab. */
router.get('/news', async (req, res) => {
  ok(res, await latestNews(req.query.lang, req.query.category))
})

/** Homepage counters: buses, routes, stops, users. */
export const platformCounters = async () => {
  const [buses, routes, stops, users] = await Promise.all([
    scalar('SELECT COUNT(id) FROM buses WHERE status = ?', 'APPROVED'),
    scalar('SELECT COUNT(id) FROM bus_routes WHERE status = ?', 'ACTIVE'),
    scalar('SELECT COUNT(id) FROM bus_stops WHERE status = ?', 'ACTIVE'),
    scalar('SELECT COUNT(id) FROM users'),
  ])
  return { buses: Number(buses || 0), routes: Number(routes || 0), stops: Number(stops || 0), users: Number(users || 0) }
}

router.get('/stats', async (req, res) => ok(res, await platformCounters()))

/** The single settings row, created with defaults on first use. */
export async function getSettingsRow() {
  let row = await loadSettings()
  if (!row) {
    await insert('app_settings', {
      id: 'global',
      appName: 'GO-GO Ride',
      supportEmail: 'support@gogoride.com',
      contactNumber: '+91 12345 43210',
      address: '123, Transport Office Road, Kolkata, West Bengal - 700001',
      updatedAt: Date.now(),
    })
    row = await loadSettings()
  }
  return row
}

router.get('/settings', async (req, res) => ok(res, settingsOut(await getSettingsRow())))

// Backup trigger for the alarm job (e.g. an hPanel cron job hitting this every minute).
router.get('/internal/run-alarms', async (req, res) => {
  if (!config.cronKey || req.query.key !== config.cronKey) throw ApiError.notFound('Not Found')
  const fired = await processDueAlarms()
  await cleanUpHourly()
  ok(res, { fired })
})

export default router
