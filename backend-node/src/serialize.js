// Shared response shapes - field for field the same as app/schemas/responses.py.
//
// Every function takes a raw database row (camelCase columns, ms datetimes,
// 0/1 booleans) and returns the JSON object the API sends. Nested relations are
// loaded here with small indexed queries; at this app's scale that is simpler
// and fast enough (node:sqlite is synchronous and in-process).
import { all, byId, get, scalar } from './db.js'
import { isoZ, to12h, toHHMM, toMinutes } from './time.js'

const bool = (v) => Boolean(v)
const num = (v) => (v === null || v === undefined ? v : Number(v))

// ---------------------------------------------------------------- users

export const userOut = (u) =>
  u && {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email ?? null,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
    status: u.status,
    phoneVerified: bool(u.phoneVerified),
    createdAt: isoZ(u.createdAt),
    lastLoginAt: isoZ(u.lastLoginAt),
  }

export const userBrief = (u) =>
  u ? { id: u.id, name: u.name, phone: u.phone ?? null, email: u.email ?? null, avatarUrl: u.avatarUrl ?? null } : null

export const userBriefById = (id) => userBrief(byId('User', id))

// ---------------------------------------------------------------- stops & routes

export const stopOut = (s) =>
  s
    ? {
        id: s.id,
        name: s.name,
        area: s.area ?? null,
        city: s.city ?? null,
        latitude: num(s.latitude) ?? null,
        longitude: num(s.longitude) ?? null,
        status: s.status ?? null,
        createdAt: isoZ(s.createdAt),
        updatedAt: isoZ(s.updatedAt),
      }
    : null

export const stopById = (id) => stopOut(byId('BusStop', id))

export const routeBrief = (r) =>
  r ? { id: r.id, name: r.name, routeNumber: r.routeNumber, distanceKm: num(r.distanceKm) ?? null } : null

export const routeStopOut = (rs) => ({
  id: rs.id,
  routeId: rs.routeId ?? null,
  stopId: rs.stopId ?? null,
  sequence: rs.sequence,
  distanceFromStartKm: num(rs.distanceFromStartKm),
  stop: stopById(rs.stopId),
})

/** RouteOut: route + fromStop/toStop + ordered stops + totalBuses (all buses on the route, any status). */
export function routeOut(r, totalBuses) {
  if (!r) return null
  const stops = all('SELECT * FROM "RouteStop" WHERE "routeId" = ? ORDER BY sequence', r.id)
  return {
    ...routeBrief(r),
    status: r.status,
    fromStopId: r.fromStopId ?? null,
    toStopId: r.toStopId ?? null,
    createdAt: isoZ(r.createdAt),
    updatedAt: isoZ(r.updatedAt),
    fromStop: stopById(r.fromStopId),
    toStop: stopById(r.toStopId),
    stops: stops.map(routeStopOut),
    totalBuses: totalBuses ?? Number(scalar('SELECT COUNT(id) FROM "Bus" WHERE "routeId" = ?', r.id) || 0),
  }
}

// ---------------------------------------------------------------- buses

/** StopageOut from a BusStopage row (as loaded with the bus: busId/stopId set, isStart/isEnd false). */
export const stopageOut = (s) => ({
  id: s.id,
  busId: s.busId ?? null,
  stopId: s.stopId ?? null,
  sequence: s.sequence,
  stop: stopById(s.stopId),
  arrivalTime: s.arrivalTime,
  departureTime: s.departureTime,
  distanceKm: num(s.distanceKm),
  isStart: false,
  isEnd: false,
  arrivalTime12h: to12h(s.arrivalTime),
  departureTime12h: to12h(s.departureTime),
})

export const busStopages = (busId) => all('SELECT * FROM "BusStopage" WHERE "busId" = ? ORDER BY sequence', busId)

/**
 * The timetable shape used on Bus Details: like stopageOut but with busId/stopId
 * null and isStart/isEnd marking the first/last stop (matches timetable_rows()).
 */
