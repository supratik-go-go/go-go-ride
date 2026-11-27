// Shared response shapes: the JSON the app has always received, built from the MySQL rows.
//
// Every function takes a row as db.js returns it (camelCase of the new column names, dates in
// milliseconds, 0/1 for yes/no) and returns the old API field names, so installed phones keep
// working. Nested relations are loaded with small indexed queries, so most functions are async.
import { all, byId, get } from './db.js'
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
    emailConfirmed: Boolean(u.email && u.emailConfirmedAt),
    role: u.role,
    avatarUrl: u.pictureUrl ?? null,
    status: u.status,
    phoneVerified: bool(u.phoneVerified),
    createdAt: isoZ(u.createdAt),
    lastLoginAt: isoZ(u.lastLoginAt),
  }

export const userBrief = (u) =>
  u ? { id: u.id, name: u.name, phone: u.phone ?? null, email: u.email ?? null, avatarUrl: u.pictureUrl ?? null } : null

export const userBriefById = async (id) => userBrief(await byId('users', id))

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

export const stopById = async (id) => stopOut(await byId('bus_stops', id))

export const routeBrief = (r) =>
  r ? { id: r.id, name: r.name, routeNumber: r.routeNumber, distanceKm: num(r.distanceKm) ?? null } : null

export const routeStopOut = async (rs) => ({
  id: rs.id,
  routeId: rs.routeId ?? null,
  stopId: rs.stopId ?? null,
  sequence: rs.stopOrder,
  distanceFromStartKm: num(rs.distanceFromStartKm),
  stop: await stopById(rs.stopId),
})

// ---------------------------------------------------------------- buses

/** StopageOut from a bus_timetable row (as loaded with the bus: busId/stopId set, isStart/isEnd false). */
export const stopageOut = async (s) => ({
  id: s.id,
  busId: s.busId ?? null,
  stopId: s.stopId ?? null,
  sequence: s.stopOrder,
  stop: await stopById(s.stopId),
  arrivalTime: s.arrivalTime,
  departureTime: s.departureTime,
  distanceKm: num(s.distanceFromStartKm),
  isStart: false,
  isEnd: false,
  arrivalTime12h: to12h(s.arrivalTime),
  departureTime12h: to12h(s.departureTime),
})

/** The timetable of a bus's first trip, in stop order (the app shows one trip per bus until the trips update). */
export const busStopages = (busId) =>
  all(
    `SELECT * FROM bus_timetable WHERE trip_id = (SELECT id FROM bus_trips WHERE bus_id = ? AND is_active = 1 ORDER BY trip_number LIMIT 1)
     ORDER BY stop_order`,
    busId,
  )

/**
 * The timetable shape used on Bus Details: like stopageOut but with busId/stopId
 * null and isStart/isEnd marking the first/last stop (matches timetable_rows()).
 */
export function timetableRows(stopageRows) {
  const firstSeq = stopageRows.length ? stopageRows[0].stopOrder : null
  const lastSeq = stopageRows.length ? stopageRows[stopageRows.length - 1].stopOrder : null
  return Promise.all(
    stopageRows.map(async (s) => ({
      id: s.id,
      busId: null,
      stopId: null,
      sequence: s.stopOrder,
      stop: await stopById(s.stopId),
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      distanceKm: num(s.distanceFromStartKm),
      isStart: s.stopOrder === firstSeq,
      isEnd: s.stopOrder === lastSeq,
      arrivalTime12h: to12h(s.arrivalTime),
      departureTime12h: to12h(s.departureTime),
    })),
  )
}

export const busDocumentOut = (d) => ({
  id: d.id,
  docType: d.documentType,
  fileUrl: d.fileUrl,
  originalName: d.originalFileName ?? null,
  uploadedAt: isoZ(d.uploadedAt),
})

export const busExceptionOut = (e) => ({ id: e.id, busId: e.busId, date: isoZ(e.offDate), reason: e.reason ?? null })

