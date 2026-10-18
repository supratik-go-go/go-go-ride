// Alarms, local cars, rides and bookings parity cases (read-only or expected-failure requests only).
//
// SAFETY: the Python service runs on the LIVE database. Every non-GET case below must be
// rejected by Python whatever the live data looks like, before anything is written:
//   - body / query validation errors (checked before the handler runs),
//   - no token (401) or a role check (403 from AdminUser),
//   - ids that cannot exist ('nope'),
//   - ownership that no endpoint can change (Alarm.userId, Booking.userId, LocalCar.ownerId),
//   - "same stop twice" (sequence >= sequence is always true),
//   - business-rule cases on real rows only when guarded by live data read via ctx
//     (the case is SKIPPED otherwise) or backed by a second id that cannot exist
//     (the INSERT would fail its foreign key and roll back).
// Rules that depend on mutable state (bus status / service days, booking status, ride seats)
// are exercised against the private Node instance only (see the write-test script).
// Ids are the seeded ones (the live database was seeded from the same starter data).
const BUS_S12 = 'cmua7ihe6001sx4rgeb0nvsvb' // APPROVED, every day: Howrah Station(1) .. Esplanade(5)
const BUS_PENDING = 'cmua7ihea002d588oboolxc95' // PENDING
const STOP_HOWRAH = 'cmua7ihdx000e1j9kasf7h8qe'
const STOP_ESPLANADE = 'cmua7ihdx000isb1mz8nyi6x0'
const STOP_DUMDUM = 'cmua7ihdx000lv8ka5i5ahtj3' // not on S12
const RIDE = 'cmua7ihf5003nvbb3hiuajk2w' // driver 9000011223, 3 of 4 seats left
const CAR_DRIVER = 'cmua7ihf3003h3t4alvckh8n5' // owned by the driver account
const CAR_UNOWNED = 'cmua7ihf3003jw0idjtxwqzmn' // ownerId null
const PASSENGER_ID = 'cmua7ig2h0008af67g99rwmsv'
const OTHER_BOOKING = 'cmua7ihf8003sa7bprf2bkc3t' // belongs to another passenger
const MY_CANCELLED = 'cmua7ihf8003rxc29udksdsac'
const ALARM = 'cmua7ihf00037cc5i7es1tslc' // passenger's (EXPIRED)

