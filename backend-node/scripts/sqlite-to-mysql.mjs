#!/usr/bin/env node
// Copies the old SQLite database into the new MySQL design (mysql/schema.sql, docs/mysql-plan.md),
// converting as it goes: readable India-time dates, real dates and times, AC as Yes / No, one trip
// per bus, support replies as messages. Every row is checked: the copy fails if any count differs.
//
//   node scripts/sqlite-to-mysql.mjs <sqlite file> <mysql database> [--env data/mysql-test.env] [--replace]
//
// The MySQL database is created from mysql/schema.sql. An existing database with tables is only
// replaced with --replace, so the live database can never be wiped by mistake.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const IST_MS = 5.5 * 3600 * 1000

// ---------------------------------------------------------------- conversions

/** Milliseconds -> 'YYYY-MM-DD HH:MM:SS.mmm' in India time. */
export const dt = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms) + IST_MS).toISOString().replace('T', ' ').slice(0, 23))
/** Midnight-UTC milliseconds (how the old database stored calendar dates) -> 'YYYY-MM-DD'. */
const day = (ms) => (ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString().slice(0, 10))
/** 'HH:MM' -> 'HH:MM:00'. */
const tm = (v) => (v === null || v === undefined || v === '' ? null : /^\d{1,2}:\d{2}$/.test(v) ? `${v}:00` : v)
const yes = (v) => (v ? 1 : 0)
const tripId = (busId) => (busId ? `t_${busId}` : null)

// ---------------------------------------------------------------- what goes where
// [old table, new table, { new column: old row => value }], in an order that respects the links.