export function timetableRows(stopageRows) {
  const firstSeq = stopageRows.length ? stopageRows[0].sequence : null
  const lastSeq = stopageRows.length ? stopageRows[stopageRows.length - 1].sequence : null
  return stopageRows.map((s) => ({
    id: s.id,
    busId: null,
    stopId: null,
    sequence: s.sequence,
    stop: stopById(s.stopId),
    arrivalTime: s.arrivalTime,
    departureTime: s.departureTime,
    distanceKm: num(s.distanceKm),
    isStart: s.sequence === firstSeq,
    isEnd: s.sequence === lastSeq,
    arrivalTime12h: to12h(s.arrivalTime),
    departureTime12h: to12h(s.departureTime),
  }))
}

export const busDocumentOut = (d) => ({
  id: d.id,
  docType: d.docType,
  fileUrl: d.fileUrl,
  originalName: d.originalName ?? null,
  uploadedAt: isoZ(d.uploadedAt),
})

export const busExceptionOut = (e) => ({ id: e.id, busId: e.busId, date: isoZ(e.date), reason: e.reason ?? null })

/** The scalar columns of BusOut (no relations). */
export const busColumns = (b) => ({
  id: b.id,
  busNumber: b.busNumber,
  busName: b.busName ?? null,
  ownerId: b.ownerId,
  routeId: b.routeId ?? null,
  type: b.type,
  category: b.category,
  operator: b.operator ?? null,
  totalSeats: b.totalSeats,
  fare: num(b.fare),
  contactNumber: b.contactNumber ?? null,
  contactStart: b.contactStart,
  contactEnd: b.contactEnd,
  serviceDays: b.serviceDays,
  status: b.status,
  rejectionReason: b.rejectionReason ?? null,
  ratingAvg: num(b.ratingAvg),
  ratingCount: b.ratingCount,
  imageUrl: b.imageUrl ?? null,
  submittedAt: isoZ(b.submittedAt),
  reviewedAt: isoZ(b.reviewedAt),
  reviewedById: b.reviewedById ?? null,
  createdAt: isoZ(b.createdAt),
  updatedAt: isoZ(b.updatedAt),
})

/** BusOut: columns + owner, route, stopages (by sequence), documents. */
export function busOut(b) {
  if (!b) return null
  return {
    ...busColumns(b),
    owner: userBriefById(b.ownerId),
    route: routeBrief(byId('Route', b.routeId)),
    stopages: busStopages(b.id).map(stopageOut),
    documents: all('SELECT * FROM "BusDocument" WHERE "busId" = ? ORDER BY rowid', b.id).map(busDocumentOut),
  }
}

export const busById = (id) => busOut(byId('Bus', id))

// ---------------------------------------------------------------- reviews

export const reviewOut = (r) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment ?? null,
  createdAt: isoZ(r.createdAt),
  user: userBriefById(r.userId),
})

// ---------------------------------------------------------------- alarms

export function alarmOut(a) {
  const notifyAt = toHHMM(toMinutes(a.expectedArrival) - a.remindBeforeMin)
  return {
    id: a.id,
    userId: a.userId,
    busId: a.busId,
    alarmDate: isoZ(a.alarmDate),
    expectedArrival: a.expectedArrival,
    remindBeforeMin: a.remindBeforeMin,
    status: a.status,
    notifiedAt: isoZ(a.notifiedAt),
    createdAt: isoZ(a.createdAt),
    bus: busById(a.busId),
    boardingStop: stopById(a.boardingStopId),
    arrivalStop: stopById(a.arrivalStopId),
    expectedArrival12h: to12h(a.expectedArrival),
    notifyAt,
    notifyAt12h: to12h(notifyAt),
  }
}

// ---------------------------------------------------------------- local cars & rides

