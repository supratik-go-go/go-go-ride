// Profile, favourites, recent searches and login history (port of app/api/profile.py).
import { Router } from 'express'
import { all, byId, get, insert, placeholders, run, scalar, update } from '../db.js'
import { ApiError } from '../errors.js'
import { meta, ok } from '../http.js'
import { newId } from '../ids.js'
import { requireUser } from '../auth.js'
import { loginActivityOut, recentSearchOut, userOut } from '../serialize.js'
import { singleFile, saveUpload } from '../uploads.js'
import { ENUMS } from '../validate.js'
import { pyBody, pyEnum, pyOpt, pyStr, QueryReader, z } from '../pyvalidate.js'

const router = Router()

const num = (v) => (v === null || v === undefined ? v : Number(v))

// ---------------------------------------------------------------- profile

router.get('/users/me', requireUser, (req, res) => ok(res, userOut(req.user)))

const ProfileBody = z.object({
  name: pyOpt(pyStr({ min: 2, max: 80 })),
  email: pyOpt(pyStr()),
  avatarUrl: pyOpt(pyStr()),
})

router.patch('/users/me', requireUser, (req, res) => {
  const { data, set } = pyBody(req, ProfileBody)
  const user = req.user
  const updates = Object.fromEntries(set.map((k) => [k, data[k] ?? null]))
  if (updates.email) {
    const clash = get('SELECT id FROM "User" WHERE email = ? AND id != ?', updates.email, user.id)
    if (clash) throw ApiError.conflict('An account with this email already exists')
  }
  // Only columns whose value actually changes are written (and bump updatedAt), like SQLAlchemy.
  const changed = Object.fromEntries(Object.entries(updates).filter(([k, v]) => v !== user[k]))
  if (Object.keys(changed).length) update('User', user.id, { ...changed, updatedAt: Date.now() })
  ok(res, userOut(byId('User', user.id)), 'Profile updated')
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

router.post('/users/me/avatar', requireUser, avatarFile, (req, res) => {
  const url = saveUpload(req.file, 'avatars')
  update('User', req.user.id, { avatarUrl: url, updatedAt: Date.now() })
  ok(res, userOut(byId('User', req.user.id)), 'Photo updated')
})

router.get('/users/me/login-activity', requireUser, (req, res) => {
  const q = new QueryReader(req.query)
  const p = q.page()
  q.done()
  const userId = req.user.id
  const total = Number(scalar('SELECT count("LoginActivity".id) AS c FROM "LoginActivity" WHERE "LoginActivity"."userId" = ?', userId) || 0)
  const items = all(
    'SELECT * FROM "LoginActivity" WHERE "LoginActivity"."userId" = ? ORDER BY "LoginActivity"."createdAt" DESC LIMIT ? OFFSET ?',
    userId,
    p.limit,
    p.skip,
  )
  res.json({ success: true, message: 'Success', data: items.map(loginActivityOut), meta: meta(total, p) })
})

// ---------------------------------------------------------------- favourites

const FAVORITE_KINDS = ['BUS', 'ROUTE', 'STOP', 'LOCAL_CAR']

/** SELECT * FROM table WHERE id IN (...) - no ORDER BY, exactly like the Python fetch(). */
const fetchByIds = (table, keys) => (keys.length ? all(`SELECT * FROM "${table}" WHERE "${table}".id IN (${placeholders(keys)})`, ...keys) : [])

router.get('/users/me/favorites', requireUser, (req, res) => {
  const favorites = all('SELECT * FROM "Favorite" WHERE "Favorite"."userId" = ? ORDER BY "Favorite"."createdAt" DESC', req.user.id)
  const ids = Object.fromEntries(FAVORITE_KINDS.map((kind) => [kind, favorites.filter((f) => f.itemType === kind).map((f) => f.itemId)]))

  const buses = fetchByIds('Bus', ids.BUS).map((b) => {
    const route = byId('Route', b.routeId)
    return {
      id: b.id,
      busNumber: b.busNumber,
      busName: b.busName ?? null,
      type: b.type,
      fare: num(b.fare),
      ratingAvg: num(b.ratingAvg),
      route: route ? { name: route.name, routeNumber: route.routeNumber } : null,
    }
  })
  const routes = fetchByIds('Route', ids.ROUTE).map((r) => ({
    id: r.id,
    name: r.name,
    routeNumber: r.routeNumber,
    distanceKm: num(r.distanceKm),
  }))
  const stops = fetchByIds('BusStop', ids.STOP).map((s) => ({ id: s.id, name: s.name, area: s.area ?? null }))
  const cars = fetchByIds('LocalCar', ids.LOCAL_CAR).map((c) => ({
    id: c.id,
    driverName: c.driverName,
    phone: c.phone,
    area: c.area,
    ratingAvg: num(c.ratingAvg),
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
  all('SELECT * FROM "Favorite" WHERE "userId" = ? AND "itemType" = ? AND "itemId" = ?', userId, b.itemType, b.itemId)

router.post('/users/me/favorites', requireUser, (req, res) => {
  const { data: b } = pyBody(req, FavoriteBody)
  let existing = findFavorites(req.user.id, b)[0]
  if (!existing) {
    existing = insert('Favorite', { id: newId(), userId: req.user.id, itemType: b.itemType, itemId: b.itemId, createdAt: Date.now() })
  }
  ok(res, { id: existing.id, itemType: existing.itemType, itemId: existing.itemId }, 'Added to favourites', 201)
})

router.delete('/users/me/favorites', requireUser, (req, res) => {
  const { data: b } = pyBody(req, FavoriteBody)
  run('DELETE FROM "Favorite" WHERE "userId" = ? AND "itemType" = ? AND "itemId" = ?', req.user.id, b.itemType, b.itemId)
  ok(res, null, 'Removed from favourites')
})

// ---------------------------------------------------------------- recent searches

router.get('/users/me/recent-searches', requireUser, (req, res) => {
  const q = new QueryReader(req.query)
  const limit = q.int('limit', 10, { min: 1, max: 50 })
  q.done()
  const items = all(
    'SELECT * FROM "RecentSearch" WHERE "RecentSearch"."userId" = ? ORDER BY "RecentSearch"."searchedAt" DESC LIMIT ?',
    req.user.id,
    limit,
  )
  ok(res, items.map(recentSearchOut))
})

router.delete('/users/me/recent-searches', requireUser, (req, res) => {
  run('DELETE FROM "RecentSearch" WHERE "userId" = ?', req.user.id)
  ok(res, null, 'Search history cleared')
})

router.delete('/users/me/recent-searches/:searchId', requireUser, (req, res) => {
  run('DELETE FROM "RecentSearch" WHERE id = ? AND "userId" = ?', req.params.searchId, req.user.id)
  ok(res, null, 'Removed')
})

export default router
