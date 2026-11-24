// Sends a text message through the owner's own Android phone (the free "SMS Gateway for Android"
// app, cloud mode; settings in config.sms). Free, about 100 messages a day on a normal SIM, and the
// phone has to stay switched on and online.
import { config } from '../config.js'
import { ApiError } from '../errors.js'

export const smsReady = () => Boolean(config.sms.user && config.sms.password)

/** phone: the 10-digit Indian mobile number. Throws a user-readable ApiError when it can't send. */
export async function sendSms(phone, text) {
  if (!smsReady()) throw new ApiError(503, 'SMS codes are not available yet', 'SMS_NOT_READY')
  const auth = Buffer.from(`${config.sms.user}:${config.sms.password}`).toString('base64')
  let res
  try {
    res = await fetch(config.sms.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [`+91${String(phone).slice(-10)}`] }),
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    console.error('[sms] gateway not reachable:', err.message)
    throw new ApiError(502, "Couldn't send the SMS right now. Try again in a minute.", 'SMS_FAILED')
  }
  if (!res.ok) {
    console.error('[sms] gateway answered', res.status, (await res.text().catch(() => '')).slice(0, 200))
    throw new ApiError(502, "Couldn't send the SMS right now. Try again in a minute.", 'SMS_FAILED')
  }
}
