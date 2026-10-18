import { isValidPhone } from '../../utils/format'

// Small form helpers shared by the auth, public and account pages.

/**
 * Map an ApiError's field details onto { field: message }.
 * Pydantic prefixes custom validator messages with "Value error, " - strip it,
 * and keep only the last path segment ("stopages.0.stopName" -> "stopName").
 */
export function serverFieldErrors(err) {
  const out = {}
  const fields = err?.fieldErrors || {}
  for (const [key, msg] of Object.entries(fields)) {
    const name = String(key).split('.').pop()
    out[name] = String(msg || '').replace(/^Value error,\s*/i, '')
  }
  return out
}

/** Keep digits only, max 10 (a pasted "+91 98300 00000" becomes "9830000000"). */
export function cleanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return (digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits).slice(0, 10)
}

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim())

/** Only allow in-app redirect targets ("/bookings/1"), never "//evil.com" or "https://…". */
export function safeNext(next, fallback = '/home') {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}

/** "Something went wrong" style top-level message unless it was only a field validation error. */
export function formLevelMessage(err) {
  if (!err) return ''
  if (err.code === 'BAD_REQUEST' && err.details?.length) return 'Please fix the highlighted fields.'
  return err.message || 'Something went wrong. Please try again.'
}

/** Client checks mirroring POST /support/tickets (name 2-80, phone, subject 3-120, message 5-2000). */
export function validateTicket(f, { withContact = true } = {}) {
  const e = {}
  if (withContact) {
    const name = f.name.trim()
    if (name.length < 2) e.name = 'Enter your name (at least 2 characters)'
    else if (name.length > 80) e.name = 'Name is too long'
    if (!isValidPhone(f.phone) || f.phone.length !== 10) e.phone = 'Enter a valid 10-digit mobile number'
    if (f.email?.trim() && !isValidEmail(f.email)) e.email = 'Enter a valid email address'
  }
  if (f.subject.trim().length < 3) e.subject = 'Add a short subject (at least 3 characters)'
  else if (f.subject.trim().length > 120) e.subject = 'Keep the subject under 120 characters'
  if (f.message.trim().length < 5) e.message = 'Tell us a little more (at least 5 characters)'
  else if (f.message.trim().length > 2000) e.message = 'Keep the message under 2000 characters'
  return e
}
