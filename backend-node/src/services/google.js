// Sign in with Google: the phone asks Google for an ID token (a signed note saying which Google
// account this is), and this checks it with Google's public keys: signed by Google, meant for our
// client ID, not expired. Free, and no password or Google secret is kept here.
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { ApiError } from '../errors.js'

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
const KEYS_FOR_MS = 60 * 60 * 1000 // Google changes its keys every few weeks
let keys = { at: 0, byId: new Map() }

export const googleOn = () => Boolean(config.google.clientId)

async function googleKey(kid) {
  if (!keys.byId.has(kid) || Date.now() - keys.at > KEYS_FOR_MS) {
    const res = await fetch(config.google.certsUrl, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`Google's keys answered ${res.status}`)
    const list = (await res.json())?.keys || []
    keys = { at: Date.now(), byId: new Map(list.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])) }
  }
  return keys.byId.get(kid)
}

const failed = () => ApiError.unauthorized('Google sign-in failed. Please try again.')

/** { sub, email, name } of the Google account in a valid ID token; a 401 otherwise. */
export async function verifyGoogleToken(idToken) {
  const kid = jwt.decode(idToken, { complete: true })?.header?.kid
  if (!kid) throw failed()
  let key
  try {
    key = await googleKey(kid)
  } catch (err) {
    console.error('[google] could not fetch the keys:', err.message)
    throw new ApiError(502, "Couldn't reach Google. Try again in a minute.", 'GOOGLE_UNREACHABLE')
  }
  if (!key) throw failed()
  let claims
  try {
    claims = jwt.verify(idToken, key, { algorithms: ['RS256'], audience: config.google.clientId, issuer: ISSUERS })
  } catch {
    throw failed()
  }
  const verified = claims.email_verified === true || claims.email_verified === 'true'
  if (!claims.sub || !claims.email || !verified) throw ApiError.unauthorized('This Google account has no confirmed email address.')
  const email = String(claims.email).toLowerCase()
  const name = String(claims.name || claims.given_name || email.split('@')[0]).trim().slice(0, 80)
  return { sub: String(claims.sub), email, name: name.length >= 2 ? name : 'GO-GO Rider' }
}
