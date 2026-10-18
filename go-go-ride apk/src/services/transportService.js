import { http } from '../api/client'

export const localCarService = {
  /** params: area, verified, minRating, search, page, limit */
  list: (params) => http.page('/local-cars', params),
  /** Includes embedded reviews (there is no separate reviews list endpoint). */
  get: (id) => http.get(`/local-cars/${id}`),
  mine: () => http.get('/local-cars/mine/list'),
  create: (body) => http.post('/local-cars', body),
  update: (id, body) => http.patch(`/local-cars/${id}`, body),
  remove: (id) => http.del(`/local-cars/${id}`),
  uploadPhoto(id, file) {
    const fd = new FormData()
    fd.append('file', file)
    return http.post(`/local-cars/${id}/photo`, fd)
  },
  verify: (id, verified) => http.patch(`/local-cars/${id}/verify`, { verified }),
  review: (id, rating, comment) => http.post(`/local-cars/${id}/reviews`, { rating, comment }),
}

export const rideService = {
  /** -> { feature, status: 'COMING_SOON' | 'LIVE', activeRides, waitlistCount, tagline } */
  status: () => http.get('/rides/status'),
  /** Works signed out. */
  notifyMe: (phone, area) => http.post('/rides/notify-me', { phone, area }),
  /** params: fromStopId, toStopId, date, vehicleType, status */
  list: (params) => http.page('/rides', params),
  get: (id) => http.get(`/rides/${id}`),
  create: (body) => http.post('/rides', body),
  update: (id, body) => http.patch(`/rides/${id}`, body),
  remove: (id) => http.del(`/rides/${id}`),
}

export const bookingService = {
  /** Passengers get their own; admins get everyone's. params: status, type, from, to, userId */
  list: (params) => http.page('/bookings', params),
  get: (id) => http.get(`/bookings/${id}`),
  /** { type: BUS|RIDE|LOCAL_CAR, busId|rideId|localCarId, travelDate, seats, paymentMode }. Amount is server-side. */
  create: (body) => http.post('/bookings', body),
  cancel: (id, reason) => http.patch(`/bookings/${id}/cancel`, { reason }),
  setStatus: (id, status, paymentStatus) => http.patch(`/bookings/${id}/status`, { status, paymentStatus }),
}
