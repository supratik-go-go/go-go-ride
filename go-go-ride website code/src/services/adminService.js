import { http, apiRaw } from '../api/client'

export const adminService = {
  /** from/to: YYYY-MM-DD; omit both for the last 7 days */
  dashboard: (params) => http.get('/admin/dashboard', params),
  activities: (params) => http.page('/admin/activities', params),
  /** Defaults to PENDING + UNDER_REVIEW; pass status for other tabs. */
  busRequests: (params) => http.page('/admin/bus-requests', params),
  /** Rejection requires a reason. */
  setBusStatus: (id, status, reason) => http.patch(`/admin/buses/${id}/status`, { status, reason }),
  users: (params) => http.page('/admin/users', params),
  user: (id) => http.get(`/admin/users/${id}`),
  /** SUPER_ADMIN only */
  createUser: (body) => http.post('/admin/users', body),
  updateUser: (id, body) => http.patch(`/admin/users/${id}`, body),
  /** SUPER_ADMIN only */
  deleteUser: (id) => http.del(`/admin/users/${id}`),
  /** -> { totalRevenue, totalTrips, avgOccupancy, totalDistanceKm, paymentSplit[], series[] } */
  reports: (params) => http.get('/admin/reports', params),
  async exportReport(params) {
    const res = await apiRaw('/admin/reports/export', { params })
    return res.blob()
  },
  settings: () => http.get('/admin/settings'),
  updateSettings: (body) => http.patch('/admin/settings', body),
}

export const platformService = {
  /** -> { buses, routes, stops, users } */
  stats: () => http.get('/stats'),
  settings: () => http.get('/settings'),
  health: () => http.get('/health'),
}
