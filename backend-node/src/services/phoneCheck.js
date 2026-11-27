// Proving a mobile number for free: the app shows a 6-digit code, the person texts it from that
// number to the GO-GO Ride phone (config.sms.receiveNumber), and the phone passes the SMS here
// (POST /api/sms/incoming, see services/sms.js). The SMS costs the sender one normal message.
// A check is then good for one sign-up or password change: the app holds its id and a secret token.
import crypto from 'node:crypto'
import { config } from '../config.js'
import { at, byId, get, insert, placeholders, run, scalar } from '../db.js'
import { ApiError } from '../errors.js'
import { hashToken } from '../auth.js'
import { generateOtp, newId } from '../ids.js'

const VALID_MS = 15 * 60 * 1000 // to send the SMS and then type the new password
export const SMS_PREFIX = 'GOGO'

const intl = (digits) => `+91${digits}`
const checkError = (message, code) => new ApiError(400, message, code)

/** A new check for `phone`. Returns what the app shows: the number to text and the message. */
export async function startCheck(phone, purpose) {
  const recent = Number((await scalar('SELECT COUNT(id) FROM phone_checks WHERE phone = ? AND created_at >= ?', phone, at(Date.now() - 60000))) || 0)
  if (recent >= 3) throw ApiError.tooMany('Please wait a minute before trying again')
  const token = crypto.randomBytes(24).toString('base64url')
  const now = Date.now()
  const check = await insert('phone_checks', {
    id: newId(),
    phone,
    purpose,
    code: generateOtp(),
    tokenHash: hashToken(token),
    verifiedAt: null,
    usedAt: null,
    expiresAt: now + VALID_MS,
    createdAt: now,
  })
  return {
    checkId: check.id,
    checkToken: token,
    sendTo: intl(config.sms.receiveNumber),
    message: `${SMS_PREFIX} ${check.code}`,
    expiresInSeconds: VALID_MS / 1000,
  }
}

async function load(checkId, checkToken) {
  const check = checkId && checkToken ? await byId('phone_checks', String(checkId)) : null
  if (!check || !crypto.timingSafeEqual(Buffer.from(check.tokenHash), Buffer.from(hashToken(String(checkToken))))) {
    throw checkError('Verify your mobile number again', 'CHECK_NOT_FOUND')
  }
  return check
}

/** 'WAITING' until the SMS arrives, then 'VERIFIED'; 'USED' or 'EXPIRED' when it can no longer be used. */
export async function checkStatus(checkId, checkToken) {
  const check = await load(checkId, checkToken)
  if (check.usedAt) return 'USED'
  if (check.expiresAt < Date.now()) return 'EXPIRED'
  return check.verifiedAt ? 'VERIFIED' : 'WAITING'
}

/** Inside the caller's transaction: marks the check used, or throws when it doesn't prove `phone` for `purpose`. */
export async function useCheck({ checkId, checkToken, phone, purpose }) {
  const check = await load(checkId, checkToken)
  if (check.phone !== phone || check.purpose !== purpose) throw checkError('Verify your mobile number again', 'CHECK_NOT_FOUND')
  if (check.usedAt || check.expiresAt < Date.now()) throw checkError('That took too long. Verify your mobile number again.', 'CHECK_EXPIRED')
  if (!check.verifiedAt) throw checkError("Your SMS hasn't arrived yet. Send it, then try again.", 'PHONE_NOT_VERIFIED')
  const { changes } = await run('UPDATE phone_checks SET used_at = ? WHERE id = ? AND used_at IS NULL', at(Date.now()), check.id)
  if (!changes) throw checkError('Verify your mobile number again', 'CHECK_NOT_FOUND')
}

/**
 * An SMS the phone received. Marks the waiting check whose code it carries as verified, when it came
 * from that check's number. Returns true when one matched.
 */
export async function smsReceived(sender, text) {
  const digits = String(sender || '').replace(/\D/g, '').slice(-10)
  const codes = [...new Set(String(text || '').match(/\d{6}/g) || [])].slice(0, 5)
  if (!/^[6-9]\d{9}$/.test(digits) || !codes.length) return false
  const check = await get(
    `SELECT id FROM phone_checks WHERE phone = ? AND code IN (${placeholders(codes)}) AND verified_at IS NULL AND used_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    digits,
    ...codes,
    at(Date.now()),
  )
  if (!check) return false
  await run('UPDATE phone_checks SET verified_at = ? WHERE id = ?', at(Date.now()), check.id)
  return true
}
