// Features added after the move from the Python server: app version, Local Vehicle types,
// Excel bus import, Add Route Information, games. Runs last; some cases write to the
// throwaway database, and later cases in this file see those writes.

const routeBody = { routeNumber: 's99', notes: 'Test route', stops: [{ stopName: 'Howrah Station' }, { stopName: 'Esplanade' }] }
const vehicle = { driverName: 'Test Tours', phone: '9000099999', area: 'Esplanade', carModel: 'Force Traveller' }

const cases = [
  // ------------------------------------------------------------ platform
  // The version fields change with every release, so only the shape is compared.
  { name: 'app version', path: '/app-version', ignore: ['version', 'versionCode', 'notes', 'sizeMB', 'builtAt'] },
  { name: 'alarm timer without the key', path: '/internal/run-alarms', mode: 'status' },
  { name: 'OTP request (OTP is off)', method: 'POST', path: '/auth/otp/request', body: { phone: '9123456789' }, mode: 'status' },

  // ------------------------------------------------------------ Local Vehicle
  { name: 'local vehicles: Car', path: '/local-cars?vehicleType=CAR' },
  { name: 'local vehicles: Toto/Auto (none yet)', path: '/local-cars?vehicleType=TOTO_AUTO' },
  { name: 'local vehicles: unknown type', path: '/local-cars?vehicleType=PLANE' },
  { name: 'list a tourist bus', method: 'POST', path: '/local-cars', as: 'driver', body: { ...vehicle, vehicleType: 'TOURIST_BUS' }, ignore: ['id'] },
  { name: 'list with no type (becomes Car)', method: 'POST', path: '/local-cars', as: 'driver', body: { ...vehicle, phone: '9000099998' }, ignore: ['id'] },
  { name: 'list with an unknown type', method: 'POST', path: '/local-cars', as: 'driver', body: { ...vehicle, vehicleType: 'PLANE' } },
  { name: 'list signed out', method: 'POST', path: '/local-cars', body: { ...vehicle, vehicleType: 'CAR' } },
  { name: 'local vehicles: Tourist Bus', path: '/local-cars?vehicleType=TOURIST_BUS', ignore: ['id'] },
  { name: 'admin moves a listing to Toto/Auto', method: 'PATCH', path: (ctx) => `/local-cars/${ctx.carId}`, as: 'admin', body: { vehicleType: 'TOTO_AUTO' } },
  { name: 'unknown type on edit', method: 'PATCH', path: (ctx) => `/local-cars/${ctx.carId}`, as: 'admin', body: { vehicleType: 'PLANE' } },
  { name: 'local vehicles: Toto/Auto after the change', path: '/local-cars?vehicleType=TOTO_AUTO' },

  // ------------------------------------------------------------ Excel bus import (no file = rejected)
  { name: 'bus import without a file', method: 'POST', path: '/admin/buses/import', as: 'admin' },
  { name: 'bus import as a passenger', method: 'POST', path: '/admin/buses/import', as: 'passenger' },

  // ------------------------------------------------------------ Add Route Information
  { name: 'route submission signed out', method: 'POST', path: '/route-submissions', body: routeBody },
  { name: 'route submission with one stop', method: 'POST', path: '/route-submissions', as: 'passenger', body: { stops: [{ stopName: 'Howrah Station' }] } },
  { name: 'route submission', method: 'POST', path: '/route-submissions', as: 'passenger', body: routeBody, ignore: ['id'] },
  { name: 'my route submissions', path: '/route-submissions/mine', as: 'passenger', ignore: ['id'] },
  { name: 'route requests (admin)', path: '/admin/route-requests', as: 'admin', ignore: ['id'] },
  { name: 'route requests as a passenger', path: '/admin/route-requests', as: 'passenger' },
  { name: 'review an unknown route request', method: 'PATCH', path: '/admin/route-requests/nope', as: 'admin', body: { status: 'REJECTED' } },
  { name: 'review with a bad status', method: 'PATCH', path: '/admin/route-requests/nope', as: 'admin', body: { status: 'MAYBE' } },

  // ------------------------------------------------------------ games
  { name: 'leaderboard', path: '/games/leaderboard' },
  { name: 'leaderboard signed in', path: '/games/leaderboard', as: 'passenger' },
  { name: 'ping ball best before playing', path: '/games/pingball/best', as: 'passenger' },
  { name: 'ping ball score', method: 'POST', path: '/games/pingball/score', as: 'passenger', body: { score: 120 } },
  { name: 'ping ball score as text', method: 'POST', path: '/games/pingball/score', as: 'passenger', body: { score: '12' } },
  { name: 'ping ball best', path: '/games/pingball/best', as: 'passenger' },
  { name: 'private chess room', method: 'POST', path: '/games/chess/private', as: 'passenger', ignore: ['id', 'code'] },
  { name: 'quick chess match', method: 'POST', path: '/games/chess/quick', as: 'driver', ignore: ['id', 'code'] },
  { name: 'quick match signed out', method: 'POST', path: '/games/chess/quick' },
  { name: 'unknown game', method: 'POST', path: '/games/snakes/quick', as: 'passenger' },
  { name: 'join with a wrong code', method: 'POST', path: '/games/rooms/join', as: 'owner', body: { code: 'ZZZZZZ' } },
  { name: 'open an unknown room', path: '/games/rooms/nope', as: 'passenger' },
  { name: 'move in an unknown room', method: 'POST', path: '/games/rooms/nope/move', as: 'passenger', body: {} },
  { name: 'leave an unknown room', method: 'POST', path: '/games/rooms/nope/leave', as: 'passenger' },

  // ------------------------------------------------------------ last: sign out
  { name: 'logout without a refresh token', method: 'POST', path: '/auth/logout', as: 'passenger', mode: 'status' },
]

export default cases
