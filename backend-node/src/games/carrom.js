// Online carrom. The server plays out every shot itself, so neither phone can fake where the coins went.
import { ApiError } from '../errors.js'

const SIZE = 1000
const CENTRE = SIZE / 2
const COIN = 22
const STRIKER = 28
const POCKET = 40
// Each player's striker line, as they see it with their own side at the bottom.
const BASE = 840
const LINE_FROM = 200
const LINE_TO = 800
// Rows tried if coins block the whole striker line.
const SPARE_ROWS = [900, 780, 720]

const MAX_SHOTS = 120
const QUEEN = 18
const STRIKER_ID = 19
const COINS_EACH = 9
const COLOURS = [[0, 9], [9, 18]]

// Units per step. Kept below a coin's radius, so nothing can jump through anything.
const MIN_SPEED = 1.5
const MAX_SPEED = 14
const STRIKER_MASS = 2
const WALL_BOUNCE = 0.8
const COIN_BOUNCE = 0.92
const DRAG = 0.0025
const ROLLING_LOSS = 0.02
const MAX_STEPS = 1500
const SAMPLE_EVERY = 3
const MAX_FRAMES = 80
// A piece moving less than this between frames is left out, to keep the saved shot small.
const MIN_FRAME_MOVE = 3

const clamp = (n, low, high) => Math.min(high, Math.max(low, n))
const ownerOf = (i) => (i < COINS_EACH ? 0 : i < QUEEN ? 1 : null)

function layout() {
  const sides = [[], []]
  const ring = (count, radius) => {
    for (let i = 0; i < count; i += 1) {
      const a = (i * 2 * Math.PI) / count
      sides[i % 2].push([Math.round(CENTRE + radius * Math.cos(a)), Math.round(CENTRE + radius * Math.sin(a))])
    }
  }
  ring(6, 46)
  ring(12, 92)
  return [...sides[0], ...sides[1], [CENTRE, CENTRE]]
}

const isFree = (coins, x, y, radius) => coins.every((c) => !c || Math.hypot(c[0] - x, c[1] - y) >= COIN + radius)

/** The nearest open spot to the middle of the board, for a coin or queen coming back. */
function centreSpot(coins) {
  for (let ring = 0; ring < 10; ring += 1) {
    const count = ring === 0 ? 1 : ring * 6
    for (let i = 0; i < count; i += 1) {
      const a = (i * 2 * Math.PI) / count
      const x = Math.round(CENTRE + ring * 46 * Math.cos(a))
      const y = Math.round(CENTRE + ring * 46 * Math.sin(a))
      if (isFree(coins, x, y, COIN + 1)) return [x, y]
    }
  }
  return [CENTRE, CENTRE]
}

/** The closest spot to the one asked for that does not sit on a coin. */
function strikerSpot(coins, seat, x) {
  const wanted = Math.round(LINE_FROM + x * (LINE_TO - LINE_FROM))
  const onBoard = (own, row) => (seat === 0 ? [own, row] : [SIZE - own, SIZE - row])
  for (const row of [BASE, ...SPARE_ROWS]) {
    for (let gap = 0; gap <= LINE_TO - LINE_FROM; gap += 4) {
      for (const own of [wanted - gap, wanted + gap]) {
        if (own < LINE_FROM || own > LINE_TO) continue
        const [px, py] = onBoard(own, row)
        if (isFree(coins, px, py, STRIKER)) return [px, py]
      }
    }
  }
  return onBoard(wanted, BASE)
}

function bounceOffWalls(b) {
  const far = SIZE - b.r
  if (b.x < b.r) {
    b.x = b.r
    b.vx = Math.abs(b.vx) * WALL_BOUNCE
  } else if (b.x > far) {
    b.x = far
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE
  }
  if (b.y < b.r) {
    b.y = b.r
    b.vy = Math.abs(b.vy) * WALL_BOUNCE
  } else if (b.y > far) {
    b.y = far
    b.vy = -Math.abs(b.vy) * WALL_BOUNCE
  }
}

