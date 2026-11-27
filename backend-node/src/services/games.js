// Online game rooms. Hostinger's plan has no inbound WebSockets and stops idle apps, so nothing
// lives in memory: every room is a database row, phones poll it, and a missed turn is
// noticed on the next request instead of by a timer.
import crypto from 'node:crypto'
import { all, at, byId, get, insert, like, run, scalar, tx, update } from '../db.js'
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

const playersOf = (roomId) => all('SELECT * FROM game_players WHERE game_room_id = ? ORDER BY seat', roomId)

const firstName = (name) => String(name || 'Player').trim().split(/\s+/)[0]

// Moves and board are cleared 3 days after a game ends (the result and points stay).
const stateOf = (room) => JSON.parse(room.gameData || '{}')

async function newCode() {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)]).join('')
    if (!(await get('SELECT id FROM game_rooms WHERE room_code = ? AND status IN (?, ?)', code, 'WAITING', 'PLAYING'))) return code
  }
}

async function createRoom(game, user, { isPublic }) {
  const now = Date.now()
  const room = await insert('game_rooms', {
    id: newId(),
    game,
    roomCode: isPublic ? null : await newCode(),
    isPublic: isPublic ? 1 : 0,
    status: 'WAITING',
    gameData: '{}',
    turnEndsAt: null,
    version: 1,
    result: null,
    createdAt: now,
    updatedAt: now,
  })
  await insert('game_players', { id: newId(), gameRoomId: room.id, userId: user.id, seat: 0, pointsEarned: 0 })
  return byId('game_rooms', room.id)
}

/** Add a player; the game starts as soon as the last seat is filled. */
async function seatPlayer(room, user) {
  const engine = engineFor(room.game)
  const seated = await playersOf(room.id)
  const taken = seated.map((p) => p.seat)
  // Someone may have left a half-full table, so the next seat is not always the last one.
  const seat = Array.from({ length: engine.seats }, (_, s) => s).find((s) => !taken.includes(s))
  await insert('game_players', { id: newId(), gameRoomId: room.id, userId: user.id, seat, pointsEarned: 0 })
  if (seated.length + 1 < engine.seats) return bump(room, {})
  return bump(room, { status: 'PLAYING', gameData: JSON.stringify(engine.start()), turnEndsAt: Date.now() + TURN_MS })
}

async function bump(room, patch) {
  await update('game_rooms', room.id, { ...patch, version: room.version + 1, updatedAt: Date.now() })
  return byId('game_rooms', room.id)
}

async function addScore(userId, points, outcome) {
  const now = at(Date.now())
  const won = outcome === 'win' ? 1 : 0
  const drew = outcome === 'draw' ? 1 : 0
  await run(
    `INSERT INTO leaderboard (user_id, points, wins, draws, played, updated_at) VALUES (?, ?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE points = points + ?, wins = wins + ?, draws = draws + ?, played = played + 1, updated_at = ?`,
    userId, points, won, drew, now, points, won, drew, now,
  )
}

/** Finished games these two people have already played together today. */
async function gamesTogetherToday(a, b) {
  return Number(
    (await scalar(
      `SELECT COUNT(r.id) FROM game_rooms r
       JOIN game_players x ON x.game_room_id = r.id AND x.user_id = ?
       JOIN game_players y ON y.game_room_id = r.id AND y.user_id = ?
       WHERE r.status = 'FINISHED' AND r.updated_at >= ?`,
      a, b, at(Date.now() - DAY_MS),
    )) || 0,
  )
}

async function finish(room, outcome) {
  const players = await playersOf(room.id)
  // Judged per player: two friends at their limit must not cost the strangers at their table.
  const canScore = async (p) => {
    for (const q of players) if (p.id !== q.id && (await gamesTogetherToday(p.userId, q.userId)) >= MAX_SCORED_GAMES_PER_PAIR_PER_DAY) return false
    return true
  }
  for (const player of players) {
    const scored = await canScore(player)
    const quit = player.seat === outcome.forfeited
    const won = outcome.winners.includes(player.seat)
    const type = quit ? 'loss' : outcome.winners.length === 0 ? 'draw' : won ? 'win' : 'loss'
    // Someone who quit or ran out of time earns nothing.
    const points = !scored || quit ? 0 : POINTS[type]
    if (scored) await addScore(player.userId, points, type)
    await update('game_players', player.id, { pointsEarned: points })
  }
  return bump(room, { status: 'FINISHED', turnEndsAt: null, result: JSON.stringify(outcome) })
}

