// Small helpers for the bus-owner / driver screens.

import { LABELS, splitDays } from '../../utils/format'

export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const DEFAULT_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

/** "Daily", "Mon–Fri", or "Mon, Wed, Fri". */
export function formatServiceDays(value) {
  const idx = splitDays(value)
    .map((d) => DAY_ORDER.indexOf(d))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  if (!idx.length) return 'No days set'
  if (idx.length === 7) return 'Daily'
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  const name = (i) => LABELS.day[DAY_ORDER[i]]
  if (contiguous && idx.length >= 3) return `${name(idx[0])}–${name(idx[idx.length - 1])}`
  return idx.map(name).join(', ')
}

/** Allowed upload types (backend: JPG / PNG / WEBP / PDF, 5 MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const DOC_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf'
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DOC_EXT = /\.(jpe?g|png|webp|pdf)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i

/** Returns an error message, or null when the file is acceptable. */
export function validateUpload(file, { imageOnly = false } = {}) {
  if (!file) return 'Choose a file'
  const types = imageOnly ? IMAGE_TYPES : DOC_TYPES
  const ext = imageOnly ? IMAGE_EXT : DOC_EXT
  // The API checks both the MIME type and the file extension.
  if (!types.includes(file.type) || !ext.test(file.name)) {
    return imageOnly ? 'Only JPG, PNG or WEBP images are allowed' : 'Only JPG, PNG, WEBP or PDF files are allowed'
  }
  if (file.size === 0) return 'This file is empty'
  if (file.size > MAX_UPLOAD_BYTES) return `This file is ${formatBytes(file.size)} — the limit is 5 MB`
  return null
}

export function formatBytes(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Pydantic prefixes custom messages with "Value error, " - drop it for display. */
export const cleanMessage = (msg) => String(msg || '').replace(/^Value error,\s*/i, '')

/** ApiError.details -> { field: message } with cleaned messages. */
export function serverFieldErrors(err) {
  const out = {}
  for (const d of err?.details || []) {
    if (d?.field) out[d.field] = cleanMessage(d.message)
  }
  return out
}

/** Scroll the first invalid control into view and focus it. */
export function focusFirstError(root = document) {
  requestAnimationFrame(() => {
    const el = root.querySelector('[aria-invalid="true"], .own-invalid')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = el.matches('input,select,textarea,button') ? el : el.querySelector('input,select,textarea,button')
    focusable?.focus({ preventScroll: true })
  })
}