function collide(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const reach = a.r + b.r
  if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) return
  const gap = Math.hypot(dx, dy)
  if (gap >= reach) return
  const nx = gap ? dx / gap : 1
  const ny = gap ? dy / gap : 0
  const total = 1 / a.m + 1 / b.m
  const overlap = (reach - gap) / total
  a.x -= (nx * overlap) / a.m
  a.y -= (ny * overlap) / a.m
  b.x += (nx * overlap) / b.m
  b.y += (ny * overlap) / b.m
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
  if (closing <= 0) return
  const push = ((1 + COIN_BOUNCE) * closing) / total
  a.vx -= (push * nx) / a.m
  a.vy -= (push * ny) / a.m
  b.vx += (push * nx) / b.m
  b.vy += (push * ny) / b.m
}

function slowDown(b) {
  const speed = Math.hypot(b.vx, b.vy)
  const left = speed * (1 - DRAG) - ROLLING_LOSS
  const scale = left > 0 ? left / speed : 0
  b.vx *= scale
  b.vy *= scale
}

const cornerOf = (v) => (v < CENTRE ? POCKET : SIZE - POCKET)
const inPocket = (b) => Math.hypot(b.x - cornerOf(b.x), b.y - cornerOf(b.y)) < POCKET

/** Thin the shot to MAX_FRAMES, each frame listing only what moved: [piece, x, y, ...], x = -1 when pocketed. */
function compress(trace) {
  const count = Math.min(MAX_FRAMES, trace.length)
  const shown = trace[0].slice()
  const frames = []
  for (let f = 1; f < count; f += 1) {
    const now = trace[Math.round((f * (trace.length - 1)) / (count - 1))]
    const frame = []
    shown.forEach((was, i) => {
      if (!was) return
      if (!now[i]) {
        frame.push(i, -1, -1)
        shown[i] = null
      } else if (Math.abs(now[i][0] - was[0]) + Math.abs(now[i][1] - was[1]) >= MIN_FRAME_MOVE) {
        frame.push(i, now[i][0], now[i][1])
        shown[i] = now[i]
      }
    })
    frames.push(frame)
  }
  return frames
}

/** Run one shot to the point everything stops. Same input, same outcome, every time. */
function simulate(coins, striker) {
  const bodies = coins.map((c) => c && { x: c[0], y: c[1], vx: 0, vy: 0, r: COIN, m: 1 })
  bodies.push({ ...striker, r: STRIKER, m: STRIKER_MASS })
  const snapshot = () => bodies.map((b) => b && [Math.round(b.x), Math.round(b.y)])
  const trace = [snapshot()]
  const pocketed = []

  let steps = 0
  for (; steps < MAX_STEPS; steps += 1) {
    const moving = bodies.filter((b) => b && (b.vx || b.vy))
    if (moving.length === 0) break
    for (const b of moving) {
      b.x += b.vx
      b.y += b.vy
    }
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]
      if (!a) continue
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j]
        if (b && (a.vx || a.vy || b.vx || b.vy)) collide(a, b)
      }
    }
    // Only a piece in motion can drop in. A resting coin rounded onto the rim stays put.
    for (let i = 0; i < bodies.length; i += 1) {
      const b = bodies[i]
      if (!b || !(b.vx || b.vy)) continue
      bounceOffWalls(b)
      slowDown(b)
      if (inPocket(b)) {
        bodies[i] = null
        pocketed.push(i)
      }
    }
    if (steps % SAMPLE_EVERY === 0) trace.push(snapshot())
  }
  trace.push(snapshot())

  const start = trace[0]
  return {
    coins: bodies.slice(0, STRIKER_ID).map((b) => b && [clamp(Math.round(b.x), COIN, SIZE - COIN), clamp(Math.round(b.y), COIN, SIZE - COIN)]),
    pocketed,
    start,
    frames: compress(trace),
    steps,
  }
}

function readShot(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw ApiError.badRequest('That shot is not allowed')
  const { x, angle, power } = input
  if (![x, angle, power].every((n) => typeof n === 'number' && Number.isFinite(n))) throw ApiError.badRequest('That shot is not allowed')
  return { x: clamp(x, 0, 1), angle: clamp(angle, -Math.PI, Math.PI), power: clamp(power, 0, 1) }
}

const coinsIn = (coins, seat) => coins.slice(...COLOURS[seat]).filter((c) => !c).length

const scoreOf = (state, seat) => coinsIn(state.coins, seat) + (state.covered === seat ? 1 : 0)

