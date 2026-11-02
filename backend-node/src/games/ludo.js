// Online ludo for two. A token's position is its step count along its own path, so the rules
// need no board maths: -1 base, 0-50 the shared ring, 51-55 the home stretch, 56 home.
import { randomInt } from 'node:crypto'
import { ApiError } from '../errors.js'

const BASE = -1
const RING_END = 50
const HOME = 56
const OFFSET = [0, 26]
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47])

const line = (row, col, dRow, dCol, length) => Array.from({ length }, (_, i) => [row + dRow * i, col + dCol * i])

// The shared ring, clockwise from seat 0's start square. Seat 0 is bottom left, seat 1 top right.
const RING = [
  ...line(13, 6, -1, 0, 5),
  ...line(8, 5, 0, -1, 6),
  [7, 0],
  ...line(6, 0, 0, 1, 6),
  ...line(5, 6, -1, 0, 6),
  [0, 7],
  ...line(0, 8, 1, 0, 6),
  ...line(6, 9, 0, 1, 6),
  [7, 14],
  ...line(8, 14, 0, -1, 6),
  ...line(9, 8, 1, 0, 6),
  [14, 7],
  [14, 6],
]

const ringIndex = (seat, pos) => (OFFSET[seat] + pos) % RING.length

function cellOf(seat, pos) {
  if (pos === BASE || pos === HOME) return null
  if (pos <= RING_END) return RING[ringIndex(seat, pos)]
  const step = pos - RING_END
  return seat === 0 ? [14 - step, 7] : [step, 7]
}

const canMove = (pos, die) => (pos === BASE ? die === 6 : pos !== HOME && pos + die <= HOME)

const legalTokens = (tokens, die) => tokens.flatMap((pos, id) => (canMove(pos, die) ? [id] : []))

const NOTES = {
  start: (who, state, seat) => (state.turn === seat ? 'Roll the die to begin' : 'Waiting for the first roll'),
  rolled: (who, state) => `${who} rolled ${state.die}. Pick a token.`,
  stuck: (who, state) => `${who} rolled ${state.die} with no legal move. Turn passed.`,
  sixes: (who) => `${who} rolled three 6s in a row. Turn passed.`,
  moved: (who, state) => `${who} moved ${state.die}.`,
  six: (who) => `${who} rolled a 6 and roll${who === 'You' ? '' : 's'} again.`,
  capture: (who) => `${who} captured a token and roll${who === 'You' ? '' : 's'} again.`,
  home: (who) => `${who} brought a token home and roll${who === 'You' ? '' : 's'} again.`,
  won: (who) => `${who} brought all four tokens home.`,
}

export const ludo = {
  seats: 2,

  start() {
    return {
      pos: [Array(4).fill(BASE), Array(4).fill(BASE)],
      turn: randomInt(2),
      phase: 'roll',
      die: null,
      sixes: 0,
      last: { seat: null, kind: 'start' },
    }
  },

  turn(state) {
    return state.turn
  },

  /** Nothing in ludo is hidden. The die is rolled on demand, so no future roll exists to leak. */
  view(state, seat) {
    const moving = seat === state.turn && state.phase === 'move'
    return {
      tokens: state.pos.flatMap((tokens, owner) => tokens.map((pos, id) => ({ seat: owner, id, pos, cell: cellOf(owner, pos) }))),
      turn: state.turn,
      phase: state.phase,
      die: state.die,
      legal: moving ? legalTokens(state.pos[seat], state.die) : [],
      note: NOTES[state.last.kind](state.last.seat === seat ? 'You' : 'Opponent', state, seat),
    }
  },

  move(state, seat, input) {
    if (state.phase === 'done') throw ApiError.badRequest('This game has ended')
    if (seat !== state.turn) throw ApiError.badRequest('It is not your turn')
    if (input?.action === 'roll') return roll(state, seat)
    if (input?.action === 'move') return step(state, seat, input.token)
    throw ApiError.badRequest('That move is not allowed')
  },
}

function roll(state, seat) {
  if (state.phase !== 'roll') throw ApiError.badRequest('Pick a token to move')
  const die = randomInt(1, 7)
  const sixes = die === 6 ? state.sixes + 1 : 0
  const pass = (kind) => ({ state: { ...state, turn: 1 - seat, phase: 'roll', die, sixes: 0, last: { seat, kind } } })
  if (sixes === 3) return pass('sixes')
  // A 6 with nothing to move passes too: a roll only earns another if it can be played.
  if (!legalTokens(state.pos[seat], die).length) return pass('stuck')
  return { state: { ...state, phase: 'move', die, sixes, last: { seat, kind: 'rolled' } } }
}

function step(state, seat, token) {
  if (state.phase !== 'move') throw ApiError.badRequest('Roll the die first')
  if (!Number.isInteger(token) || token < 0 || token > 3) throw ApiError.badRequest('That token does not exist')
  const { die } = state
  const from = state.pos[seat][token]
  if (!canMove(from, die)) throw ApiError.badRequest('That token cannot move')

  const to = from === BASE ? 0 : from + die
  const pos = state.pos.map((tokens) => [...tokens])
  pos[seat][token] = to

  // No blocks: landing on a pair of rival tokens captures both.
  const rival = 1 - seat
  let captured = false
  if (to <= RING_END && !SAFE.has(ringIndex(seat, to))) {
    const square = ringIndex(seat, to)
    pos[rival] = pos[rival].map((p) => {
      if (p < 0 || p > RING_END || ringIndex(rival, p) !== square) return p
      captured = true
      return BASE
    })
  }

  if (pos[seat].every((p) => p === HOME)) {
    return {
      state: { ...state, pos, phase: 'done', last: { seat, kind: 'won' } },
      result: { winners: [seat], reason: 'All four tokens home' },
    }
  }
  const kind = captured ? 'capture' : to === HOME ? 'home' : die === 6 ? 'six' : 'moved'
  return { state: { ...state, pos, turn: kind === 'moved' ? rival : seat, phase: 'roll', last: { seat, kind } } }
}
