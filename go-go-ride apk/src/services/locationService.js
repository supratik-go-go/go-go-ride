// Device location + distance maths. Works in the browser and inside the
// Android WebView (Capacitor exposes the same navigator.geolocation API).

const LAST_KEY = 'gogo.lastLocation'

/** Kolkata city centre - used when location is unavailable. */
export const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 }

const toRad = (deg) => (deg * Math.PI) / 180

/** Great-circle distance in kilometres (Haversine). */
export function haversineKm(a, b) {
  if (!a || !b) return Infinity
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

/** { lat, lng } from a stop record (latitude/longitude may be null). */
export function stopPoint(stop) {
  if (!stop || stop.latitude == null || stop.longitude == null) return null
  return { lat: stop.latitude, lng: stop.longitude }
}

function remember(pos) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

export const locationService = {
  isSupported: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,

  /** 'granted' | 'denied' | 'prompt' | 'unsupported' */
  async permissionState() {
    if (!this.isSupported()) return 'unsupported'
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' })
      return status?.state ?? 'prompt'
    } catch {
      return 'prompt'
    }
  },

  /** Resolves { lat, lng, accuracy } or rejects with a user-readable Error. */
  getCurrentPosition({ timeout = 12000, highAccuracy = true } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isSupported()) {
        reject(new Error('Location is not supported on this device.'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
          remember(pos)
          resolve(pos)
        },
        (err) => {
          const messages = {
            1: 'Location permission was denied. Allow location access in your browser or phone settings.',
            2: 'Your location could not be determined. Check that GPS is turned on.',
            3: 'Finding your location took too long. Please try again.',
          }
          reject(new Error(messages[err.code] || 'Could not get your location.'))
        },
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60000 },
      )
    })
  },

  /** Calls onChange({ lat, lng, accuracy }) on movement; returns an unsubscribe fn. */
  watch(onChange, onError) {
    if (!this.isSupported()) return () => {}
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
        remember(pos)
        onChange(pos)
      },
      (err) => onError?.(err),
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  },

  lastKnown() {
    try {
      return JSON.parse(localStorage.getItem(LAST_KEY))
    } catch {
      return null
    }
  },

  /** Sort items (with latitude/longitude or a `point`) by distance from `origin`. */
  sortByDistance(items, origin, getPoint = stopPoint) {
    return items
      .map((item) => ({ ...item, distanceKm: haversineKm(origin, getPoint(item)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  },
}
