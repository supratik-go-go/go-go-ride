// Online game rooms. Hostinger's plan has no inbound WebSockets and stops idle apps, so nothing
// lives in memory: every room is a database row, phones poll it, and a missed turn is
// noticed on the next request instead of by a timer.
import crypto from 'node:crypto'
import { all, byId, get, insert, like, run, scalar, tx, update } from '../db.js'
import { ApiError } from '../errors.js'
import { callbreak } from '../games/callbreak.js'
import { carrom } from '../games/carrom.js'
import { chess } from '../games/chess.js'
import { ludo } from '../games/ludo.js'
import { twentynine } from '../games/twentynine.js'
import { newId } from '../ids.js'

export const GAMES = { chess, ludo, callbreak, twentynine, carrom }

const TURN_MS = 60 * 1000
const WAITING_MS = 10 * 60 * 1000
const POINTS = { win: 10, draw: 3, loss: 1 }
// Stops two friends farming points by replaying each other.
const MAX_SCORED_GAMES_PER_PAIR_PER_DAY = 5
const DAY_MS = 24 * 60 * 60 * 1000
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const engineFor = (game) => {
  // The name comes from the URL, and every object answers to 'constructor'.
  if (!Object.hasOwn(GAMES, game)) throw ApiError.notFound('Game not found')
  return GAMES[game]
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
  const taken = seated.map((p) => p.seat)
  // Someone may have left a half-full table, so the next seat is not always the last one.
  const seat = Array.from({ length: engine.seats }, (_, s) => s).find((s) => !taken.includes(s))
  insert('GamePlayer', { id: newId(), roomId: room.id, userId: user.id, seat, pointsEarned: 0 })
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
  // Judged per player: two friends at their limit must not cost the strangers at their table.
  const canScore = (p) => players.every((q) => p.id === q.id || gamesTogetherToday(p.userId, q.userId) < MAX_SCORED_GAMES_PER_PAIR_PER_DAY)
  for (const player of players) {
    const scored = canScore(player)
    const quit = player.seat === outcome.forfeited
    const won = outcome.winners.includes(player.seat)
    const type = quit ? 'loss' : outcome.winners.length === 0 ? 'draw' : won ? 'win' : 'loss'
    // Someone who quit or ran out of time earns nothing.
    const points = !scored || quit ? 0 : POINTS[type]
    if (scored) addScore(player.userId, points, type)
    update('GamePlayer', player.id, { pointsEarned: points })
  }
  return bump(room, { status: 'FINISHED', turnDeadline: null, result: JSON.stringify(outcome) })
}

/**
 * A player left or missed a turn. Team games name the winners; otherwise the rival wins, but at a
 * bigger table nobody beat the others, so they share a draw rather than each taking a full win.
 */
function forfeit(room, seat, what, who) {
  const engine = engineFor(room.game)
  const players = playersOf(room.id)
  const winners = engine.forfeitWinners?.(seat) ?? (engine.seats > 2 ? [] : players.map((p) => p.seat).filter((s) => s !== seat))
  // The seat can be empty: a super admin's delete cascades to the player row.
  const name = who ?? firstName(byId('User', players.find((p) => p.seat === seat)?.userId)?.name)
  return finish(room, { winners, reason: `${name} ${what}`, forfeited: seat })
}

/** Bring a room up to date: expire an unjoined room, or end a game whose turn timed out. */
function settle(room) {
  const now = Date.now()
  // Counted from the last join: a four-seat table takes longer to fill than a two-seat one.
  if (room.status === 'WAITING' && now - room.updatedAt > WAITING_MS) return tx(() => bump(room, { status: 'CANCELLED' }))
  if (room.status === 'PLAYING' && now > room.turnDeadline) {
    const turn = GAMES[room.game].turn(JSON.parse(room.state))
    return tx(() => forfeit(room, turn, 'ran out of time'))
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
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : ''
  return tx(() => {
    const found = get(`SELECT * FROM "GameRoom" WHERE code = ? AND status IN ('WAITING', 'PLAYING')`, code)
    if (!found) throw ApiError.notFound('No game found with that code')
    if (playersOf(found.id).some((p) => p.userId === user.id)) return found
    const room = settle(found)
    if (room.status !== 'WAITING') throw ApiError.badRequest('That game has already started')
    const mine = activeRoom(room.game, user.id)
    if (mine?.status === 'PLAYING') throw ApiError.badRequest('Finish your current game first')
    if (mine) withdraw(mine, user.id)
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

/** Stand up from a table that has not started. Anyone else stays seated. */
function withdraw(room, userId) {
  if (playersOf(room.id).length === 1) return bump(room, { status: 'CANCELLED' })
  run('DELETE FROM "GamePlayer" WHERE "roomId" = ? AND "userId" = ?', room.id, userId)
  return bump(room, {})
}

/** Null when the player left before the start, as they then have no room to be shown. */
export function leaveRoom(id, user) {
  return tx(() => {
    const room = settle(roomFor(id, user.id))
    if (room.status === 'WAITING') {
      withdraw(room, user.id)
      return null
    }
    if (room.status !== 'PLAYING') return room
    const seat = playersOf(room.id).find((p) => p.userId === user.id).seat
    return forfeit(room, seat, 'left the game')
  })
}

/**
 * Call inside the deletion's transaction, before the score rows go: an account left seated would
 * keep a table open for strangers and bring its score row back when the game ended.
 * The stored result outlives the account, so it carries no name.
 */
export function leaveActiveRooms(userId) {
  const rooms = all(
    `SELECT r.* FROM "GameRoom" r JOIN "GamePlayer" p ON p."roomId" = r.id
     WHERE p."userId" = ? AND r.status IN ('WAITING', 'PLAYING')`,
    userId,
  )
  for (const row of rooms) {
    const room = settle(row)
    if (room.status === 'WAITING') withdraw(room, userId)
    if (room.status === 'PLAYING') forfeit(room, playersOf(room.id).find((p) => p.userId === userId).seat, 'left the game', 'A player')
  }
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
