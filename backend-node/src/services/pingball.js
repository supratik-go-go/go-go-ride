// Ping Ball is played alone on the phone because live play needs a connection the host forbids.
// The phone reports its own score and can fake it, so a run is worth little and few runs pay.
import { at, get, insert, run, tx } from '../db.js'
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

const paidRunsToday = async (userId) =>
  Number(
    (await get('SELECT COUNT(id) AS runs FROM arcade_scores WHERE user_id = ? AND game = ? AND points > 0 AND created_at >= ?', userId, GAME, at(Date.now() - DAY_MS)))
      .runs,
  )

async function addScore(userId, points) {
  const now = at(Date.now())
  await run(
    `INSERT INTO leaderboard (user_id, points, wins, draws, played, updated_at) VALUES (?, ?, 0, 0, 1, ?)
     ON DUPLICATE KEY UPDATE points = points + ?, played = played + 1, updated_at = ?`,
    userId, points, now, points, now,
  )
}

export async function bestScore(userId) {
  return (await get('SELECT MAX(score) AS best FROM arcade_scores WHERE user_id = ? AND game = ?', userId, GAME)).best ?? 0
}

export async function recordScore(user, score) {
  return tx(async () => {
    // One run at a time per person, or runs sent all at once could each count as a paid run.
    await get('SELECT id FROM users WHERE id = ? FOR UPDATE', user.id)
    const points = pointsFor(score, await paidRunsToday(user.id))
    // Anyone can post scores all day, so a run that pays nothing and beats nothing leaves no row.
    if (points > 0 || score > (await bestScore(user.id))) {
      await insert('arcade_scores', { id: newId(), userId: user.id, game: GAME, score, points, createdAt: Date.now() })
    }
    // Unpaid runs stay off the board, as unscored room games do: a tie is broken by the older updatedAt.
    if (points > 0) await addScore(user.id, points)
    return { score, points, best: await bestScore(user.id) }
  })
}
