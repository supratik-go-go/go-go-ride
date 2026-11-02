// Online game rooms. Hostinger's plan has no inbound WebSockets and stops idle apps, so nothing
// lives in memory: every room is a database row, phones poll it, and a missed turn is
// noticed on the next request instead of by a timer.
import crypto from 'node:crypto'
import { all, byId, get, insert, like, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { chess } from '../games/chess.js'
import { newId } from '../ids.js'

export const GAMES = { chess }

const TURN_MS = 60 * 1000
const WAITING_MS = 10 * 60 * 1000
const POINTS = { win: 10, draw: 3, loss: 1 }
// Stops two friends farming points by replaying each other.
const MAX_SCORED_GAMES_PER_PAIR_PER_DAY = 5
const DAY_MS = 24 * 60 * 60 * 1000
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const engineFor = (game) => {
  const engine = GAMES[game]
  if (!engine) throw ApiError.notFound('Game not found')
  return engine
}

const playersOf = (roomId) => all('SELECT * FROM "GamePlayer" WHERE "roomId" = ? ORDER BY seat', roomId)

const firstName = (name) => String(name || 'Player').trim().split(/\s+/)[0]

function newCode() {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('')
    if (!get('SELECT id FROM "GameRoom" WHERE code = ? AND status IN (?, ?)', code, 'WAITING', 'PLAYING')) return code
  }
}

function createRoom(game, user, { isPublic }) {
  const now = Date.now()
  const room = insert('GameRoom', {
    id: newId(),
    game,
    code: isPublic ? null : newCode(),
    isPublic: isPublic ? 1 : 0,
    status: 'WAITING',
    state: '{}',
    turnDeadline: null,
    version: 1,
    result: null,
    createdAt: now,
    updatedAt: now,
  })
  insert('GamePlayer', { id: newId(), roomId: room.id, userId: user.id, seat: 0, pointsEarned: 0 })
  return room
}

/** Add a player; the game starts as soon as the last seat is filled. */
function seatPlayer(room, user) {
  const engine = engineFor(room.game)
  const seated = playersOf(room.id)
  insert('GamePlayer', { id: newId(), roomId: room.id, userId: user.id, seat: seated.length, pointsEarned: 0 })
  if (seated.length + 1 < engine.seats) return bump(room, {})
  return bump(room, { status: 'PLAYING', state: JSON.stringify(engine.start()), turnDeadline: Date.now() + TURN_MS })
}

function bump(room, patch) {
  update('GameRoom', room.id, { ...patch, version: room.version + 1, updatedAt: Date.now() })
  return byId('GameRoom', room.id)
}

function addScore(userId, points, outcome) {
  const now = Date.now()
  const won = outcome === 'win' ? 1 : 0
  const drew = outcome === 'draw' ? 1 : 0
  run(
    `INSERT INTO "GameScore" ("userId", points, wins, draws, played, "updatedAt") VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT ("userId") DO UPDATE SET points = points + ?, wins = wins + ?, draws = draws + ?, played = played + 1, "updatedAt" = ?`,
    userId, points, won, drew, now, points, won, drew, now,
  )
}

/** Finished games these two people have already played together today. */
function gamesTogetherToday(a, b) {
  return Number(
    scalar(
      `SELECT COUNT(r.id) FROM "GameRoom" r
       JOIN "GamePlayer" x ON x."roomId" = r.id AND x."userId" = ?
       JOIN "GamePlayer" y ON y."roomId" = r.id AND y."userId" = ?
       WHERE r.status = 'FINISHED' AND r."updatedAt" >= ?`,
      a, b, Date.now() - DAY_MS,
    ) || 0,
  )
}

function finish(room, outcome) {
  const players = playersOf(room.id)
  const scored = players.every((p) => players.every((q) => p.id === q.id || gamesTogetherToday(p.userId, q.userId) < MAX_SCORED_GAMES_PER_PAIR_PER_DAY))
  for (const player of players) {
    const won = outcome.winners.includes(player.seat)
    const type = outcome.winners.length === 0 ? 'draw' : won ? 'win' : 'loss'
    // Someone who quit or ran out of time earns nothing.
    const points = !scored || player.seat === outcome.forfeited ? 0 : POINTS[type]
    if (scored) addScore(player.userId, points, type)
    update('GamePlayer', player.id, { pointsEarned: points })
  }
  return bump(room, { status: 'FINISHED', turnDeadline: null, result: JSON.stringify(outcome) })
}

/** The other seats win when a player leaves or misses a turn. */
function forfeit(room, seat, reason) {
  const winners = playersOf(room.id).map((p) => p.seat).filter((s) => s !== seat)
  return finish(room, { winners, reason, forfeited: seat })
}

/** Bring a room up to date: expire an unjoined room, or end a game whose turn timed out. */
function settle(room) {
  const now = Date.now()
  if (room.status === 'WAITING' && now - room.createdAt > WAITING_MS) return tx(() => bump(room, { status: 'CANCELLED' }))
  if (room.status === 'PLAYING' && now > room.turnDeadline) {
    const turn = GAMES[room.game].turn(JSON.parse(room.state))
    return tx(() => forfeit(room, turn, 'Ran out of time'))
  }
  return room
}