/**
 * A player left or missed a turn. Team games name the winners; otherwise the rival wins, but at a
 * bigger table nobody beat the others, so they share a draw rather than each taking a full win.
 */
async function forfeit(room, seat, what, who) {
  const engine = engineFor(room.game)
  const players = await playersOf(room.id)
  const winners = engine.forfeitWinners?.(seat) ?? (engine.seats > 2 ? [] : players.map((p) => p.seat).filter((s) => s !== seat))
  // The seat can be empty: a super admin's delete cascades to the player row.
  const name = who ?? firstName((await byId('users', players.find((p) => p.seat === seat)?.userId))?.name)
  return finish(room, { winners, reason: `${name} ${what}`, forfeited: seat })
}

/**
 * Inside a transaction: the room, locked until the transaction ends. Every change to a game goes
 * through this, or two phones asking at the same moment could both end the game and both hand out
 * the points.
 */
const lockRoom = (id) => get('SELECT * FROM game_rooms WHERE id = ? FOR UPDATE', id)

// Counted from the last join: a four-seat table takes longer to fill than a two-seat one.
const unjoinedTooLong = (room, now) => room.status === 'WAITING' && now - room.updatedAt > WAITING_MS
const outOfTime = (room, now) => room.status === 'PLAYING' && now > room.turnEndsAt

/** Bring a room up to date: expire an unjoined room, or end a game whose turn timed out. */
async function settle(room) {
  if (!unjoinedTooLong(room, Date.now()) && !outOfTime(room, Date.now())) return room
  return tx(async () => {
    // Read again under the lock: another request may have settled it a moment ago.
    const fresh = await lockRoom(room.id)
    const now = Date.now()
    if (unjoinedTooLong(fresh, now)) return bump(fresh, { status: 'CANCELLED' })
    if (outOfTime(fresh, now)) return forfeit(fresh, GAMES[fresh.game].turn(stateOf(fresh)), 'ran out of time')
    return fresh
  })
}

export async function roomOut(room, userId) {
  const engine = engineFor(room.game)
  const players = await playersOf(room.id)
  const me = players.find((p) => p.userId === userId)
  if (!me) throw ApiError.forbidden('You are not in this game')
  const state = stateOf(room)
  const live = room.status === 'PLAYING'
  const shown = room.status !== 'WAITING' && room.status !== 'CANCELLED' && room.gameData
  return {
    id: room.id,
    game: room.game,
    code: room.roomCode,
    status: room.status,
    version: room.version,
    seat: me.seat,
    seats: engine.seats,
    turn: live ? engine.turn(state) : null,
    secondsLeft: live ? Math.max(0, Math.ceil((room.turnEndsAt - Date.now()) / 1000)) : null,
    players: await Promise.all(
      players.map(async (p) => {
        const user = await byId('users', p.userId)
        return { seat: p.seat, name: firstName(user?.name), avatarUrl: user?.pictureUrl ?? null, pointsEarned: p.pointsEarned }
      }),
    ),
    view: shown ? engine.view(state, me.seat) : null,
    result: room.result ? JSON.parse(room.result) : null,
  }
}

async function activeRoom(game, userId) {
  const row = await get(
    `SELECT r.* FROM game_rooms r JOIN game_players p ON p.game_room_id = r.id
     WHERE p.user_id = ? AND r.game = ? AND r.status IN ('WAITING', 'PLAYING') ORDER BY r.created_at DESC, r.id DESC LIMIT 1`,
    userId, game,
  )
  if (!row) return null
  const room = await settle(row)
  return room.status === 'WAITING' || room.status === 'PLAYING' ? room : null
}

/** Sit at the oldest open table, or open a new one. */
export async function quickMatch(game, user) {
  engineFor(game)
  return tx(async () => {
    const existing = await activeRoom(game, user.id)
    if (existing) return existing
    const open = await all(`SELECT * FROM game_rooms WHERE game = ? AND status = 'WAITING' AND is_public = 1 ORDER BY created_at, id LIMIT 20`, game)
    for (const row of open) {
      // Locked, so two people sitting down at once don't both take the same seat.
      const room = await settle(await lockRoom(row.id))
      if (room.status === 'WAITING') return seatPlayer(room, user)
    }
    return createRoom(game, user, { isPublic: true })
  })
}

export async function createPrivateRoom(game, user) {
  engineFor(game)
  return tx(async () => (await activeRoom(game, user.id)) ?? createRoom(game, user, { isPublic: false }))
}

