import { http } from '../api/client'

export const stopService = {
  list: (params) => http.page('/stops', params),
  /** Autocomplete helper - returns the array directly. */
  search: (search, limit = 8) => http.page('/stops', { search, limit, status: 'ACTIVE' }).then((r) => r.data),
  nearby: (lat, lng, radiusKm = 3, limit = 20) => http.get('/stops/nearby', { lat, lng, radiusKm, limit }),
  get: (id) => http.get(`/stops/${id}`),
  create: (body) => http.post('/stops', body),
  update: (id, body) => http.patch(`/stops/${id}`, body),
  remove: (id) => http.del(`/stops/${id}`),
}

export const routeService = {
  list: (params) => http.page('/routes', params),
  popular: (limit = 6) => http.get('/routes/popular', { limit }),
  get: (id) => http.get(`/routes/${id}`),
  create: (body) => http.post('/routes', body),
  update: (id, body) => http.patch(`/routes/${id}`, body),
  remove: (id) => http.del(`/routes/${id}`),
}