/** The scalar columns of BusOut (no relations). */
export const busColumns = (b) => ({
  id: b.id,
  busNumber: b.busNumber,
  busName: b.busName ?? null,
  ownerId: b.ownerId,
  routeId: b.routeId ?? null,
  type: b.isAc ? 'AC' : 'NON_AC',
  category: b.category,
  operator: b.operator ?? null,
  totalSeats: b.totalSeats,
  fare: num(b.fare),
  contactNumber: b.contactNumber ?? null,
  contactStart: b.callFrom,
  contactEnd: b.callUntil,
  serviceDays: b.runsOn,
  status: b.status,
  rejectionReason: b.rejectionReason ?? null,
  ratingAvg: num(b.ratingAverage),
  ratingCount: b.ratingCount,
  imageUrl: b.pictureUrl ?? null,
  submittedAt: isoZ(b.submittedAt),
  reviewedAt: isoZ(b.reviewedAt),
  reviewedById: b.reviewedBy ?? null,
  createdAt: isoZ(b.createdAt),
  updatedAt: isoZ(b.updatedAt),
})

/** BusOut: columns + owner, route, stopages (by stop order), documents. */
export async function busOut(b) {
  if (!b) return null
  const [owner, route, stopages, documents] = await Promise.all([
    userBriefById(b.ownerId),
    byId('bus_routes', b.routeId),
    busStopages(b.id),
    all('SELECT * FROM bus_documents WHERE bus_id = ? ORDER BY uploaded_at, id', b.id),
  ])
  return {
    ...busColumns(b),
    owner,
    route: routeBrief(route),
    stopages: await Promise.all(stopages.map(stopageOut)),
    documents: documents.map(busDocumentOut),
  }
}

export const busById = async (id) => busOut(await byId('buses', id))

// ---------------------------------------------------------------- reviews

export const reviewOut = async (r) => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment ?? null,
  createdAt: isoZ(r.createdAt),
  user: await userBriefById(r.userId),
})

// ---------------------------------------------------------------- alarms

export async function alarmOut(a) {
  const notifyAt = toHHMM(toMinutes(a.busArrivesAt) - a.remindMinutesBefore)
  const [bus, boardingStop, arrivalStop] = await Promise.all([busById(a.busId), stopById(a.getOnStopId), stopById(a.getOffStopId)])
  return {
    id: a.id,
    userId: a.userId,
    busId: a.busId,
    alarmDate: isoZ(a.travelDate),
    expectedArrival: a.busArrivesAt,
    remindBeforeMin: a.remindMinutesBefore,
    status: a.status,
    notifiedAt: isoZ(a.rangAt),
    createdAt: isoZ(a.createdAt),
    bus,
    boardingStop,
    arrivalStop,
    expectedArrival12h: to12h(a.busArrivesAt),
    notifyAt,
    notifyAt12h: to12h(notifyAt),
  }
}

// ---------------------------------------------------------------- local vehicles & rides

export const localCarOut = (c) =>
  c
    ? {
        id: c.id,
        ownerId: c.ownerId ?? null,
        driverName: c.driverName,
        phone: c.phone,
        area: c.area,
        vehicleType: c.vehicleType ?? 'CAR',
        carModel: c.vehicleModel ?? null,
        carNumber: c.vehicleNumber ?? null,
        photoUrl: c.pictureUrl ?? null,
        availableFrom: c.availableFrom,
        availableTo: c.availableUntil,
        ratingAvg: num(c.ratingAverage),
        ratingCount: c.ratingCount,
        verified: bool(c.isVerified),
        status: c.status,
        createdAt: isoZ(c.createdAt),
        updatedAt: isoZ(c.updatedAt),
        availabilityLabel: `${to12h(c.availableFrom)} - ${to12h(c.availableUntil)}`,
      }
    : null