/** Put one of this seat's pocketed coins back, if it has any. */
function returnCoin(coins, seat) {
  const [from, to] = COLOURS[seat]
  for (let i = from; i < to; i += 1) {
    if (!coins[i]) {
      coins[i] = centreSpot(coins)
      return true
    }
  }
  return false
}

export const carrom = {
  seats: 2,

  // coins[0..8] are white (seat 0), coins[9..17] black (seat 1), coins[18] the queen; null once pocketed.
  // `pending` means the queen is down and the shooter must cover her on this shot.
  start() {
    return { coins: layout(), turn: 0, covered: null, pending: false, shots: 0, last: null }
  },

  turn(state) {
    return state.turn
  },

  /** Nothing in carrom is hidden, so both players get the same picture. */
  view(state) {
    return {
      size: SIZE,
      coin: COIN,
      striker: STRIKER,
      pocket: POCKET,
      base: BASE,
      lineFrom: LINE_FROM,
      lineTo: LINE_TO,
      maxShots: MAX_SHOTS,
      coins: state.coins,
      turn: state.turn,
      covered: state.covered,
      pending: state.pending,
      shots: state.shots,
      score: [scoreOf(state, 0), scoreOf(state, 1)],
      last: state.last,
    }
  },

  /**
   * x runs 0 to 1 along the shooter's line, left to right as they see it. Angle is in radians
   * from straight ahead, positive to their right. Power runs 0 to 1. Out of range values are clamped.
   */
  move(state, seat, input) {
    if (seat !== state.turn) throw ApiError.badRequest('It is not your turn')
    const { x, angle, power } = readShot(input)
    const [sx, sy] = strikerSpot(state.coins, seat, x)
    const speed = MIN_SPEED + power * (MAX_SPEED - MIN_SPEED)
    // Seat 1 sits on the far side, so their forward and right are the board's reverse.
    const forward = seat === 0 ? 1 : -1
    const run = simulate(state.coins, { x: sx, y: sy, vx: forward * Math.sin(angle) * speed, vy: -forward * Math.cos(angle) * speed })

    const { coins } = run
    const rival = 1 - seat
    const foul = run.pocketed.includes(STRIKER_ID)
    const mine = run.pocketed.filter((i) => ownerOf(i) === seat).length
    const queenDown = run.pocketed.includes(QUEEN)
    let { covered, pending } = state
    let keepTurn = !foul && mine > 0
    const notes = []

    if (foul) {
      if (pending || queenDown) coins[QUEEN] = centreSpot(coins)
      pending = false
      notes.push(returnCoin(coins, seat) ? 'Foul: striker pocketed, one coin returned' : 'Foul: striker pocketed')
    } else if ((pending || queenDown) && mine > 0) {
      covered = seat
      pending = false
      notes.push('Queen covered')
    } else if (pending) {
      coins[QUEEN] = centreSpot(coins)
      pending = false
      notes.push('Queen not covered, she goes back to the centre')
    } else if (queenDown) {
      pending = true
      keepTurn = true
      notes.push('Queen pocketed, cover her on the next shot')
    }

    let winner = null
    for (const who of [seat, rival]) {
      if (winner !== null || coinsIn(coins, who) < COINS_EACH) continue
      if (covered !== null) {
        winner = who
      } else {
        // The queen is still in play, so the last coin does not count yet.
        returnCoin(coins, who)
        notes.push('Last coin returned, the queen is not covered yet')
        if (who === seat) keepTurn = false
      }
    }

    const shots = state.shots + 1
    const next = {
      coins,
      turn: keepTurn ? seat : rival,
      covered,
      pending,
      shots,
      last: { seat, shot: shots, steps: run.steps, start: run.start, frames: run.frames, note: notes.join('. ') },
    }
    if (winner !== null) return { state: next, result: { winners: [winner], reason: 'All coins pocketed' } }
    if (shots >= MAX_SHOTS) {
      const [a, b] = [scoreOf(next, 0), scoreOf(next, 1)]
      if (a === b) return { state: next, result: { winners: [], reason: `Level after ${MAX_SHOTS} shots` } }
      return { state: next, result: { winners: [a > b ? 0 : 1], reason: `Most coins after ${MAX_SHOTS} shots` } }
    }
    return { state: next }
  },
}
