import { http } from '../api/client'

export const busService = {
  /**
   * params: from, to (stop names, partial match) or fromStopId, toStopId;
   * q + searchType (ROUTE | BUS_NUMBER | BUS_NAME); date, time, type,
   * category, maxFare, sort (departure | fare | duration | rating).
   * -> { date, from, to, total, buses: BusSearchResult[] }
   */
  search: (params) => http.get('/buses/search', params),
  /** Non-admins only ever get APPROVED buses. */
  list: (params) => http.page('/buses', params),
  /** -> bus + timetable[], journey, availability { isRunning, reason }, exceptions[] */
  get: (id, date) => http.get(`/buses/${id}`, date ? { date } : undefined),
  create: (body) => http.post('/buses', body),
  update: (id, body) => http.patch(`/buses/${id}`, body),
  remove: (id) => http.del(`/buses/${id}`),
  mine: (params) => http.page('/buses/mine/list', params),
  /** docType: RC_BOOK | ROUTE_PERMIT | INSURANCE | OTHER; max 5 MB JPG/PNG/WEBP/PDF */
  uploadDocument(id, file, docType) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('docType', docType)
    return http.post(`/buses/${id}/documents`, fd)
  },
  /** Owners need >= 5 days notice; admins can add any date. */
  addException: (id, date, reason) => http.post(`/buses/${id}/exceptions`, { date, reason }),
  removeException: (id, exceptionId) => http.del(`/buses/${id}/exceptions/${exceptionId}`),
  reviews: (id, params) => http.page(`/buses/${id}/reviews`, params),
  /** Upsert - posting again edits the user's existing review. */
  review: (id, rating, comment) => http.post(`/buses/${id}/reviews`, { rating, comment }),
}
