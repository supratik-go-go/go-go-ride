import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { parseISODate, todayISO } from '../../utils/format'

/**
 * Returns `requireLogin(nextPath?)`: true when signed in, otherwise sends the
 * user to /login?next=<current url> and returns false.
 */
export function useRequireLogin() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (nextPath) => {
      if (isAuthenticated) return true
      const next = nextPath || `${location.pathname}${location.search}`
      navigate(`/login?next=${encodeURIComponent(next)}`)
      return false
    },
    [isAuthenticated, navigate, location.pathname, location.search],
  )
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Does a bus with serviceDays "MON,TUE" run on the ISO date? Unknown -> true. */
export function runsOnDate(serviceDays, iso) {
  if (!serviceDays) return true
  const days = Array.isArray(serviceDays) ? serviceDays : String(serviceDays).split(',').filter(Boolean)
  if (!days.length) return true
  return days.includes(DAY_CODES[parseISODate(iso).getDay()])
}

/** Clamp a YYYY-MM-DD to today or later; invalid values fall back to today. */
export function safeDate(value) {
  const today = todayISO()
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today
  return value < today ? today : value
}

/** Open the native picker of a date/select input (falls back to focus). */
export function openPicker(input) {
  if (!input) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    /* showPicker throws when not triggered by a user gesture */
  }
  input.focus()
  input.click()
}

/** "HH:mm" -> minutes after midnight. */
export const toMinutes = (hhmm) => {
  if (!hhmm) return null
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

/** Share a link with the native sheet, or copy it. Returns 'shared' | 'copied' | 'cancelled'. */
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return 'copied'
    throw new Error('Could not copy the link. Copy it from the address bar instead.')
  }
}

/** Rating display: "4.6" or "New" when nobody has rated yet. */
export const ratingText = (avg, count) => (count > 0 || avg > 0 ? Number(avg || 0).toFixed(1) : 'New')

/** First name for greetings. */
export const firstName = (name) => (name || '').trim().split(/\s+/)[0] || ''