export const localCarOut = (c) =>
  c
    ? {
        id: c.id,
        ownerId: c.ownerId ?? null,
        driverName: c.driverName,
        phone: c.phone,
        area: c.area,
        carModel: c.carModel ?? null,
        carNumber: c.carNumber ?? null,
        photoUrl: c.photoUrl ?? null,
        availableFrom: c.availableFrom,
        availableTo: c.availableTo,
        ratingAvg: num(c.ratingAvg),
        ratingCount: c.ratingCount,
        verified: bool(c.verified),
        status: c.status,
        createdAt: isoZ(c.createdAt),
        updatedAt: isoZ(c.updatedAt),
        availabilityLabel: `${to12h(c.availableFrom)} - ${to12h(c.availableTo)}`,
      }
    : null

export const rideOut = (r) =>
  r
    ? {
        id: r.id,
        routeId: r.routeId ?? null,
        vehicleType: r.vehicleType,
        departureAt: isoZ(r.departureAt),
        totalSeats: r.totalSeats,
        availableSeats: r.availableSeats,
        farePerSeat: num(r.farePerSeat),
        status: r.status,
        fromStop: stopById(r.fromStopId),
        toStop: stopById(r.toStopId),
        route: routeBrief(byId('Route', r.routeId)),
        driver: userBriefById(r.driverId),
      }
    : null

// ---------------------------------------------------------------- bookings

export const bookingOut = (b) => ({
  id: b.id,
  bookingRef: b.bookingRef,
  userId: b.userId,
  type: b.type,
  travelDate: isoZ(b.travelDate),
  seats: b.seats,
  amount: num(b.amount),
  paymentMode: b.paymentMode,
  paymentStatus: b.paymentStatus,
  status: b.status,
  cancelReason: b.cancelReason ?? null,
  createdAt: isoZ(b.createdAt),
  user: userBriefById(b.userId),
  bus: b.busId ? busById(b.busId) : null,
  ride: b.rideId ? rideOut(byId('Ride', b.rideId)) : null,
  localCar: b.localCarId ? localCarOut(byId('LocalCar', b.localCarId)) : null,
})

// ---------------------------------------------------------------- messaging, admin, profile

export const notificationOut = (n) => ({
  id: n.id,
  userId: n.userId ?? null,
  title: n.title,
  message: n.message,
  type: n.type,
  link: n.link ?? null,
  isRead: bool(n.isRead),
  readAt: isoZ(n.readAt),
  createdAt: isoZ(n.createdAt),
})

export const supportTicketOut = (t) => ({
  id: t.id,
  ticketRef: t.ticketRef,
  userId: t.userId ?? null,
  name: t.name,
  phone: t.phone,
  email: t.email ?? null,
  category: t.category,
  subject: t.subject,
  message: t.message,
  status: t.status,
  priority: t.priority,
  response: t.response ?? null,
  createdAt: isoZ(t.createdAt),
  user: userBriefById(t.userId),
})

export const activityLogOut = (a) => ({
  id: a.id,
  action: a.action,
  entityType: a.entityType ?? null,
  entityId: a.entityId ?? null,
  message: a.message,
  createdAt: isoZ(a.createdAt),
  actor: userBriefById(a.actorId),
})

export const loginActivityOut = (l) => ({
  id: l.id,
  device: l.device ?? null,
  ipAddress: l.ipAddress ?? null,
  location: l.location ?? null,
  status: l.status,
  createdAt: isoZ(l.createdAt),
})

export const settingsOut = (s) =>
  s && {
    id: s.id,
    platformName: s.platformName,
    platformEmail: s.platformEmail,
    contactNumber: s.contactNumber,
    address: s.address,
    timezone: s.timezone,
    currency: s.currency,
    dateFormat: s.dateFormat,
    timeFormat: s.timeFormat,
  }

export const recentSearchOut = (r) => ({
  id: r.id,
  searchType: r.searchType,
  fromText: r.fromText ?? null,
  toText: r.toText ?? null,
  query: r.query ?? null,
  searchedAt: isoZ(r.searchedAt),
})

/** The single settings row (id "global"). */
export const loadSettings = () => get('SELECT * FROM "Setting" WHERE id = ?', 'global')
