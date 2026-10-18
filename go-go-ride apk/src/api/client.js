// Single HTTP client for the GO-GO Ride API.
//
// Every response is { success, message, data, meta? }. `api()` unwraps it and
// returns `data`; `apiPage()` returns { data, meta } for list endpoints.
// Failures throw ApiError carrying the backend's user-facing `message`, its
// stable `code`, and per-field `details` for form validation.

// Where the API lives. In the Android app the page is served from the phone
// itself, so a relative "/api" cannot work: the build bakes in VITE_API_URL,
// and the user can override it in Settings -> Server (saved on the device).
const SERVER_KEY = 'gogo.apiBase'
const BUILD_BASE = import.meta.env.VITE_API_URL || '/api'

const clean = (url) => String(url || '').trim().replace(/\/+$/, '')

function readOverride() {
  try {
    return clean(localStorage.getItem(SERVER_KEY))
  } catch {
    return ''
  }
}

let API_BASE = readOverride() || clean(BUILD_BASE)
let API_ORIGIN = originOf(API_BASE)

function originOf(base) {
  // Origin the backend serves /uploads from. Relative ("/api") in the
  // browser dev server, where Vite proxies /uploads too.
  return /^https?:\/\//.test(base) ? new URL(base).origin : ''
}

export const server = {
  get base() {
    return API_BASE
  },
  get buildDefault() {
    return clean(BUILD_BASE)
  },
  get isOverridden() {
    return Boolean(readOverride())
  },
  /** Save a new API base (e.g. "http://192.168.1.9:8000/api"); empty resets to the build default. */
  set(url) {
    const value = clean(url)
    try {
      if (value) localStorage.setItem(SERVER_KEY, value)
      else localStorage.removeItem(SERVER_KEY)
    } catch {
      /* ignore */
    }
    API_BASE = value || clean(BUILD_BASE)
    API_ORIGIN = originOf(API_BASE)
  },
  /** Normalise user input: adds http:// and /api when missing. */
  normalise(input) {
    let v = clean(input)
    if (!v) return ''
    if (!/^https?:\/\//i.test(v)) v = `http://${v}`
    if (!/\/api$/i.test(v)) v = `${v}/api`
    return v
  },
  /** Resolves true when GET {base}/health answers. */
  async test(base = API_BASE) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(`${clean(base)}/health`, { signal: ctrl.signal })
      const json = await res.json()
      return res.ok && json?.success !== false
    } catch {
      return false
    } finally {
      clearTimeout(t)
    }
  },
}

/** Turn a backend file path ("/uploads/avatars/x.png") into a loadable URL. */
export function assetUrl(path) {
  if (!path) return null
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details || []
  }

  /** { phone: 'Enter a valid…' } - ready to spread into form error state. */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]))
  }
}

// ---------------------------------------------------------------- tokens

const ACCESS_KEY = 'gogo.accessToken'
const REFRESH_KEY = 'gogo.refreshToken'

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

let access = read(ACCESS_KEY)
let refresh = read(REFRESH_KEY)
let refreshing = null

export const tokens = {
  get access() {
    return access
  },
  get refresh() {
    return refresh
  },
  set(pair) {
    access = pair?.accessToken ?? null
    refresh = pair?.refreshToken ?? null
    try {
      if (access) localStorage.setItem(ACCESS_KEY, access)
      else localStorage.removeItem(ACCESS_KEY)
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
      else localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* storage unavailable - session lasts for this tab only */
    }
  },
  clear() {
    this.set(null)
  },
}

/** Fired when the session can no longer be renewed; AuthContext listens. */
export const SESSION_EXPIRED_EVENT = 'gogo:session-expired'

async function renew() {
  if (!refresh) return false
  // Collapse parallel 401s into one refresh: the refresh token rotates, so a
  // second concurrent call would spend an already-revoked token.
  refreshing ??= (async () => {
    let res
    try {
      res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      })
    } catch {
      return false // offline: keep the session, the caller surfaces the error
    }
    if (res.status === 400 || res.status === 401) {
      // The refresh token itself was rejected - the session is really over.
      tokens.clear()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      return false
    }
    if (!res.ok) return false // 5xx / proxy error: keep the session, retry later
    try {
      const { data } = await res.json()
      tokens.set(data)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

// ---------------------------------------------------------------- requests

function buildQuery(params) {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    q.append(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function request(path, { method = 'GET', body, params, headers, signal, raw } = {}, retry = true) {
  const isForm = body instanceof FormData
  let res
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(params)}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(
      0,
      'NETWORK',
      'Cannot reach the GO-GO Ride server. Check your internet connection, or the server address in Profile → Settings.',
    )
  }

  if (res.status === 401 && retry && refresh && path !== '/auth/refresh' && (await renew())) {
    return request(path, { method, body, params, headers, signal, raw }, false)
  }

  if (raw) {
    if (!res.ok) throw new ApiError(res.status, 'ERROR', 'Download failed')
    return res
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON body */
  }

  if (!res.ok || json?.success === false) {
    throw new ApiError(
      res.status,
      json?.code ?? 'ERROR',
      json?.message ?? `Request failed (${res.status})`,
      json?.details,
    )
  }
  return json
}

/** Returns the unwrapped `data`. */
export async function api(path, options) {
  const json = await request(path, options)
  return json?.data
}

/** For list endpoints: returns { data, meta }. */
export async function apiPage(path, options) {
  const json = await request(path, options)
  return { data: json?.data ?? [], meta: json?.meta ?? null }
}

/** Raw Response, for file downloads (CSV export). */
export function apiRaw(path, options) {
  return request(path, { ...options, raw: true })
}

export const http = {
  get: (path, params, opts) => api(path, { ...opts, params }),
  page: (path, params, opts) => apiPage(path, { ...opts, params }),
  post: (path, body, opts) => api(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => api(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => api(path, { ...opts, method: 'PUT', body }),
  del: (path, body, opts) => api(path, { ...opts, method: 'DELETE', body }),
}
