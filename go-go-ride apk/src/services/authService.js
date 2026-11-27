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
  /** Forgot password: { phone, newPassword, checkId, checkToken } -> signed in. */
  resetPassword: (body) => http.post('/auth/password/reset', body).then(keep),
  /** Forgot password by email: login is the mobile number or email -> { sentTo: 'r***@gmail.com' } */
  requestResetEmail: (login) => http.post('/auth/password/email-code', { login }),
  /** { login, code, newPassword } -> signed in. */
  resetByEmail: (body) => http.post('/auth/password/reset-by-email', body).then(keep),
  me: () => http.get('/auth/me'),
  /** check: { checkId, checkToken } from a mobile number check, once the server asks for one. */
  changePassword: (currentPassword, newPassword, check) =>
    http.post('/auth/change-password', { currentPassword, newPassword, ...check }),

  // Mobile number check by SMS (pages/auth/PhoneCheck.jsx): sign-up and password changes need one
  // once the server has it switched on.
  phoneCheckRequired: () => http.get('/auth/phone-check').then((d) => Boolean(d?.required)),
  /** purpose: REGISTER | RESET | CHANGE (the signed-in account) -> { checkId, checkToken, sendTo, message } */
  startPhoneCheck: (purpose, phone) => http.post('/auth/phone-check/start', { purpose, phone: phone || undefined }),
  /** -> { status: WAITING | VERIFIED | USED | EXPIRED } */
  phoneCheckStatus: ({ checkId, checkToken }) => http.post('/auth/phone-check/status', { checkId, checkToken }),

  /** The Google client ID to sign in with, or null while Google sign-in is off. */
  googleClientId: () => http.get('/auth/google').then((d) => d?.clientId || null),
  /** Sign in with Google: { user, isNewUser, ... }. A new account has no mobile number yet. */
  googleSignIn: (idToken) => http.post('/auth/google', { idToken }).then(keep),
  /** Adds a mobile number to an account that has none: { phone, checkId?, checkToken? } -> user */
  addPhone: (body) => http.post('/users/me/phone', body),
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
