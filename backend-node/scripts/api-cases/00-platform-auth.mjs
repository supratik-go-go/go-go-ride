// Platform and sign-in checks.
// These cases come from the comparison with the original Python server, so they are
// read-only GETs and writes that must be rejected: none of them changes the database copy.
export default [
  { name: 'health', path: '/health' },
  { name: 'stats', path: '/stats' },
  { name: 'public settings', path: '/settings' },
  { name: 'unknown route 404', path: '/definitely-not-here', mode: 'status' },
  { name: 'me (passenger)', path: '/auth/me', as: 'passenger' },
  { name: 'me (admin)', path: '/auth/me', as: 'admin' },
  { name: 'me without token', path: '/auth/me', mode: 'status' },
  { name: 'login: bad phone + empty password', method: 'POST', path: '/auth/login', body: { phone: '123', password: '' }, mode: 'status' },
  { name: 'login: wrong password', method: 'POST', path: '/auth/login', body: { phone: '9000000001', password: 'nope' } },
  { name: 'register: existing phone', method: 'POST', path: '/auth/register', body: { name: 'Dup', phone: '9123456789', password: 'secret123' } },
  { name: 'register: missing fields', method: 'POST', path: '/auth/register', body: {}, mode: 'status' },
  { name: 'otp verify: no code requested', method: 'POST', path: '/auth/otp/verify', body: { phone: '9000000002', code: '123456' } },
  { name: 'refresh: garbage token', method: 'POST', path: '/auth/refresh', body: { refreshToken: 'not-a-real-token' } },
  { name: 'change password: wrong current', method: 'POST', path: '/auth/change-password', as: 'driver', body: { currentPassword: 'wrong-one', newPassword: 'whatever1' } },
]
