import { http, tokens } from '../api/client'

// Password + OTP sign-in. Every sign-in call returns { user, accessToken,
// refreshToken }; tokens are stored here so callers only deal with `user`.
function keep(data) {
  tokens.set(data)
  return data
}

export const authService = {
  login: (phone, password) => http.post('/auth/login', { phone, password }).then(keep),
  /** { name, phone, email?, password, role?: PASSENGER|BUS_OWNER|DRIVER } */
  register: (body) => http.post('/auth/register', body).then(keep),
  /** In development the response carries data.devCode - never render it in production. */
  requestOtp: (phone, purpose = 'LOGIN') => http.post('/auth/otp/request', { phone, purpose }),
  /** { phone, code, purpose?, name?, role? } -> { user, isNewUser, ... } */
  verifyOtp: (body) => http.post('/auth/otp/verify', body).then(keep),
  me: () => http.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    http.post('/auth/change-password', { currentPassword, newPassword }),
  async logout() {
    const refreshToken = tokens.refresh
    try {
      if (refreshToken) await http.post('/auth/logout', { refreshToken })
    } catch {
      /* already invalid - clearing locally is enough */
    } finally {
      tokens.clear()
    }
  },
  hasSession: () => Boolean(tokens.access || tokens.refresh),
}
