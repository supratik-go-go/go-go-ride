// Response envelope helpers: { success, message, data } (+ meta on lists).

export function ok(res, data = null, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data })
}

/** The `meta` block carried by every list response. */
export function meta(total, page, extra = {}) {
  return {
    page: page.page,
    limit: page.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / page.limit)),
    ...extra,
  }
}

export function okPage(res, items, total, page, { message = 'Success', extraMeta = {} } = {}) {
  return res.status(200).json({ success: true, message, data: items, meta: meta(total, page, extraMeta) })
}
