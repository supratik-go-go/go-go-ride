// Call Break for four players. Spades are always trump. Hands stay on the server; a phone sees only its own.
import { randomInt } from 'node:crypto'
import { ApiError } from '../errors.js'

const SEATS = 4
const ROUNDS = 5
const TRICKS = 13
const MAX_BID = 8
const RANKS = '23456789TJQKA'
const SUITS = 'SHCD'

const rank = (card) => RANKS.indexOf(card[0])
const suit = (card) => card[1]
const beats = (card, best) => (suit(card) === suit(best) ? rank(card) > rank(best) : suit(card) === 'S')
const byHand = (a, b) => SUITS.indexOf(suit(a)) - SUITS.indexOf(suit(b)) || rank(b) - rank(a)
const top = (cards) => cards.reduce((best, card) => (beats(card, best) ? card : best))
const plays = (cards, leader) => cards.map((card, i) => ({ seat: (leader + i) % SEATS, card }))
const zeros = () => Array(SEATS).fill(0)

function deal() {
  const deck = [...SUITS].flatMap((s) => [...RANKS].map((r) => r + s))
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    const card = deck[i]
    deck[i] = deck[j]
    deck[j] = card
  }
  return Array.from({ length: SEATS }, (_, seat) => deck.slice(seat * TRICKS, (seat + 1) * TRICKS).sort(byHand))
}

const newRound = (round, first) => ({
  round,
  first,
  phase: 'bid',
  hands: deal(),
  bids: Array(SEATS).fill(null),
  won: zeros(),
  leader: first,
  trick: [],
})

/** Follow suit, else trump, else anything; within that choice, beat the trick if the hand can. */
function legalCards(hand, trick) {
  if (!trick.length) return hand
  const follow = hand.filter((c) => suit(c) === suit(trick[0]))
  const trumps = hand.filter((c) => suit(c) === 'S')
  const pool = follow.length ? follow : trumps.length ? trumps : hand
  const best = top(trick)
  const beating = pool.filter((c) => beats(c, best))
  return beating.length ? beating : pool
}

function turnOf(state) {
  if (state.phase === 'bid') return (state.first + state.bids.filter((b) => b !== null).length) % SEATS
  return (state.leader + state.trick.length) % SEATS
}

function bid(state, seat, value) {
  if (state.phase !== 'bid') throw ApiError.badRequest('Bidding is over for this round')
  if (!Number.isInteger(value) || value < 1 || value > MAX_BID) throw ApiError.badRequest(`Bid a number from 1 to ${MAX_BID}`)
  const bids = state.bids.map((b, s) => (s === seat ? value : b))
  return { state: { ...state, bids, phase: bids.includes(null) ? 'bid' : 'play' } }
}

// Scores are whole tenths so 0.1 per extra trick cannot drift.
function endRound(state) {
  const points = state.bids.map((b, s) => (state.won[s] >= b ? b * 10 + state.won[s] - b : -b * 10))
  const totals = state.totals.map((t, s) => t + points[s])
  const lastRound = { round: state.round, bids: state.bids, won: state.won, points }
  if (state.round < ROUNDS) {
    return { state: { ...newRound(state.round + 1, (state.first + 1) % SEATS), totals, last: state.last, lastRound } }
  }
  const high = Math.max(...totals)
  const winners = zeros().map((_, s) => s).filter((s) => totals[s] === high)
  const reason = winners.length > 1 ? 'Tied for the highest score' : `Highest score after ${ROUNDS} rounds`
  return { state: { ...state, phase: 'over', totals, lastRound }, result: { winners, reason } }
}

function play(state, seat, card) {
  if (state.phase !== 'play') throw ApiError.badRequest('Everyone must bid first')
  if (!legalCards(state.hands[seat], state.trick).includes(card)) throw ApiError.badRequest('You cannot play that card')
  const hands = state.hands.map((hand, s) => (s === seat ? hand.filter((c) => c !== card) : hand))
  const trick = [...state.trick, card]
  if (trick.length < SEATS) return { state: { ...state, hands, trick } }
  const winner = (state.leader + trick.indexOf(top(trick))) % SEATS
  const won = state.won.map((w, s) => (s === winner ? w + 1 : w))
  const next = { ...state, hands, won, trick: [], leader: winner, last: { cards: trick, leader: state.leader, winner } }
  return hands[seat].length ? { state: next } : endRound(next)
}

export const callbreak = {
  seats: SEATS,

  start() {
    return { ...newRound(1, 0), totals: zeros(), last: null, lastRound: null }
  },

  turn: turnOf,

  /** What one player sees. Legal cards are sent only to the player whose card it is. */
  view(state, seat) {
    const { last, lastRound } = state
    const turn = turnOf(state)
    return {
      phase: state.phase,
      round: state.round,
      rounds: ROUNDS,
      turn,
      hand: state.hands[seat],
      legal: state.phase === 'play' && seat === turn ? legalCards(state.hands[seat], state.trick) : [],
      bids: state.bids,
      won: state.won,
      totals: state.totals.map((t) => t / 10),
      trick: plays(state.trick, state.leader),
      last: last && { plays: plays(last.cards, last.leader), winner: last.winner },
      lastRound: lastRound && { ...lastRound, points: lastRound.points.map((p) => p / 10) },
    }
  },

  /** Returns the new state, plus `result` when the last trick of the last round is taken. */
  move(state, seat, input) {
    if (state.phase === 'over') throw ApiError.badRequest('This game has ended')
    if (seat !== turnOf(state)) throw ApiError.badRequest('It is not your turn')
    if (input?.action === 'bid') return bid(state, seat, input.value)
    if (input?.action === 'play') return play(state, seat, input.card)
    throw ApiError.badRequest('That move is not allowed')
  },
}
