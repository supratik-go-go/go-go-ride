// Ping Ball is played alone on the phone because live play needs a connection the host forbids.
// The phone reports its own score and can fake it, so a run is worth little and few runs pay.
import { get, insert, run, tx } from '../db.js'
import { ApiError } from '../errors.js'
import { newId } from '../ids.js'

const GAME = 'pingball'
const MAX_SCORE = 500
const MAX_POINTS = 5
const POINT_EVERY = 10
const PAID_RUNS_PER_DAY = 5
const DAY_MS = 24 * 60 * 60 * 1000

/** Points for a run, given how many runs already earned points in the last 24 hours. */
export function pointsFor(score, runsToday) {
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) throw ApiError.badRequest('Invalid score')
  if (runsToday >= PAID_RUNS_PER_DAY) return 0
  return Math.min(MAX_POINTS, Math.floor(score / POINT_EVERY))
}

const paidRunsToday = (userId) =>
  get(
    `SELECT COUNT(id) AS runs FROM "ArcadeRun" WHERE "userId" = ? AND game = ? AND points > 0 AND "createdAt" >= ?`,
    userId, GAME, Date.now() - DAY_MS,
  ).runs

function addScore(userId, points) {
  const now = Date.now()
  run(
    `INSERT INTO "GameScore" ("userId", points, wins, draws, played, "updatedAt") VALUES (?, ?, 0, 0, 1, ?)
     ON CONFLICT ("userId") DO UPDATE SET points = points + ?, played = played + 1, "updatedAt" = ?`,
    userId, points, now, points, now,
  )
}

export function bestScore(userId) {
  return get('SELECT MAX(score) AS best FROM "ArcadeRun" WHERE "userId" = ? AND game = ?', userId, GAME).best ?? 0
}

export function recordScore(user, score) {
  return tx(() => {
    const points = pointsFor(score, paidRunsToday(user.id))
    // Anyone can post scores all day, so a run that pays nothing and beats nothing leaves no row.
    if (points > 0 || score > bestScore(user.id)) insert('ArcadeRun', { id: newId(), userId: user.id, game: GAME, score, points, createdAt: Date.now() })
    // Unpaid runs stay off the board, as unscored room games do: a tie is broken by the older updatedAt.
    if (points > 0) addScore(user.id, points)
    return { score, points, best: bestScore(user.id) }
  })
}
