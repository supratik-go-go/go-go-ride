// Admin panel parity cases (app/api/admin.py + app/services/reports.py).
//
// Read-only GETs plus write requests that MUST fail on the live Python API
// (permission, validation, not-found and conflict checks that run before any write).
// Every write case below is rejected before the handler touches the database;
// bodies are chosen so that even a wrong guess would be a no-op.
//
// This harness compares JSON, so the CSV export's text is checked separately
// (only its status is compared here).

const NO_USER = 'cdoesnotexist000000000000'
const NO_BUS = 'cnobushere00000000000000'

// Accounts the harness signs in with get a new login row on every run, so the
// live database has more of them than a fresh copy: skip `logins` for those.
const LOGGED_IN = ['passenger', 'owner', 'driver', 'admin', 'super']

const ranges = [
  ['2026-09-01', '2026-09-30'],
  ['2026-09-15', '2026-09-21'],
  ['2026-09-18', '2026-09-18'],
  ['2026-09-20', null],
  [null, '2026-09-20'],
  ['2026-09-30', '2026-09-01'], // reversed: empty window
  ['2025-12-01', '2026-12-31'],
]
const q = ([from, to]) => [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&')

export default [
  // ------------------------------------------------------------ dashboard
  { name: 'dashboard (default window)', path: '/admin/dashboard', as: 'admin' },
  { name: 'dashboard (super admin)', path: '/admin/dashboard', as: 'super' },
  ...ranges.map((r) => ({ name: `dashboard ${q(r)}`, path: `/admin/dashboard?${q(r)}`, as: 'admin' })),
  { name: 'dashboard with ISO datetime bounds', path: '/admin/dashboard?from=2026-09-15T10:00:00&to=2026-09-21T23:59:59Z', as: 'admin' },
  { name: 'dashboard with offset + space-separated bounds', path: '/admin/dashboard?from=2026-09-16T02:00:00%2B05:30&to=2026-09-21%2010:00', as: 'admin' },
  { name: 'dashboard with empty bounds (defaults)', path: '/admin/dashboard?from=&to=', as: 'admin' },
  // (an unparseable date is a bare 500 in Python and a 400 here - checked separately)
  { name: 'dashboard as passenger -> 403', path: '/admin/dashboard', as: 'passenger' },
  { name: 'dashboard as owner -> 403', path: '/admin/dashboard', as: 'owner' },
  { name: 'dashboard without token -> 401', path: '/admin/dashboard' },

  // ------------------------------------------------------------ activities
  { name: 'activities', path: '/admin/activities', as: 'admin' },
  { name: 'activities page 2 (limit 4)', path: '/admin/activities?limit=4&page=2', as: 'admin' },
  { name: 'activities page 3 (limit 4)', path: '/admin/activities?limit=4&page=3', as: 'admin' },
  { name: 'activities past the end', path: '/admin/activities?limit=50&page=9', as: 'admin' },
  { name: 'activities bad paging', path: '/admin/activities?page=0&limit=101&order=up', as: 'admin' },
  { name: 'activities page=abc', path: '/admin/activities?page=abc', as: 'admin' },
  { name: 'activities as driver -> 403', path: '/admin/activities', as: 'driver' },

  // ------------------------------------------------------------ bus requests
  { name: 'bus-requests (default queue)', path: '/admin/bus-requests', as: 'admin' },
  ...['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].map((s) => ({
    name: `bus-requests status=${s}`,
    path: `/admin/bus-requests?status=${s}`,
    as: 'admin',
  })),
  { name: 'bus-requests search bus number (lower case)', path: '/admin/bus-requests?search=wb%2019', as: 'admin' },
  { name: 'bus-requests search owner name', path: '/admin/bus-requests?search=mondal', as: 'admin' },
  { name: 'bus-requests APPROVED + owner search', path: '/admin/bus-requests?status=APPROVED&search=rakesh', as: 'admin' },
  { name: 'bus-requests APPROVED paged', path: '/admin/bus-requests?status=APPROVED&limit=2&page=2', as: 'admin' },
  { name: 'bus-requests invalid status', path: '/admin/bus-requests?status=FOO', as: 'admin' },
  { name: 'bus-requests empty status', path: '/admin/bus-requests?status=', as: 'admin' },
  { name: 'bus-requests as owner -> 403', path: '/admin/bus-requests', as: 'owner' },

  // ------------------------------------------------------------ users
  { name: 'users', path: '/admin/users', as: 'admin' },
  ...['PASSENGER', 'BUS_OWNER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN'].map((r) => ({
    name: `users role=${r}`,
    path: `/admin/users?role=${r}`,
    as: 'admin',
  })),
  ...['ACTIVE', 'INACTIVE', 'BLOCKED'].map((s) => ({ name: `users status=${s}`, path: `/admin/users?status=${s}`, as: 'admin' })),
  { name: 'users role + status', path: '/admin/users?role=BUS_OWNER&status=ACTIVE', as: 'admin' },
  { name: 'users search name', path: '/admin/users?search=das', as: 'admin' },
  { name: 'users search phone', path: '/admin/users?search=98765', as: 'admin' },
  { name: 'users search email', path: '/admin/users?search=gmail', as: 'admin' },
  { name: 'users search blank', path: '/admin/users?search=%20%20', as: 'admin' },
  { name: 'users page 2 (limit 5)', path: '/admin/users?limit=5&page=2', as: 'admin' },
  { name: 'users page 3 (limit 5)', path: '/admin/users?limit=5&page=3', as: 'admin' },
  { name: 'users page=1.0 + " 2"', path: '/admin/users?page=%202&limit=3.0', as: 'admin' },
  { name: 'users invalid role/status/page', path: '/admin/users?role=KING&status=GONE&page=0', as: 'admin' },
  { name: 'users empty role', path: '/admin/users?role=', as: 'admin' },
  { name: 'users limit too large', path: '/admin/users?limit=1000&order=sideways', as: 'admin' },
  { name: 'users as passenger -> 403', path: '/admin/users', as: 'passenger' },

  // ------------------------------------------------------------ user detail
  ...[0, 4, 5, 6, 7, 9, 10, 11, 13].map((i) => ({
    name: `user detail #${i}`,
    path: (ctx) => (ctx.userIds[i] ? `/admin/users/${ctx.userIds[i]}` : undefined),
    as: 'admin',
  })),
  ...LOGGED_IN.map((role) => ({
    name: `user detail (${role}, logins ignored)`,
    path: (ctx) => `/admin/users/${ctx.users[role].id}`,
    as: 'admin',
    ignore: ['logins'],
  })),
  { name: 'user detail not found', path: `/admin/users/${NO_USER}`, as: 'admin' },
  { name: 'user detail as owner -> 403', path: (ctx) => `/admin/users/${ctx.users.owner.id}`, as: 'owner' },

  // ------------------------------------------------------------ reports
  { name: 'reports (default window)', path: '/admin/reports', as: 'admin' },
  ...ranges.map((r) => ({ name: `reports ${q(r)}`, path: `/admin/reports?${q(r)}`, as: 'admin' })),
  { name: 'reports as super', path: '/admin/reports?from=2026-09-10&to=2026-09-25', as: 'super' },
  { name: 'reports as passenger -> 403', path: '/admin/reports', as: 'passenger' },
  { name: 'reports export status', path: '/admin/reports/export?from=2026-09-01&to=2026-09-30', as: 'admin', mode: 'status' },
  { name: 'reports export as owner -> 403', path: '/admin/reports/export', as: 'owner' },

  // ------------------------------------------------------------ settings
  { name: 'settings', path: '/admin/settings', as: 'admin' },
  { name: 'settings (super)', path: '/admin/settings', as: 'super' },
  { name: 'settings as passenger -> 403', path: '/admin/settings', as: 'passenger' },

  // ------------------------------------------------------------ writes that must fail
  // bus status
  { name: 'bus status as passenger -> 403', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'passenger', body: { status: 'REJECTED' } },
  { name: 'bus status reject without reason', method: 'PATCH', path: (ctx) => `/admin/buses/${ctx.pendingBusId}/status`, as: 'admin', body: { status: 'REJECTED' } },
  { name: 'bus status reject with blank reason', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: { status: 'REJECTED', reason: '   ' } },
  { name: 'bus status unknown bus', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: { status: 'APPROVED' } },
  { name: 'bus status invalid status', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: { status: 'BAD' } },
  { name: 'bus status wrong types', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: { status: 5, reason: 7 } },
  { name: 'bus status empty body', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: {} },
  { name: 'bus status no body', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin' },
  { name: 'bus status array body', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: [1] },
  { name: 'bus status reason too long', method: 'PATCH', path: `/admin/buses/${NO_BUS}/status`, as: 'admin', body: { status: 'REJECTED', reason: 'x'.repeat(301) } },

  // create user
  { name: 'create user as admin -> 403', method: 'POST', path: '/admin/users', as: 'admin', body: { name: 'Nope Admin', phone: '9123456789', role: 'DRIVER', password: 'secret123' } },
  { name: 'create user as passenger -> 403', method: 'POST', path: '/admin/users', as: 'passenger', body: { name: 'Nope', phone: '9123456789', role: 'DRIVER', password: 'secret123' } },
  { name: 'create user empty body', method: 'POST', path: '/admin/users', as: 'super', body: {} },
  { name: 'create user invalid fields', method: 'POST', path: '/admin/users', as: 'super', body: { name: ' A ', phone: '12', email: 5, role: 'KING', password: '  12345  ' } },
  { name: 'create user null fields', method: 'POST', path: '/admin/users', as: 'super', body: { name: null, phone: null, role: null, password: null } },
  { name: 'create user existing phone -> 409', method: 'POST', path: '/admin/users', as: 'super', body: { name: 'Dup Rider', phone: '+91 91234-56789', role: 'DRIVER', password: 'secret123' } },

  // update user
  { name: 'admin edits super admin -> 403', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.super.id}`, as: 'admin', body: (ctx) => ({ name: ctx.users.super.name }) },
  { name: 'admin grants admin role -> 403', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.passenger.id}`, as: 'admin', body: { role: 'ADMIN' } },
  { name: 'admin grants super admin role -> 403', method: 'PATCH', path: `/admin/users/${NO_USER}`, as: 'admin', body: { role: 'SUPER_ADMIN' } },
  { name: 'admin changes own role -> 400', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.admin.id}`, as: 'admin', body: { role: 'PASSENGER' } },
  { name: 'super changes own role -> 400', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.super.id}`, as: 'super', body: { role: 'ADMIN' } },
  { name: 'admin blocks self -> 400', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.admin.id}`, as: 'admin', body: { status: 'BLOCKED' } },
  { name: 'update unknown user -> 404', method: 'PATCH', path: `/admin/users/${NO_USER}`, as: 'super', body: { name: 'Valid Name' } },
  { name: 'update user invalid fields', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.passenger.id}`, as: 'super', body: { name: 'A', email: 3, role: 'KING', status: 'GONE' } },
  { name: 'update user as passenger -> 403', method: 'PATCH', path: (ctx) => `/admin/users/${ctx.users.passenger.id}`, as: 'passenger', body: { status: 'ACTIVE' } },

  // delete user
  { name: 'delete user as admin -> 403', method: 'DELETE', path: `/admin/users/${NO_USER}`, as: 'admin' },
  { name: 'super deletes self -> 400', method: 'DELETE', path: (ctx) => `/admin/users/${ctx.users.super.id}`, as: 'super' },
  { name: 'delete unknown user -> 404', method: 'DELETE', path: `/admin/users/${NO_USER}`, as: 'super' },

  // settings
  { name: 'settings save as passenger -> 403', method: 'PATCH', path: '/admin/settings', as: 'passenger', body: { platformName: 'Nope' } },
  { name: 'settings invalid fields', method: 'PATCH', path: '/admin/settings', as: 'admin', body: { platformName: 'A', contactNumber: '1'.repeat(21), currency: 5, timeFormat: '13h' } },
  { name: 'settings array body', method: 'PATCH', path: '/admin/settings', as: 'admin', body: ['x'] },
]
