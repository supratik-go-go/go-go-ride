// The owner's Android phone, running the free "SMS Gateway for Android" app in cloud mode
// (https://sms-gate.app), receives the SMS people send to prove their number (services/phoneCheck.js).
// Nothing is sent from it, so it costs nothing. This file tells the app, through its cloud service,
// to pass every SMS it receives to /api/sms/incoming/<webhookKey> on this server.
import { config } from '../config.js'

const EVENT = 'sms:received'
const incomingBase = () => `${config.sms.publicUrl.replace(/\/+$/, '')}${config.apiPrefix}/sms/incoming/`
export const webhookUrl = () => incomingBase() + config.sms.webhookKey

/** Number checks are asked for only once there is a number to text (and, live, the app login to pass SMS on). */
export const phoneChecksOn = () => Boolean(config.sms.receiveNumber && (!config.isProd || (config.sms.user && config.sms.password)))

// 'off' | 'connecting' | 'ok' | 'error: ...', shown on /api/health so the owner can see the phone is linked.
let status = 'off'
let linking = null
export const smsStatus = () => (phoneChecksOn() ? status : 'off')

async function gateway(method, p, body) {
  const auth = Buffer.from(`${config.sms.user}:${config.sms.password}`).toString('base64')
  const res = await fetch(`${config.sms.api.replace(/\/+$/, '')}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`${method} ${p} answered ${res.status}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

/**
 * Makes sure the SMS app passes received SMS here: adds the webhook once, and removes older ones that
 * point at this server with another key. Runs at start and before a check if it hasn't worked yet.
 */
export function linkSmsPhone() {
  if (!config.sms.user || !config.sms.password || !config.sms.receiveNumber) return Promise.resolve(false)
  if (status === 'ok') return Promise.resolve(true)
  linking ??= (async () => {
    status = 'connecting'
    try {
      const url = webhookUrl()
      const hooks = (await gateway('GET', '/webhooks')) || []
      let linked = false
      for (const h of hooks) {
        if (h.event !== EVENT || !String(h.url || '').startsWith(incomingBase())) continue
        if (h.url === url && !linked) linked = true
        else if (h.id) await gateway('DELETE', `/webhooks/${encodeURIComponent(h.id)}`)
      }
      if (!linked) await gateway('POST', '/webhooks', { url, event: EVENT })
      status = 'ok'
      console.log('[sms] the SMS phone passes received SMS to this server')
      return true
    } catch (err) {
      // The reason has no secrets in it (method, path, status code or network error).
      status = `error: ${err.message}`.slice(0, 200)
      console.error('[sms] could not link the SMS phone:', err.message)
      return false
    } finally {
      linking = null
    }
  })()
  return linking
}