const SPEC = [
  ['User', 'users', {
    id: (r) => r.id, name: (r) => r.name, phone: (r) => r.phone, email: (r) => r.email, password: (r) => r.passwordHash,
    role: (r) => r.role, picture_url: (r) => r.avatarUrl, status: (r) => r.status, phone_verified: (r) => yes(r.phoneVerified),
    last_login_at: (r) => dt(r.lastLoginAt), created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['RefreshToken', 'sign_in_sessions', {
    id: (r) => r.id, user_id: (r) => r.userId, token_hash: (r) => r.tokenHash, expires_at: (r) => dt(r.expiresAt),
    revoked_at: (r) => dt(r.revokedAt), created_at: (r) => dt(r.createdAt),
  }],
  ['OtpCode', 'otp_codes', {
    id: (r) => r.id, phone: (r) => r.phone, code_hash: (r) => r.codeHash, purpose: (r) => r.purpose, expires_at: (r) => dt(r.expiresAt),
    consumed_at: (r) => dt(r.consumedAt), attempts: (r) => r.attempts, created_at: (r) => dt(r.createdAt),
  }],
  ['LoginActivity', 'login_history', {
    id: (r) => r.id, user_id: (r) => r.userId, device: (r) => r.device, ip_address: (r) => r.ipAddress, location: (r) => r.location,
    status: (r) => r.status, created_at: (r) => dt(r.createdAt),
  }],
  ['BusStop', 'bus_stops', {
    id: (r) => r.id, name: (r) => r.name, area: (r) => r.area, city: (r) => r.city, latitude: (r) => r.latitude, longitude: (r) => r.longitude,
    status: (r) => r.status, created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['Route', 'bus_routes', {
    id: (r) => r.id, name: (r) => r.name, route_number: (r) => r.routeNumber, from_stop_id: (r) => r.fromStopId, to_stop_id: (r) => r.toStopId,
    distance_km: (r) => r.distanceKm, status: (r) => r.status, created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['RouteStop', 'bus_route_stops', {
    id: (r) => r.id, route_id: (r) => r.routeId, stop_id: (r) => r.stopId, stop_order: (r) => r.sequence, distance_from_start_km: (r) => r.distanceFromStartKm,
  }],
  ['Bus', 'buses', {
    id: (r) => r.id, bus_number: (r) => r.busNumber, bus_name: (r) => r.busName, owner_id: (r) => r.ownerId, route_id: (r) => r.routeId,
    is_ac: (r) => yes(r.type === 'AC'), category: (r) => r.category, operator: (r) => r.operator, total_seats: (r) => r.totalSeats, fare: (r) => r.fare,
    contact_number: (r) => r.contactNumber, call_from: (r) => tm(r.contactStart), call_until: (r) => tm(r.contactEnd), runs_on: (r) => r.serviceDays,
    picture_url: (r) => r.imageUrl, status: (r) => r.status, rejection_reason: (r) => r.rejectionReason, rating_average: (r) => r.ratingAvg,
    rating_count: (r) => r.ratingCount, submitted_at: (r) => dt(r.submittedAt), reviewed_at: (r) => dt(r.reviewedAt), reviewed_by: (r) => r.reviewedById,
    created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  // One trip per bus for now: from its first to its last stop, leaving at its first departure time.
  ['Bus', 'bus_trips', {
    id: (r) => tripId(r.id), bus_id: (r) => r.id, trip_number: () => 1, from_stop_id: (r, s) => s.first.get(r.id)?.stopId ?? null,
    to_stop_id: (r, s) => s.last.get(r.id)?.stopId ?? null, departs_at: (r, s) => tm(s.first.get(r.id)?.departureTime),
    is_active: () => 1, created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['BusStopage', 'bus_timetable', {
    id: (r) => r.id, trip_id: (r) => tripId(r.busId), bus_id: (r) => r.busId, stop_id: (r) => r.stopId, stop_order: (r) => r.sequence,
    arrival_time: (r) => tm(r.arrivalTime), departure_time: (r) => tm(r.departureTime), distance_from_start_km: (r) => r.distanceKm,
  }],
  ['BusException', 'bus_off_days', {
    id: (r) => r.id, bus_id: (r) => r.busId, off_date: (r) => day(r.date), reason: (r) => r.reason, created_at: (r) => dt(r.createdAt),
  }],
  ['BusDocument', 'bus_documents', {
    id: (r) => r.id, bus_id: (r) => r.busId, document_type: (r) => r.docType, file_url: (r) => r.fileUrl, original_file_name: (r) => r.originalName,
    uploaded_at: (r) => dt(r.uploadedAt),
  }],
  ['LocalCar', 'local_vehicles', {
    id: (r) => r.id, owner_id: (r) => r.ownerId, driver_name: (r) => r.driverName, phone: (r) => r.phone, area: (r) => r.area,
    vehicle_type: (r) => r.vehicleType || 'CAR', vehicle_model: (r) => r.carModel, vehicle_number: (r) => r.carNumber, picture_url: (r) => r.photoUrl,
    available_from: (r) => tm(r.availableFrom), available_until: (r) => tm(r.availableTo), rating_average: (r) => r.ratingAvg,
    rating_count: (r) => r.ratingCount, is_verified: (r) => yes(r.verified), status: (r) => r.status, created_at: (r) => dt(r.createdAt),
    updated_at: (r) => dt(r.updatedAt),
  }],
  ['Ride', 'shared_rides', {
    id: (r) => r.id, route_id: (r) => r.routeId, from_stop_id: (r) => r.fromStopId, to_stop_id: (r) => r.toStopId, driver_id: (r) => r.driverId,
    vehicle_type: (r) => r.vehicleType, departs_at: (r) => dt(r.departureAt), total_seats: (r) => r.totalSeats, seats_left: (r) => r.availableSeats,
    fare_per_seat: (r) => r.farePerSeat, status: (r) => r.status, created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['RideWaitlist', 'ride_waitlist', {
    id: (r) => r.id, user_id: (r) => r.userId, phone: (r) => r.phone, area: (r) => r.area, created_at: (r) => dt(r.createdAt),
  }],
  ['Alarm', 'alarms', {
    id: (r) => r.id, user_id: (r) => r.userId, bus_id: (r) => r.busId, trip_id: (r) => tripId(r.busId), get_on_stop_id: (r) => r.boardingStopId,
    get_off_stop_id: (r) => r.arrivalStopId, travel_date: (r) => day(r.alarmDate), bus_arrives_at: (r) => tm(r.expectedArrival),
    remind_minutes_before: (r) => r.remindBeforeMin, status: (r) => r.status, rang_at: (r) => dt(r.notifiedAt), created_at: (r) => dt(r.createdAt),
    updated_at: (r) => dt(r.updatedAt),
  }],
  ['Favorite', 'favorites', {
    id: (r) => r.id, user_id: (r) => r.userId, item_type: (r) => r.itemType, item_id: (r) => r.itemId, created_at: (r) => dt(r.createdAt),
  }],
  ['RecentSearch', 'recent_searches', {
    id: (r) => r.id, user_id: (r) => r.userId, search_type: (r) => r.searchType, from_text: (r) => r.fromText, to_text: (r) => r.toText,
    search_text: (r) => r.query, searched_at: (r) => dt(r.searchedAt),
  }],
  ['Review', 'reviews', {
    id: (r) => r.id, user_id: (r) => r.userId, bus_id: (r) => r.busId, local_vehicle_id: (r) => r.localCarId, rating: (r) => r.rating,
    comment: (r) => r.comment, created_at: (r) => dt(r.createdAt),
  }],
  ['Booking', 'bookings', {
    id: (r) => r.id, booking_number: (r) => r.bookingRef, user_id: (r) => r.userId, type: (r) => r.type, bus_id: (r) => r.busId,
    trip_id: (r) => tripId(r.busId), shared_ride_id: (r) => r.rideId, local_vehicle_id: (r) => r.localCarId, travel_date: (r) => day(r.travelDate),
    seats: (r) => r.seats, amount: (r) => r.amount, payment_method: (r) => r.paymentMode, payment_status: (r) => r.paymentStatus,
    status: (r) => r.status, cancel_reason: (r) => r.cancelReason, created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['RouteSubmission', 'bus_route_requests', {
    id: (r) => r.id, sent_by: (r) => r.userId, name: (r) => r.name, route_number: (r) => r.routeNumber, notes: (r) => r.notes, stops: (r) => r.stops,
    status: (r) => r.status, rejection_reason: (r) => r.rejectionReason, created_route_id: (r) => r.routeId, reviewed_by: (r) => r.reviewedById,
    reviewed_at: (r) => dt(r.reviewedAt), created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  ['Notification', 'notifications', {
    id: (r) => r.id, user_id: (r) => r.userId, title: (r) => r.title, message: (r) => r.message, type: (r) => r.type, open_screen: (r) => r.link,
    is_read: (r) => yes(r.isRead), read_at: (r) => dt(r.readAt), created_at: (r) => dt(r.createdAt),
  }],
  ['SupportTicket', 'support_tickets', {
    id: (r) => r.id, ticket_number: (r) => r.ticketRef, user_id: (r) => r.userId, name: (r) => r.name, phone: (r) => r.phone, email: (r) => r.email,
    category: (r) => r.category, subject: (r) => r.subject, message: (r) => r.message, status: (r) => r.status, priority: (r) => r.priority,
    created_at: (r) => dt(r.createdAt), updated_at: (r) => dt(r.updatedAt),
  }],
  // The team's single reply becomes the first message of the conversation.
  ['SupportTicket', 'support_ticket_messages', {
    id: (r) => `m_${r.id}`, ticket_id: (r) => r.id, sent_by: () => null, is_from_team: () => 1, message: (r) => r.response,
    created_at: (r) => dt(r.updatedAt),
  }, (r) => r.response !== null && r.response !== undefined && String(r.response).trim() !== ''],
  ['ActivityLog', 'activity_log', {
    id: (r) => r.id, done_by: (r) => r.actorId, action: (r) => r.action, item_type: (r) => r.entityType, item_id: (r) => r.entityId,
    message: (r) => r.message, created_at: (r) => dt(r.createdAt),
  }],
  ['Setting', 'app_settings', {
    id: (r) => r.id, app_name: (r) => r.platformName, support_email: (r) => r.platformEmail, contact_number: (r) => r.contactNumber,
    address: (r) => r.address, updated_at: (r) => dt(r.updatedAt),
  }],
  ['GameRoom', 'game_rooms', {
    id: (r) => r.id, game: (r) => r.game, room_code: (r) => r.code, is_public: (r) => yes(r.isPublic), status: (r) => r.status, game_data: (r) => r.state,
    turn_ends_at: (r) => dt(r.turnDeadline), version: (r) => r.version, result: (r) => r.result, created_at: (r) => dt(r.createdAt),
    updated_at: (r) => dt(r.updatedAt),
  }],
  ['GamePlayer', 'game_players', {
    id: (r) => r.id, game_room_id: (r) => r.roomId, user_id: (r) => r.userId, seat: (r) => r.seat, points_earned: (r) => r.pointsEarned,
  }],
  ['GameScore', 'leaderboard', {
    user_id: (r) => r.userId, points: (r) => r.points, wins: (r) => r.wins, draws: (r) => r.draws, played: (r) => r.played,
    updated_at: (r) => dt(r.updatedAt),
  }],
  ['ArcadeRun', 'arcade_scores', {
    id: (r) => r.id, user_id: (r) => r.userId, game: (r) => r.game, score: (r) => r.score, points: (r) => r.points, created_at: (r) => dt(r.createdAt),
  }],
]

// ---------------------------------------------------------------- copy

const tableExists = (lite, t) => Boolean(lite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

/** Copies every table. Returns [{ from, to, source, copied }]; throws if a row fails or a count differs. */
export async function copySqliteToMysql(sqlitePath, conn, { log = console.log } = {}) {
  const lite = new DatabaseSync(sqlitePath, { readOnly: true })
  try {
    // First and last stop of each bus, for its trip.
    const first = new Map()
    const last = new Map()
    for (const s of lite.prepare('SELECT * FROM "BusStopage" ORDER BY "busId", sequence').all()) {
      if (!first.has(s.busId)) first.set(s.busId, s)
      last.set(s.busId, s)
    }
    const shared = { first, last }
    const report = []
    for (const [from, to, cols, keep = () => true] of SPEC) {
      const rows = tableExists(lite, from) ? lite.prepare(`SELECT * FROM "${from}" ORDER BY rowid`).all().filter(keep) : []
      const names = Object.keys(cols)
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => names.map((n) => cols[n](r, shared) ?? null))
        try {
          await conn.query(`INSERT INTO ${to} (${names.join(', ')}) VALUES ?`, [chunk])
        } catch (err) {
          throw new Error(`${from} -> ${to}: ${err.message}`)
        }
      }
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${to}`)
      const copied = Number(n)
      report.push({ from, to, source: rows.length, copied })
      if (copied !== rows.length) throw new Error(`${to}: expected ${rows.length} rows, found ${copied}`)
      log(`  ${String(copied).padStart(6)}  ${from.padEnd(15)} -> ${to}`)
    }
    return report
  } finally {
    lite.close()
  }
}

// ---------------------------------------------------------------- command line

function readEnvFile(file) {
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name) => args.includes(`--${name}`)
  const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
  const [sqlitePath, database] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--env')
  if (!sqlitePath || !database || !/^[A-Za-z0-9_]+$/.test(database)) {
    console.error('Usage: node scripts/sqlite-to-mysql.mjs <sqlite file> <mysql database> [--env file] [--replace]')
    process.exit(1)
  }
  const envFile = opt('env', null)
  const env = envFile ? { ...process.env, ...readEnvFile(path.resolve(envFile)) } : process.env
  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD,
    multipleStatements: true, charset: 'utf8mb4',
  })
  try {
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [database])
    if (Number(n) > 0 && !flag('replace')) throw new Error(`Database ${database} already has ${n} tables. Add --replace to wipe and refill it.`)
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\`; CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE \`${database}\``)
    await conn.query(fs.readFileSync(path.join(root, 'mysql', 'schema.sql'), 'utf8'))
    console.log(`Copying ${sqlitePath} into ${database}:`)
    const report = await copySqliteToMysql(sqlitePath, conn)
    console.log(`Done: ${report.reduce((a, r) => a + r.copied, 0)} rows in ${report.length} tables, every count checked.`)
  } finally {
    await conn.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Copy failed: ${err.message}`)
    process.exit(1)
  })
}
