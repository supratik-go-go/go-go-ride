import { http } from '../api/client'

export const stopService = {
  list: (params) => http.page('/stops', params),
  /** Autocomplete helper - returns the array directly. */
  search: (search, limit = 8) => http.page('/stops', { search, limit, status: 'ACTIVE' }).then((r) => r.data),
  nearby: (lat, lng, radiusKm = 3, limit = 20) => http.get('/stops/nearby', { lat, lng, radiusKm, limit }),
  /** Voice search: the phone's guesses at what was said -> { from, to, fromOptions, toOptions, heard }. */
  voiceTrip: (heard) => http.post('/stops/voice-trip', { heard }),
  get: (id) => http.get(`/stops/${id}`),
  create: (body) => http.post('/stops', body),
  update: (id, body) => http.patch(`/stops/${id}`, body),
  remove: (id) => http.del(`/stops/${id}`),
}

export const contributionService = {
  submitRoute: (body) => http.post('/route-submissions', body),
  myRoutes: (params) => http.page('/route-submissions/mine', params),
}

export const routeService = {
  list: (params) => http.page('/routes', params),
  popular: (limit = 6) => http.get('/routes/popular', { limit }),
  get: (id) => http.get(`/routes/${id}`),
  create: (body) => http.post('/routes', body),
  update: (id, body) => http.patch(`/routes/${id}`, body),
  remove: (id) => http.del(`/routes/${id}`),
}

/** Local police numbers on the Emergency Call List (sent by users, shown after an admin approves). */
export const communityService = {
  policeNumbers: (search) => http.page('/police-numbers', { search: search || undefined, limit: 100 }).then((r) => r.data),
  sendPoliceNumber: (body) => http.post('/police-numbers', body),
  /** A photo of a bus ticket (already shrunk) and an optional note, for the team to add the bus. */
  sendTicketPhoto(file, note) {
    const fd = new FormData()
    fd.append('file', file, file.name || 'ticket.jpg')
    if (note) fd.append('note', note)
    return http.post('/ticket-photos', fd)
  },
}
