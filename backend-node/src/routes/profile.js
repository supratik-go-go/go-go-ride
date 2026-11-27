// Profile, favourites, recent searches and login history (port of app/api/profile.py).
import { Router } from 'express'
import { all, byId, get, insert, placeholders, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { meta, ok } from '../http.js'
import { newId } from '../ids.js'
import { isAdmin, requireUser, verifyPassword } from '../auth.js'
import { loginActivityOut, recentSearchOut, userOut } from '../serialize.js'
import { leaveActiveRooms } from '../services/games.js'
import { removeUpload, singleFile, saveUpload } from '../uploads.js'
import { ENUMS } from '../validate.js'
import { pyBody, pyEnum, pyOpt, pyStr, QueryReader, z } from '../pyvalidate.js'

const router = Router()

const num = (v) => (v === null || v === undefined ? v : Number(v))

// ---------------------------------------------------------------- profile

router.get('/users/me', requireUser, (req, res) => ok(res, userOut(req.user)))

const DeleteAccountBody = z.object({ password: pyOpt(pyStr()) })

/** Recalculate the ratings of the buses and cars a deleted person had reviewed. */
async function refreshRatings(reviewed) {
  for (const r of reviewed) {
    const [table, column, id] = r.busId ? ['buses', 'bus_id', r.busId] : ['local_vehicles', 'local_vehicle_id', r.localVehicleId]
    if (!id) continue
    const agg = await get(`SELECT AVG(rating) AS avg, COUNT(id) AS count FROM reviews WHERE ${column} = ?`, id)
    await update(table, id, { ratingAverage: Math.round(Number(agg.avg || 0) * 100) / 100, ratingCount: Number(agg.count || 0) })
  }
}

/** Personal rows that go with the account. Bookings and tickets stay, without a name attached. */
const PERSONAL_TABLES = [
  'alarms', 'arcade_scores', 'favorites', 'leaderboard', 'login_history', 'notifications', 'notification_reads', 'recent_searches',
  'sign_in_sessions', 'reviews', 'ride_waitlist', 'helper_points', 'user_logins',
]

// Required by the App Store and Google Play. The row itself stays because old bookings point at it,
// so the person is erased from it and the same number can register again.
router.delete('/users/me', requireUser, async (req, res) => {
  const { data } = pyBody(req, DeleteAccountBody)
  const user = req.user
  if (isAdmin(user)) throw ApiError.badRequest('Admin accounts must be removed by a super admin')
  if (user.password && !(data.password && verifyPassword(data.password, user.password))) {
    throw ApiError.badRequest('Password is incorrect')
  }
  const listed = async (table) => Number((await scalar(`SELECT COUNT(id) FROM ${table} WHERE owner_id = ?`, user.id)) || 0)
  if ((user.role === 'BUS_OWNER' && (await listed('buses'))) || (await listed('local_vehicles'))) {
    throw ApiError.badRequest('Remove your bus or car listings first, then delete your account')
  }
  const rated = await all('SELECT DISTINCT bus_id, local_vehicle_id FROM reviews WHERE user_id = ?', user.id)
  await tx(async () => {
    await leaveActiveRooms(user.id)
    for (const table of PERSONAL_TABLES) await run(`DELETE FROM ${table} WHERE user_id = ?`, user.id)
    await run('DELETE FROM otp_codes WHERE phone = ?', user.phone)
    await run('DELETE FROM phone_checks WHERE phone = ?', user.phone)
    await run('DELETE FROM ride_waitlist WHERE phone = ?', user.phone)
    await run('UPDATE support_tickets SET name = ?, phone = ?, email = NULL WHERE user_id = ?', 'Deleted user', '', user.id)
    await refreshRatings(rated)
    await update('users', user.id, {
      name: 'Deleted user',
      phone: `deleted-${user.id}`,
      email: null,
      password: null,
      pictureUrl: null,
      status: 'INACTIVE',
      phoneVerified: 0,
      updatedAt: Date.now(),
    })
  })
  removeUpload(user.pictureUrl)
  ok(res, null, 'Your account has been deleted')
})

const ProfileBody = z.object({
  name: pyOpt(pyStr({ min: 2, max: 80 })),
  email: pyOpt(pyStr()),
  avatarUrl: pyOpt(pyStr()),
})

router.patch('/users/me', requireUser, async (req, res) => {
  const { data, set } = pyBody(req, ProfileBody)
  const user = req.user
  // The app sends "avatarUrl"; the column is picture_url.
  const updates = Object.fromEntries(set.map((k) => [k === 'avatarUrl' ? 'pictureUrl' : k, data[k] ?? null]))
  if (updates.email) {
    const clash = await get('SELECT id FROM users WHERE email = ? AND id != ?', updates.email, user.id)
    if (clash) throw ApiError.conflict('An account with this email already exists')
  }
  // Only columns whose value actually changes are written (and bump updatedAt), like SQLAlchemy.
  const changed = Object.fromEntries(Object.entries(updates).filter(([k, v]) => v !== user[k]))
  if (Object.keys(changed).length) await update('users', user.id, { ...changed, updatedAt: Date.now() })
  ok(res, userOut(await byId('users', user.id)), 'Profile updated')
})

/** singleFile, but a file sent under another field name reads as "file missing" (FastAPI's answer). */
function avatarFile(req, res, next) {
  singleFile(req, res, (err) => {
    if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('Validation failed', [{ field: 'file', message: 'Field required' }]))
    }
    return next(err)
  })
}