export function roomOut(room, userId) {
  const engine = engineFor(room.game)
  const players = playersOf(room.id)
  const me = players.find((p) => p.userId === userId)
  if (!me) throw ApiError.forbidden('You are not in this game')
  const state = JSON.parse(room.state)
  const live = room.status === 'PLAYING'
  return {
    id: room.id,
    game: room.game,
    code: room.code,
    status: room.status,
    version: room.version,
    seat: me.seat,
    seats: engine.seats,
    turn: live ? engine.turn(state) : null,
    secondsLeft: live ? Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000)) : null,
    players: players.map((p) => {
      const user = byId('User', p.userId)
      return { seat: p.seat, name: firstName(user?.name), avatarUrl: user?.avatarUrl ?? null, pointsEarned: p.pointsEarned }
    }),
    view: room.status === 'WAITING' || room.status === 'CANCELLED' ? null : engine.view(state, me.seat),
    result: room.result ? JSON.parse(room.result) : null,
  }
}

function activeRoom(game, userId) {
  const row = get(
    `SELECT r.* FROM "GameRoom" r JOIN "GamePlayer" p ON p."roomId" = r.id
     WHERE p."userId" = ? AND r.game = ? AND r.status IN ('WAITING', 'PLAYING') ORDER BY r."createdAt" DESC LIMIT 1`,
    userId, game,
  )
  if (!row) return null
  const room = settle(row)
  return room.status === 'WAITING' || room.status === 'PLAYING' ? room : null
}

/** Sit at the oldest open table, or open a new one. */
export function quickMatch(game, user) {
  engineFor(game)
  return tx(() => {
    const existing = activeRoom(game, user.id)
    if (existing) return existing
    const open = all(`SELECT * FROM "GameRoom" WHERE game = ? AND status = 'WAITING' AND "isPublic" = 1 ORDER BY "createdAt" LIMIT 20`, game)
    for (const row of open) {
      const room = settle(row)
      if (room.status === 'WAITING') return seatPlayer(room, user)
    }
    return createRoom(game, user, { isPublic: true })
  })
}

export function createPrivateRoom(game, user) {
  engineFor(game)
  return tx(() => activeRoom(game, user.id) ?? createRoom(game, user, { isPublic: false }))
}

export function joinByCode(rawCode, user) {
  const code = String(rawCode || '').trim().toUpperCase()
  return tx(() => {
    const found = get(`SELECT * FROM "GameRoom" WHERE code = ? AND status IN ('WAITING', 'PLAYING')`, code)
    if (!found) throw ApiError.notFound('No game found with that code')
    if (playersOf(found.id).some((p) => p.userId === user.id)) return found
    const room = settle(found)
    if (room.status !== 'WAITING') throw ApiError.badRequest('That game has already started')
    return seatPlayer(room, user)
  })
}

const roomFor = (id, userId) => {
  const room = byId('GameRoom', id)
  if (!room) throw ApiError.notFound('Game not found')
  if (!get('SELECT id FROM "GamePlayer" WHERE "roomId" = ? AND "userId" = ?', id, userId)) throw ApiError.forbidden('You are not in this game')
  return room
}

export const pollRoom = (id, userId) => settle(roomFor(id, userId))

export function playMove(id, user, input) {
  return tx(() => {
    const room = settle(roomFor(id, user.id))
    if (room.status !== 'PLAYING') throw ApiError.badRequest('This game has ended')
    const engine = engineFor(room.game)
    const state = JSON.parse(room.state)
    const seat = playersOf(room.id).find((p) => p.userId === user.id).seat
    if (engine.turn(state) !== seat) throw ApiError.badRequest('It is not your turn')
    const moved = engine.move(state, seat, input)
    const saved = bump(room, { state: JSON.stringify(moved.state), turnDeadline: Date.now() + TURN_MS })
    return moved.result ? finish(saved, moved.result) : saved
  })
}

export function leaveRoom(id, user) {
  return tx(() => {
    const room = settle(roomFor(id, user.id))
    if (room.status === 'WAITING') return bump(room, { status: 'CANCELLED' })
    if (room.status !== 'PLAYING') return room
    const seat = playersOf(room.id).find((p) => p.userId === user.id).seat
    return forfeit(room, seat, 'Player left the game')
  })
}

export function leaderboard(userId, search) {
  const active = `FROM "GameScore" s JOIN "User" u ON u.id = s."userId" WHERE u.status = 'ACTIVE'`
  const filter = search ? ' AND u.name LIKE ?' : ''
  const rows = all(
    `SELECT s.*, u.name, u."avatarUrl" ${active}${filter} ORDER BY s.points DESC, s.wins DESC, s."updatedAt" LIMIT 50`,
    ...(search ? [like(search)] : []),
  )
  const mine = userId ? get(`SELECT * FROM "GameScore" WHERE "userId" = ?`, userId) : null
  const ahead = mine
    ? Number(scalar(`SELECT COUNT(s."userId") ${active} AND (s.points > ? OR (s.points = ? AND s.wins > ?))`, mine.points, mine.points, mine.wins) || 0)
    : 0
  const row = (r, rank) => ({ rank, name: firstName(r.name), avatarUrl: r.avatarUrl ?? null, points: r.points, wins: r.wins, played: r.played, isMe: r.userId === userId })
  return { rows: rows.map((r, i) => row(r, i + 1)), me: mine ? row({ ...mine, name: 'You' }, ahead + 1) : null }
}