export async function rideOut(r) {
  if (!r) return null
  const [fromStop, toStop, route, driver] = await Promise.all([
    stopById(r.fromStopId),
    stopById(r.toStopId),
    byId('bus_routes', r.routeId),
    userBriefById(r.driverId),
  ])
  return {
    id: r.id,
    routeId: r.routeId ?? null,
    vehicleType: r.vehicleType,
    departureAt: isoZ(r.departsAt),
    totalSeats: r.totalSeats,
    availableSeats: r.seatsLeft,
    farePerSeat: num(r.farePerSeat),
    status: r.status,
    fromStop,
    toStop,
    route: routeBrief(route),
    driver,
  }
}

// ---------------------------------------------------------------- bookings

export async function bookingOut(b) {
  const [user, bus, ride, localCar] = await Promise.all([
    userBriefById(b.userId),
    b.busId ? busById(b.busId) : null,
    b.sharedRideId ? byId('shared_rides', b.sharedRideId).then(rideOut) : null,
    b.localVehicleId ? byId('local_vehicles', b.localVehicleId).then(localCarOut) : null,
  ])
  return {
    id: b.id,
    bookingRef: b.bookingNumber,
    userId: b.userId,
    type: b.type,
    travelDate: isoZ(b.travelDate),
    seats: b.seats,
    amount: num(b.amount),
    paymentMode: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    status: b.status,
    cancelReason: b.cancelReason ?? null,
    createdAt: isoZ(b.createdAt),
    user,
    bus,
    ride,
    localCar,
  }
}

// ---------------------------------------------------------------- messaging, admin, profile

export const notificationOut = (n) => ({
  id: n.id,
  userId: n.userId ?? null,
  title: n.title,
  message: n.message,
  type: n.type,
  link: n.openScreen ?? null,
  isRead: bool(n.isRead),
  readAt: isoZ(n.readAt),
  createdAt: isoZ(n.createdAt),
})

/** The team's latest reply on a ticket (the old single "response" field). */
export const ticketResponse = (ticketId) =>
  get('SELECT message FROM support_ticket_messages WHERE ticket_id = ? AND is_from_team = 1 ORDER BY created_at DESC, id DESC LIMIT 1', ticketId).then(
    (m) => m?.message ?? null,
  )

export const supportTicketOut = async (t) => {
  const [response, user] = await Promise.all([ticketResponse(t.id), userBriefById(t.userId)])
  return {
    id: t.id,
    ticketRef: t.ticketNumber,
    userId: t.userId ?? null,
    name: t.name,
    phone: t.phone,
    email: t.email ?? null,
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    priority: t.priority,
    response,
    createdAt: isoZ(t.createdAt),
    user,
  }
}

export const activityLogOut = async (a) => ({
  id: a.id,
  action: a.action,
  entityType: a.itemType ?? null,
  entityId: a.itemId ?? null,
  message: a.message,
  createdAt: isoZ(a.createdAt),
  actor: await userBriefById(a.doneBy),
})

export const loginActivityOut = (l) => ({
  id: l.id,
  device: l.device ?? null,
  ipAddress: l.ipAddress ?? null,
  location: l.location ?? null,
  status: l.status,
  createdAt: isoZ(l.createdAt),
})

// The app never used these four, so they are no longer stored; replies keep their old values.
export const FIXED_SETTINGS = { timezone: 'Asia/Kolkata', currency: 'INR', dateFormat: 'DD MMM YYYY', timeFormat: '12h' }

export const settingsOut = (s) =>
  s && {
    id: s.id,
    platformName: s.appName,
    platformEmail: s.supportEmail,
    contactNumber: s.contactNumber,
    address: s.address,
    ...FIXED_SETTINGS,
  }

export const recentSearchOut = (r) => ({
  id: r.id,
  searchType: r.searchType,
  fromText: r.fromText ?? null,
  toText: r.toText ?? null,
  query: r.searchText ?? null,
  searchedAt: isoZ(r.searchedAt),
})

/** The single settings row (id "global"). */
export const loadSettings = () => get('SELECT * FROM app_settings WHERE id = ?', 'global')