router.post('/users/me/avatar', requireUser, avatarFile, async (req, res) => {
  const url = saveUpload(req.file, 'avatars')
  await update('users', req.user.id, { pictureUrl: url, updatedAt: Date.now() })
  ok(res, userOut(await byId('users', req.user.id)), 'Photo updated')
})

router.get('/users/me/login-activity', requireUser, async (req, res) => {
  const q = new QueryReader(req.query)
  const p = q.page()
  q.done()
  const userId = req.user.id
  const total = Number((await scalar('SELECT count(id) AS c FROM login_history WHERE user_id = ?', userId)) || 0)
  const items = await all(
    'SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?',
    userId,
    p.limit,
    p.skip,
  )
  res.json({ success: true, message: 'Success', data: items.map(loginActivityOut), meta: meta(total, p) })
})

// ---------------------------------------------------------------- favourites

const FAVORITE_KINDS = ['BUS', 'ROUTE', 'STOP', 'LOCAL_CAR']

/** SELECT * FROM table WHERE id IN (...) - no ORDER BY, exactly like the Python fetch(). */
const fetchByIds = async (table, keys) => (keys.length ? all(`SELECT * FROM ${table} WHERE id IN (${placeholders(keys)})`, ...keys) : [])

router.get('/users/me/favorites', requireUser, async (req, res) => {
  const favorites = await all('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC, id', req.user.id)
  const ids = Object.fromEntries(FAVORITE_KINDS.map((kind) => [kind, favorites.filter((f) => f.itemType === kind).map((f) => f.itemId)]))

  const buses = await Promise.all(
    (await fetchByIds('buses', ids.BUS)).map(async (b) => {
      const route = await byId('bus_routes', b.routeId)
      return {
        id: b.id,
        busNumber: b.busNumber,
        busName: b.busName ?? null,
        type: b.isAc ? 'AC' : 'NON_AC',
        fare: num(b.fare),
        ratingAvg: num(b.ratingAverage),
        route: route ? { name: route.name, routeNumber: route.routeNumber } : null,
      }
    }),
  )
  const routes = (await fetchByIds('bus_routes', ids.ROUTE)).map((r) => ({
    id: r.id,
    name: r.name,
    routeNumber: r.routeNumber,
    distanceKm: num(r.distanceKm),
  }))
  const stops = (await fetchByIds('bus_stops', ids.STOP)).map((s) => ({ id: s.id, name: s.name, area: s.area ?? null }))
  const cars = (await fetchByIds('local_vehicles', ids.LOCAL_CAR)).map((c) => ({
    id: c.id,
    driverName: c.driverName,
    phone: c.phone,
    area: c.area,
    ratingAvg: num(c.ratingAverage),
  }))

  ok(res, {
    buses,
    routes,
    stops,
    localCars: cars,
    raw: favorites.map((f) => ({ id: f.id, itemType: f.itemType, itemId: f.itemId })),
  })
})

const FavoriteBody = z.object({
  itemType: pyEnum(ENUMS.favoriteType),
  itemId: pyStr(),
})

const findFavorites = (userId, b) =>
  all('SELECT * FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?', userId, b.itemType, b.itemId)

router.post('/users/me/favorites', requireUser, async (req, res) => {
  const { data: b } = pyBody(req, FavoriteBody)
  let existing = (await findFavorites(req.user.id, b))[0]
  if (!existing) {
    existing = await insert('favorites', { id: newId(), userId: req.user.id, itemType: b.itemType, itemId: b.itemId, createdAt: Date.now() })
  }
  ok(res, { id: existing.id, itemType: existing.itemType, itemId: existing.itemId }, 'Added to favourites', 201)
})

router.delete('/users/me/favorites', requireUser, async (req, res) => {
  const { data: b } = pyBody(req, FavoriteBody)
  await run('DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?', req.user.id, b.itemType, b.itemId)
  ok(res, null, 'Removed from favourites')
})

// ---------------------------------------------------------------- recent searches

router.get('/users/me/recent-searches', requireUser, async (req, res) => {
  const q = new QueryReader(req.query)
  const limit = q.int('limit', 10, { min: 1, max: 50 })
  q.done()
  const items = await all(
    'SELECT * FROM recent_searches WHERE user_id = ? ORDER BY searched_at DESC, id LIMIT ?',
    req.user.id,
    limit,
  )
  ok(res, items.map(recentSearchOut))
})

router.delete('/users/me/recent-searches', requireUser, async (req, res) => {
  await run('DELETE FROM recent_searches WHERE user_id = ?', req.user.id)
  ok(res, null, 'Search history cleared')
})

router.delete('/users/me/recent-searches/:searchId', requireUser, async (req, res) => {
  await run('DELETE FROM recent_searches WHERE id = ? AND user_id = ?', req.params.searchId, req.user.id)
  ok(res, null, 'Removed')
})

export default router
