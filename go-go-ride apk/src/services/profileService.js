import { http } from '../api/client'

export const profileService = {
  get: () => http.get('/users/me'),
  /** Permanent. `password` is needed when the account has one. */
  deleteAccount: (password) => http.del('/users/me', { password }),
  /** { name?, email? } - a new email is not confirmed until its code comes back. */
  update: (body) => http.patch('/users/me', body),
  /** { email, password? } -> { sentTo, expiresInSeconds }; password when the account has one. */
  sendEmailCode: (body) => http.post('/users/me/email/code', body),
  /** The 6-digit code from the email -> the account, with emailConfirmed. */
  confirmEmail: (code) => http.post('/users/me/email/confirm', { code }),
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