/** First date strictly more than a week ahead that falls on `weekday` (0 = Sunday). */
function ahead(ctx, weekday) {
  const d = new Date(`${ctx.today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 8)
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const wednesday = (ctx) => ahead(ctx, 3)

/** Sequence of a stop on the live S12 timetable (ctx.bus is read from Python just before the run), or null. */
function s12Seq(ctx, stopId) {
  if (ctx.bus?.id !== BUS_S12) return undefined // unknown -> the guarded case is skipped
  const s = (ctx.bus.stopages || []).find((x) => x.stopId === stopId)
  return s ? s.sequence : null
}
/** Path when the live data guarantees the rejection, else null (the harness skips the case). */
const guard = (ok) => (ok ? '/alarms' : null)

export default [
  // ------------------------------------------------------------ alarms: reads
  { name: 'alarms: mine', path: '/alarms', as: 'passenger' },
  { name: 'alarms: ACTIVE', path: '/alarms?status=ACTIVE', as: 'passenger' },
  { name: 'alarms: EXPIRED', path: '/alarms?status=EXPIRED', as: 'passenger' },
  { name: 'alarms: TRIGGERED', path: '/alarms?status=TRIGGERED', as: 'passenger' },
  { name: 'alarms: CANCELLED', path: '/alarms?status=CANCELLED', as: 'passenger' },
  { name: 'alarms: page 2 of 1', path: '/alarms?limit=1&page=2', as: 'passenger' },
  { name: 'alarms: admin has none', path: '/alarms', as: 'admin' },
  { name: 'alarms: bad status', path: '/alarms?status=FOO', as: 'passenger' },
  { name: 'alarms: bad paging + status (all errors)', path: '/alarms?status=FOO&page=0&limit=500', as: 'passenger' },
  { name: 'alarms: page=abc', path: '/alarms?page=abc', as: 'passenger' },
  { name: 'alarms: no token', path: '/alarms' },

  // ------------------------------------------------------------ alarms: failing writes
  { name: 'alarm create: empty body', method: 'POST', path: '/alarms', as: 'passenger', body: {} },
  {
    name: 'alarm create: bad types',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: { busId: 1, boardingStopId: 'x', arrivalStopId: 'y', date: '2026-1-1', remindBeforeMin: 10 },
  },
  {
    name: 'alarm create: bad remindBeforeMin',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_ESPLANADE, date: wednesday(ctx), remindBeforeMin: 10 }),
  },
  {
    name: 'alarm create: remindBeforeMin as string',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_ESPLANADE, date: wednesday(ctx), remindBeforeMin: '15' }),
  },
  {
    name: 'alarm create: past date',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: { busId: BUS_S12, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_ESPLANADE, date: '2026-01-01', remindBeforeMin: 15 },
  },
  {
    name: 'alarm create: unknown bus',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: (ctx) => ({ busId: 'nope', boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_ESPLANADE, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  {
    name: 'alarm create: bus not approved',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    // Same stop twice: rejected even if the bus were approved meanwhile.
    body: (ctx) => ({ busId: BUS_PENDING, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_HOWRAH, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  {
    name: 'alarm create: boarding stop not on the bus',
    method: 'POST',
    path: (ctx) => guard(s12Seq(ctx, STOP_DUMDUM) === null),
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_DUMDUM, arrivalStopId: STOP_ESPLANADE, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  {
    name: 'alarm create: arrival stop not on the bus',
    method: 'POST',
    path: (ctx) => guard(s12Seq(ctx, STOP_DUMDUM) === null && s12Seq(ctx, STOP_HOWRAH) != null),
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_DUMDUM, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  {
    name: 'alarm create: wrong stop order',
    method: 'POST',
    path: (ctx) => guard(s12Seq(ctx, STOP_HOWRAH) != null && s12Seq(ctx, STOP_ESPLANADE) != null && s12Seq(ctx, STOP_ESPLANADE) > s12Seq(ctx, STOP_HOWRAH)),
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_ESPLANADE, arrivalStopId: STOP_HOWRAH, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  {
    name: 'alarm create: same stop twice',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    body: (ctx) => ({ busId: BUS_S12, boardingStopId: STOP_HOWRAH, arrivalStopId: STOP_HOWRAH, date: wednesday(ctx), remindBeforeMin: 15 }),
  },
  { name: 'alarm create: no token', method: 'POST', path: '/alarms', body: {} },
  { name: 'alarm update: unknown', method: 'PATCH', path: '/alarms/nope', as: 'passenger', body: { remindBeforeMin: 5 } },
  { name: 'alarm update: bad remindBeforeMin', method: 'PATCH', path: `/alarms/${ALARM}`, as: 'passenger', body: { remindBeforeMin: 7 } },
  { name: 'alarm update: status EXPIRED not allowed', method: 'PATCH', path: `/alarms/${ALARM}`, as: 'passenger', body: { status: 'EXPIRED' } },
  { name: 'alarm update: someone else\'s alarm', method: 'PATCH', path: `/alarms/${ALARM}`, as: 'driver', body: {} },
  { name: 'alarm update: no body', method: 'PATCH', path: `/alarms/${ALARM}`, as: 'passenger' },
  { name: 'alarm delete: unknown', method: 'DELETE', path: '/alarms/nope', as: 'passenger' },
  { name: 'alarm delete: someone else\'s alarm', method: 'DELETE', path: `/alarms/${ALARM}`, as: 'driver' },

  // ------------------------------------------------------------ local cars: reads
  { name: 'cars: list', path: '/local-cars' },
  { name: 'cars: list (logged in)', path: '/local-cars', as: 'passenger' },
  { name: 'cars: area', path: '/local-cars?area=Howrah' },
  { name: 'cars: area case-insensitive', path: '/local-cars?area=salt' },
  { name: 'cars: area empty', path: '/local-cars?area=' },
  { name: 'cars: verified=true', path: '/local-cars?verified=true' },
  { name: 'cars: verified=false', path: '/local-cars?verified=false' },
  { name: 'cars: verified=yes', path: '/local-cars?verified=yes' },
  { name: 'cars: verified=0', path: '/local-cars?verified=0' },
  { name: 'cars: minRating=4.5', path: '/local-cars?minRating=4.5' },
  { name: 'cars: minRating=4.7 verified', path: '/local-cars?minRating=4.7&verified=true' },
  { name: 'cars: minRating=5', path: '/local-cars?minRating=5' },
  { name: 'cars: search model', path: '/local-cars?search=Dzire' },
  { name: 'cars: search driver lower-case', path: '/local-cars?search=amit' },
  { name: 'cars: search area', path: '/local-cars?search=Belur' },
  { name: 'cars: search blank', path: '/local-cars?search=%20%20' },
  { name: 'cars: page 2 of 2', path: '/local-cars?limit=2&page=2' },
  { name: 'cars: limit 1', path: '/local-cars?limit=1' },
  { name: 'cars: page 2.0', path: '/local-cars?page=2.0&limit=3' },
  { name: 'cars: beyond last page', path: '/local-cars?page=9' },
  { name: 'cars: bad minRating', path: '/local-cars?minRating=abc' },
  { name: 'cars: minRating out of range + bad verified', path: '/local-cars?minRating=6&verified=maybe' },
  { name: 'cars: minRating negative', path: '/local-cars?minRating=-1' },
  { name: 'cars: verified empty', path: '/local-cars?verified=' },
  { name: 'cars: page=1.5', path: '/local-cars?page=1.5' },
  { name: 'cars: order=up', path: '/local-cars?order=up' },
  { name: 'cars: detail', path: (ctx) => `/local-cars/${ctx.carId}` },
  { name: 'cars: detail unowned', path: `/local-cars/${CAR_UNOWNED}` },
  { name: 'cars: detail unknown', path: '/local-cars/nope' },
  { name: 'cars: "mine" is not an id', path: '/local-cars/mine' },
  { name: 'cars: mine (driver)', path: '/local-cars/mine/list', as: 'driver' },
  { name: 'cars: mine (passenger)', path: '/local-cars/mine/list', as: 'passenger' },
  { name: 'cars: mine (owner)', path: '/local-cars/mine/list', as: 'owner' },
  { name: 'cars: mine without token', path: '/local-cars/mine/list' },

  // ------------------------------------------------------------ local cars: failing writes
  { name: 'car create: empty body', method: 'POST', path: '/local-cars', as: 'passenger', body: {} },
  {
    name: 'car create: every field wrong',
    method: 'POST',
    path: '/local-cars',
    as: 'passenger',
    body: { driverName: 'A', phone: '123', area: 'x', carModel: 5, availableFrom: '25:00', availableTo: '7:00', status: 'GONE' },
  },
  { name: 'car create: stripped values too short', method: 'POST', path: '/local-cars', as: 'passenger', body: { driverName: '  ab  ', phone: 12345, area: '  x  ' } },
  { name: 'car create: no token', method: 'POST', path: '/local-cars', body: {} },
  { name: 'car update: unknown', method: 'PATCH', path: '/local-cars/nope', as: 'passenger', body: {} },
  { name: 'car update: not the owner', method: 'PATCH', path: `/local-cars/${CAR_DRIVER}`, as: 'passenger', body: {} },
  { name: 'car update: unowned car, not admin', method: 'PATCH', path: `/local-cars/${CAR_UNOWNED}`, as: 'passenger', body: {} },
  {
    name: 'car update: invalid body (validated before ownership)',
    method: 'PATCH',
    path: `/local-cars/${CAR_DRIVER}`,
    as: 'passenger',
    body: { driverName: 'A', availableFrom: 'x', status: 'NO' },
  },
  { name: 'car update: no body', method: 'PATCH', path: `/local-cars/${CAR_DRIVER}`, as: 'passenger' },
  { name: 'car delete: not the owner', method: 'DELETE', path: `/local-cars/${CAR_DRIVER}`, as: 'passenger' },
  { name: 'car delete: unknown', method: 'DELETE', path: '/local-cars/nope', as: 'passenger' },
  { name: 'car verify: not admin', method: 'PATCH', path: `/local-cars/${CAR_DRIVER}/verify`, as: 'passenger', body: { verified: true } },
  { name: 'car verify: not admin, bad body', method: 'PATCH', path: `/local-cars/${CAR_DRIVER}/verify`, as: 'driver', body: { verified: 'maybe' } },
  { name: 'car verify: bad boolean', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 'maybe' } },
  { name: 'car verify: number 2', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 2 } },
  { name: 'car verify: null', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: null } },
  { name: 'car verify: missing', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: {} },
  { name: 'car verify: unknown car ("yes")', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 'yes' } },
  { name: 'car review: unknown car', method: 'POST', path: '/local-cars/nope/reviews', as: 'passenger', body: { rating: 3 } },
  { name: 'car review: rating 6 + bad comment', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: { rating: 6, comment: 5 } },
  { name: 'car review: rating 4.5', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: { rating: 4.5 } },
  { name: 'car review: rating "4.5"', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: { rating: '4.5' } },
  { name: 'car review: rating 0', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: { rating: 0 } },
  { name: 'car review: comment too long', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: { rating: 4, comment: 'x'.repeat(501) } },
  { name: 'car review: missing rating', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, as: 'passenger', body: {} },
  { name: 'car review: no token', method: 'POST', path: `/local-cars/${CAR_DRIVER}/reviews`, body: { rating: 4 } },
  { name: 'car photo: no file', method: 'POST', path: `/local-cars/${CAR_DRIVER}/photo`, as: 'passenger' },
  { name: 'car photo: unknown car, no file', method: 'POST', path: '/local-cars/nope/photo', as: 'admin' },

  // ------------------------------------------------------------ rides: reads
  { name: 'rides: status', path: '/rides/status' },
  { name: 'rides: list (upcoming only)', path: '/rides' },
  { name: 'rides: date=2026-09-22', path: '/rides?date=2026-09-22' },
  { name: 'rides: date=2026-09-22 as passenger', path: '/rides?date=2026-09-22', as: 'passenger' },
  { name: 'rides: date=2026-09-21 (none)', path: '/rides?date=2026-09-21' },
  { name: 'rides: date with time window', path: '/rides?date=2026-09-22T05:00:00' },
  { name: 'rides: date with time after departure', path: '/rides?date=2026-09-22T10:00:00' },
  { name: 'rides: date with offset', path: '/rides?date=2026-09-21T20:00:00%2B05:30' },
  { name: 'rides: date + fromStopId', path: `/rides?date=2026-09-22&fromStopId=${STOP_HOWRAH}` },
  { name: 'rides: date + fromStopId mismatch', path: `/rides?date=2026-09-22&fromStopId=${STOP_ESPLANADE}` },
  { name: 'rides: date + toStopId', path: `/rides?date=2026-09-22&toStopId=${STOP_ESPLANADE}` },
  { name: 'rides: date + vehicleType CAR', path: '/rides?date=2026-09-22&vehicleType=CAR' },
  { name: 'rides: date + vehicleType BIKE', path: '/rides?date=2026-09-22&vehicleType=BIKE' },
  { name: 'rides: date + status SCHEDULED', path: '/rides?date=2026-09-22&status=SCHEDULED' },
  { name: 'rides: date + status COMPLETED', path: '/rides?date=2026-09-22&status=COMPLETED' },
  { name: 'rides: date + page 2', path: '/rides?date=2026-09-22&page=2&limit=1' },
  { name: 'rides: empty date = upcoming', path: '/rides?date=' },
  { name: 'rides: bad vehicleType + status', path: '/rides?status=X&vehicleType=Y' },
  { name: 'rides: status empty', path: '/rides?status=' },
  { name: 'rides: detail', path: (ctx) => `/rides/${ctx.rideId}` },
  { name: 'rides: detail as driver', path: `/rides/${RIDE}`, as: 'driver' },
  { name: 'rides: detail unknown', path: '/rides/nope' },
  { name: 'rides: GET notify-me is a ride id', path: '/rides/notify-me' },

  // ------------------------------------------------------------ rides: failing writes
  { name: 'ride create: empty body', method: 'POST', path: '/rides', as: 'driver', body: {} },
  {
    name: 'ride create: same stops',
    method: 'POST',
    path: '/rides',
    as: 'driver',
    body: { fromStopId: STOP_HOWRAH, toStopId: STOP_HOWRAH, departureAt: '2026-12-01T10:00:00Z', farePerSeat: 50 },
  },
  {
    name: 'ride create: invalid fields',
    method: 'POST',
    path: '/rides',
    as: 'driver',
    body: { fromStopId: 'a', toStopId: 'b', departureAt: 5, farePerSeat: -1, totalSeats: 9, vehicleType: 'BUS' },
  },
  {
    name: 'ride create: bad fare string',
    method: 'POST',
    path: '/rides',
    as: 'driver',
    body: { fromStopId: 'a', toStopId: 'b', departureAt: 'x', farePerSeat: 'abc', totalSeats: '3' },
  },
  { name: 'ride create: no token', method: 'POST', path: '/rides', body: {} },
  { name: 'ride update: unknown', method: 'PATCH', path: '/rides/nope', as: 'driver', body: {} },
  { name: 'ride update: not the driver', method: 'PATCH', path: `/rides/${RIDE}`, as: 'passenger', body: {} }, // driverId is editable: an empty body is a no-op either way
  { name: 'ride update: invalid body', method: 'PATCH', path: `/rides/${RIDE}`, as: 'passenger', body: { status: 'X', totalSeats: 0 } },
  { name: 'ride delete: not admin', method: 'DELETE', path: `/rides/${RIDE}`, as: 'driver' },
  { name: 'ride delete: unknown', method: 'DELETE', path: '/rides/nope', as: 'admin' },
  { name: 'notify-me: empty', method: 'POST', path: '/rides/notify-me', body: {} },
  { name: 'notify-me: bad phone + area', method: 'POST', path: '/rides/notify-me', body: { phone: '123', area: 5 } },
  { name: 'notify-me: area too long', method: 'POST', path: '/rides/notify-me', as: 'passenger', body: { phone: '9123456789', area: 'x'.repeat(81) } },

  // ------------------------------------------------------------ bookings: reads
  { name: 'bookings: mine', path: '/bookings', as: 'passenger' },
  { name: 'bookings: mine page 2', path: '/bookings?limit=3&page=2', as: 'passenger' },
  { name: 'bookings: mine CONFIRMED', path: '/bookings?status=CONFIRMED', as: 'passenger' },
  { name: 'bookings: mine CANCELLED', path: '/bookings?status=CANCELLED', as: 'passenger' },
  { name: 'bookings: mine COMPLETED', path: '/bookings?status=COMPLETED', as: 'passenger' },
  { name: 'bookings: mine PENDING', path: '/bookings?status=PENDING', as: 'passenger' },
  { name: 'bookings: mine type BUS', path: '/bookings?type=BUS', as: 'passenger' },
  { name: 'bookings: mine type RIDE', path: '/bookings?type=RIDE', as: 'passenger' },
  { name: 'bookings: mine type LOCAL_CAR', path: '/bookings?type=LOCAL_CAR', as: 'passenger' },
  { name: 'bookings: mine from', path: '/bookings?from=2026-09-18', as: 'passenger' },
  { name: 'bookings: mine to', path: '/bookings?to=2026-09-16', as: 'passenger' },
  { name: 'bookings: mine from+to', path: '/bookings?from=2026-09-16&to=2026-09-18', as: 'passenger' },
  { name: 'bookings: mine from with offset', path: '/bookings?from=2026-09-19T02:00:00%2B05:30', as: 'passenger' },
  { name: 'bookings: mine userId ignored', path: '/bookings?userId=cmua7ig2h0009bwu7ytsbe46m', as: 'passenger' },
  { name: 'bookings: driver has none', path: '/bookings', as: 'driver' },
  { name: 'bookings: admin all', path: '/bookings', as: 'admin' },
  { name: 'bookings: admin page 2', path: '/bookings?page=2', as: 'admin' },
  { name: 'bookings: admin page 3', path: '/bookings?page=3', as: 'admin' },
  { name: 'bookings: admin limit 100', path: '/bookings?limit=100', as: 'admin' },
  { name: 'bookings: admin by user', path: `/bookings?userId=${PASSENGER_ID}`, as: 'admin' },
  { name: 'bookings: admin by user + status', path: `/bookings?userId=${PASSENGER_ID}&status=CONFIRMED`, as: 'admin' },
  { name: 'bookings: admin COMPLETED', path: '/bookings?status=COMPLETED', as: 'super' },
  { name: 'bookings: admin type+dates', path: '/bookings?type=BUS&from=2026-09-17&to=2026-09-19&limit=50', as: 'admin' },
  { name: 'bookings: admin empty userId', path: '/bookings?userId=&limit=5', as: 'admin' },
  { name: 'bookings: bad status + type', path: '/bookings?status=X&type=Y', as: 'passenger' },
  { name: 'bookings: no token', path: '/bookings' },
  { name: 'booking detail: mine', path: (ctx) => `/bookings/${ctx.bookingId}`, as: 'passenger' },
  { name: 'booking detail: mine cancelled', path: `/bookings/${MY_CANCELLED}`, as: 'passenger' },
  { name: 'booking detail: someone else\'s', path: `/bookings/${OTHER_BOOKING}`, as: 'passenger' },
  { name: 'booking detail: admin sees any', path: `/bookings/${OTHER_BOOKING}`, as: 'admin' },
  { name: 'booking detail: unknown', path: '/bookings/nope', as: 'passenger' },

  // ------------------------------------------------------------ bookings: failing writes
  { name: 'book: empty body', method: 'POST', path: '/bookings', as: 'passenger', body: {} },
  { name: 'book: missing id for type', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', travelDate: '2026-12-01' } },
  { name: 'book: id of another type', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'RIDE', busId: 'x', travelDate: '2026-12-01' } },
  { name: 'book: blank id', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: '  ', travelDate: '2026-12-01' } },
  {
    name: 'book: bad enums + seats',
    method: 'POST',
    path: '/bookings',
    as: 'passenger',
    body: { type: 'CAB', travelDate: '2026-12-01', seats: 0, paymentMode: 'BTC' },
  },
  { name: 'book: seats 11', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'x', travelDate: '2026-12-01', seats: 11 } },
  { name: 'book: seats 2.5', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'x', travelDate: '2026-12-01', seats: 2.5 } },
  { name: 'book: seats null', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'x', travelDate: '2026-12-01', seats: null } },
  { name: 'book: datetime travelDate', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'x', travelDate: '2026-12-01T10:00:00' } },
  { name: 'book: null type/date', method: 'POST', path: '/bookings', as: 'passenger', body: { type: null, busId: 'x', travelDate: null } },
  { name: 'book: past date', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: BUS_S12, travelDate: '2026-01-01' } },
  { name: 'book: unknown bus', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', seats: '2' } },
  { name: 'book: bus not approved', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: BUS_PENDING, rideId: 'nope', travelDate: '2026-12-01' } }, // rideId backstop: FK failure if the bus were approved
  { name: 'book: unknown ride', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'RIDE', rideId: 'nope', travelDate: '2026-12-01' } },
  { name: 'book: ride too few seats', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'RIDE', rideId: RIDE, busId: 'nope', travelDate: '2026-12-01', seats: 10 } }, // busId backstop
  { name: 'book: unknown local car', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'LOCAL_CAR', localCarId: 'nope', travelDate: '2026-12-01' } },
  { name: 'book: no token', method: 'POST', path: '/bookings', body: {} },
  { name: 'cancel: no body', method: 'PATCH', path: '/bookings/nope/cancel', as: 'passenger' },
  { name: 'cancel: unknown', method: 'PATCH', path: '/bookings/nope/cancel', as: 'passenger', body: {} },
  { name: 'cancel: bad reason type', method: 'PATCH', path: '/bookings/nope/cancel', as: 'passenger', body: { reason: 5 } },
  { name: 'cancel: reason too long', method: 'PATCH', path: `/bookings/${OTHER_BOOKING}/cancel`, as: 'passenger', body: { reason: 'x'.repeat(201) } },
  { name: 'cancel: someone else\'s', method: 'PATCH', path: `/bookings/${OTHER_BOOKING}/cancel`, as: 'passenger', body: {} },
  { name: 'status: not admin', method: 'PATCH', path: `/bookings/${OTHER_BOOKING}/status`, as: 'passenger', body: { status: 'COMPLETED' } },
  { name: 'status: bad value', method: 'PATCH', path: '/bookings/nope/status', as: 'admin', body: { status: 'PAID' } },
  { name: 'status: bad paymentStatus', method: 'PATCH', path: '/bookings/nope/status', as: 'admin', body: { status: 'COMPLETED', paymentStatus: 'X' } },
  { name: 'status: unknown booking', method: 'PATCH', path: '/bookings/nope/status', as: 'admin', body: { status: 'COMPLETED' } },
  { name: 'status: missing', method: 'PATCH', path: '/bookings/nope/status', as: 'admin', body: {} },

  // ------------------------------------------------------------ Pydantic lax coercion (all end in 404 on unknown ids)
  { name: 'coerce: alarm nulls accepted', method: 'PATCH', path: '/alarms/nope', as: 'passenger', body: { remindBeforeMin: null, status: null } },
  { name: 'coerce: seats true', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', seats: true } },
  { name: 'coerce: seats " 2 "', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', seats: ' 2 ' } },
  { name: 'coerce: seats "2.0"', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', seats: '2.0' } },
  { name: 'coerce: seats [1]', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', seats: [1] } },
  { name: 'coerce: padded ids/dates', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: ' nope ', travelDate: ' 2026-12-01 ' } },
  { name: 'coerce: lower-case enum', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'bus', busId: 'nope', travelDate: '2026-12-01' } },
  { name: 'coerce: paymentMode null', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', paymentMode: null } },
  { name: 'coerce: extra id wrong type', method: 'POST', path: '/bookings', as: 'passenger', body: { type: 'BUS', busId: 'nope', travelDate: '2026-12-01', rideId: 5 } },
  { name: 'coerce: verified 1', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 1 } },
  { name: 'coerce: verified "TRUE"', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 'TRUE' } },
  { name: 'coerce: verified "off"', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: 'off' } },
  { name: 'coerce: verified []', method: 'PATCH', path: '/local-cars/nope/verify', as: 'admin', body: { verified: [] } },
  { name: 'coerce: rating "4"', method: 'POST', path: '/local-cars/nope/reviews', as: 'passenger', body: { rating: '4' } },
  { name: 'coerce: rating true', method: 'POST', path: '/local-cars/nope/reviews', as: 'passenger', body: { rating: true } },
  { name: 'coerce: comment null', method: 'POST', path: '/local-cars/nope/reviews', as: 'passenger', body: { rating: 3, comment: null } },
  { name: 'coerce: body is an array', method: 'POST', path: '/local-cars/nope/reviews', as: 'passenger', body: [] },
  { name: 'query: minRating empty', path: '/local-cars?minRating=' },
  { name: 'query: minRating nan', path: '/local-cars?minRating=nan' },
  { name: 'query: minRating inf', path: '/local-cars?minRating=inf' },
  { name: 'query: minRating " 4.5 "', path: '/local-cars?minRating=%204.5%20' },
  { name: 'query: page " 2 "', path: '/local-cars?page=%202%20&limit=2' },
  { name: 'query: limit empty', path: '/local-cars?limit=' },
  { name: 'query: repeated param, last wins', path: '/local-cars?verified=false&verified=true' },
  { name: 'query: bookings from empty', path: '/bookings?from=&to=', as: 'passenger' },
  { name: 'query: rides bad page + status', path: '/rides?date=2026-09-22&page=0&status=X' },
]