export async function joinByCode(rawCode, user) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : ''
  return tx(async () => {
    const row = await get(`SELECT id FROM game_rooms WHERE room_code = ? AND status IN ('WAITING', 'PLAYING')`, code)
    if (!row) throw ApiError.notFound('No game found with that code')
    const found = await lockRoom(row.id)
    if ((await playersOf(found.id)).some((p) => p.userId === user.id)) return found
    const room = await settle(found)
    if (room.status !== 'WAITING') throw ApiError.badRequest('That game has already started')
    const mine = await activeRoom(room.game, user.id)
    if (mine?.status === 'PLAYING') throw ApiError.badRequest('Finish your current game first')
    if (mine) await withdraw(mine, user.id)
    return seatPlayer(room, user)
  })
}

/** `lock` inside a transaction that changes the game. */
const roomFor = async (id, userId, { lock = false } = {}) => {
  const room = lock ? await lockRoom(id) : await byId('game_rooms', id)
  if (!room) throw ApiError.notFound('Game not found')
  if (!(await get('SELECT id FROM game_players WHERE game_room_id = ? AND user_id = ?', id, userId))) throw ApiError.forbidden('You are not in this game')
  return room
}

export const pollRoom = async (id, userId) => settle(await roomFor(id, userId))

export async function playMove(id, user, input) {
  return tx(async () => {
    const room = await settle(await roomFor(id, user.id, { lock: true }))
    if (room.status !== 'PLAYING') throw ApiError.badRequest('This game has ended')
    const engine = engineFor(room.game)
    const state = stateOf(room)
    const seat = (await playersOf(room.id)).find((p) => p.userId === user.id).seat
    if (engine.turn(state) !== seat) throw ApiError.badRequest('It is not your turn')
    const moved = engine.move(state, seat, input)
    const saved = await bump(room, { gameData: JSON.stringify(moved.state), turnEndsAt: Date.now() + TURN_MS })
    return moved.result ? finish(saved, moved.result) : saved
  })
}

/** Stand up from a table that has not started. Anyone else stays seated. */
async function withdraw(room, userId) {
  if ((await playersOf(room.id)).length === 1) return bump(room, { status: 'CANCELLED' })
  await run('DELETE FROM game_players WHERE game_room_id = ? AND user_id = ?', room.id, userId)
  return bump(room, {})
}

/** Null when the player left before the start, as they then have no room to be shown. */
export async function leaveRoom(id, user) {
  return tx(async () => {
    const room = await settle(await roomFor(id, user.id, { lock: true }))
    if (room.status === 'WAITING') {
      await withdraw(room, user.id)
      return null
    }
    if (room.status !== 'PLAYING') return room
    const seat = (await playersOf(room.id)).find((p) => p.userId === user.id).seat
    return forfeit(room, seat, 'left the game')
  })
}

/**
 * Call inside the deletion's transaction, before the score rows go: an account left seated would
 * keep a table open for strangers and bring its score row back when the game ended.
 * The stored result outlives the account, so it carries no name.
 */
export async function leaveActiveRooms(userId) {
  const rooms = await all(
    `SELECT r.* FROM game_rooms r JOIN game_players p ON p.game_room_id = r.id
     WHERE p.user_id = ? AND r.status IN ('WAITING', 'PLAYING')`,
    userId,
  )
  for (const row of rooms) {
    const room = await settle(await lockRoom(row.id))
    if (room.status === 'WAITING') await withdraw(room, userId)
    if (room.status === 'PLAYING') await forfeit(room, (await playersOf(room.id)).find((p) => p.userId === userId).seat, 'left the game', 'A player')
  }
}

export async function leaderboard(userId, search) {
  const active = `FROM leaderboard s JOIN users u ON u.id = s.user_id WHERE u.status = 'ACTIVE'`
  const filter = search ? ' AND u.name LIKE ?' : ''
  const rows = await all(
    `SELECT s.*, u.name, u.picture_url ${active}${filter} ORDER BY s.points DESC, s.wins DESC, s.updated_at, s.user_id LIMIT 50`,
    ...(search ? [like(search)] : []),
  )
  const mine = userId ? await get('SELECT * FROM leaderboard WHERE user_id = ?', userId) : null
  const ahead = mine
    ? Number((await scalar(`SELECT COUNT(s.user_id) ${active} AND (s.points > ? OR (s.points = ? AND s.wins > ?))`, mine.points, mine.points, mine.wins)) || 0)
    : 0
  const row = (r, rank) => ({ rank, name: firstName(r.name), avatarUrl: r.pictureUrl ?? null, points: r.points, wins: r.wins, played: r.played, isMe: r.userId === userId })
  return { rows: rows.map((r, i) => row(r, i + 1)), me: mine ? row({ ...mine, name: 'You' }, ahead + 1) : null }
}
