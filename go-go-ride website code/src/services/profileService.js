import { http } from '../api/client'

export const profileService = {
  get: () => http.get('/users/me'),
  /** { name?, email? } */
  update: (body) => http.patch('/users/me', body),
  uploadAvatar(file) {
    const fd = new FormData()
    fd.append('file', file)
    return http.post('/users/me/avatar', fd)
  },
  loginActivity: (params) => http.page('/users/me/login-activity', params),
  /** -> { buses, routes, stops, localCars, raw: [{ id, itemType, itemId }] } */
  favorites: () => http.get('/users/me/favorites'),
  /** itemType: BUS | ROUTE | STOP | LOCAL_CAR */
  addFavorite: (itemType, itemId) => http.post('/users/me/favorites', { itemType, itemId }),
  removeFavorite: (itemType, itemId) => http.del('/users/me/favorites', { itemType, itemId }),
  recentSearches: (limit = 10) => http.get('/users/me/recent-searches', { limit }),
  clearRecentSearches: () => http.del('/users/me/recent-searches'),
  removeRecentSearch: (id) => http.del(`/users/me/recent-searches/${id}`),
}
