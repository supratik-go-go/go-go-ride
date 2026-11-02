// 29, the Bengali trick-taking card game. Seats 0 and 2 play seats 1 and 3, over as many
// rounds as it takes. Team numbers are seat % 2, so `scores` and `taken` have two entries.
import { randomInt } from 'node:crypto'
import { ApiError } from '../errors.js'

const SEATS = [0, 1, 2, 3]
const SUITS = ['S', 'H', 'D', 'C']
const RANKS = ['J', '9', 'A', 'T', 'K', 'Q', '8', '7']
const WORTH = { J: 3, 9: 2, A: 1, T: 1 }
const MIN_BID = 16
const MAX_BID = 28
const TARGET = 6

const suitOf = (card) => card[1]
const rankOf = (card) => RANKS.indexOf(card[0])
const worth = (card) => WORTH[card[0]] ?? 0
const teamOf = (seat) => seat % 2
const bySuitThenRank = (a, b) => SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(a) - rankOf(b)
const seatAt = (state, index) => (state.leader + index) % 4

function shuffledDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => rank + suit))
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function newRound({ scores, dealer, round, last, summary }) {
  const deck = shuffledDeck()
  const first = (dealer + 1) % 4
  return {
    phase: 'bid',
    scores,
    dealer,
    round,
    hands: SEATS.map((seat) => deck.slice(seat * 4, seat * 4 + 4)),
    stock: deck.slice(16),
    said: [null, null, null, null],
    bid: 0,
    bidder: null,
    trump: null,
    revealed: false,
    asked: false,
    turn: first,
    leader: first,
    trick: [],
    tricks: 0,
    taken: [0, 0],
    last,
    summary,
  }
}

const ledSuit = (state) => (state.trick.length ? suitOf(state.trick[0]) : null)

const isVoid = (state, seat) => !state.hands[seat].some((card) => suitOf(card) === ledSuit(state))

const canReveal = (state, seat) => state.phase === 'play' && !state.revealed && state.trick.length > 0 && isVoid(state, seat)

function legalCards(state, seat) {
  const hand = state.hands[seat]
  const led = ledSuit(state)
  const following = led ? hand.filter((card) => suitOf(card) === led) : []
  if (following.length) return following
  if (state.asked) {
    const trumps = hand.filter((card) => suitOf(card) === state.trump)
    if (trumps.length) return trumps
  }
  return hand
}

// Trump only counts once it is public, so an unrevealed trump never tells the table anything.
function trickWinner(state) {
  const trumps = state.revealed ? state.trick.filter((card) => suitOf(card) === state.trump) : []
  const pool = trumps.length ? trumps : state.trick.filter((card) => suitOf(card) === ledSuit(state))
  const best = pool.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a))
  return seatAt(state, state.trick.indexOf(best))
}

function bid(state, seat, value) {
  if (state.phase !== 'bid') throw ApiError.badRequest('Bidding is over')
  const lowest = state.bid ? state.bid + 1 : MIN_BID
  if (lowest > MAX_BID) throw ApiError.badRequest('The bid cannot go higher')
  if (!Number.isInteger(value) || value < lowest || value > MAX_BID) throw ApiError.badRequest(`Bid from ${lowest} to ${MAX_BID}`)
  state.said[seat] = value
  state.bid = value
  state.bidder = seat
  nextBidder(state)
}

function pass(state, seat) {
  if (state.phase !== 'bid') throw ApiError.badRequest('Bidding is over')
  state.said[seat] = 'pass'
  nextBidder(state)
}

function nextBidder(state) {
  const left = SEATS.filter((seat) => state.said[seat] !== 'pass')
  if (left.length > 1) {
    do state.turn = (state.turn + 1) % 4
    while (state.said[state.turn] === 'pass')
    return
  }
  // Three passes with no bid leave the last player holding the lowest bid.
  state.bidder = left[0]
  state.bid = state.bid || MIN_BID
  state.phase = 'trump'
  state.turn = left[0]
}

function chooseTrump(state, suit) {
  if (state.phase !== 'trump') throw ApiError.badRequest('Trump cannot be chosen now')
  if (!SUITS.includes(suit)) throw ApiError.badRequest('Choose a suit')
  state.trump = suit
  state.hands = state.hands.map((hand, seat) => [...hand, ...state.stock.slice(seat * 4, seat * 4 + 4)])
  state.stock = []
  state.phase = 'play'
  state.turn = state.leader
}

function reveal(state, seat) {
  if (state.phase !== 'play') throw ApiError.badRequest('Trump cannot be revealed now')
  if (state.revealed) throw ApiError.badRequest('Trump is already revealed')
  if (!canReveal(state, seat)) throw ApiError.badRequest('You can ask for trump only when you cannot follow suit')
  state.revealed = true
  state.asked = true
}

function play(state, seat, card) {
  if (state.phase !== 'play') throw ApiError.badRequest('Cards cannot be played now')
  if (!state.hands[seat].includes(card)) throw ApiError.badRequest('You do not have that card')
  if (!legalCards(state, seat).includes(card)) {
    throw ApiError.badRequest(state.asked && isVoid(state, seat) ? 'You must play a trump' : 'You must follow suit')
  }
  state.hands[seat] = state.hands[seat].filter((held) => held !== card)
  state.trick.push(card)
  state.asked = false
  if (state.trick.length < 4) {
    state.turn = (seat + 1) % 4
    return null
  }

  const winner = trickWinner(state)
  state.last = { cards: state.trick.map((played, i) => ({ seat: seatAt(state, i), card: played })), winner }
  state.taken[teamOf(winner)] += state.trick.reduce((sum, played) => sum + worth(played), 0)
  state.tricks += 1
  state.trick = []
  state.leader = winner
  state.turn = winner
  if (state.tricks < 8) return null
  state.taken[teamOf(winner)] += 1
  return endRound(state)
}

function endRound(state) {
  const team = teamOf(state.bidder)
  const points = state.taken[team]
  const made = points >= state.bid
  state.scores[team] += made ? 1 : -1
  const summary = { bidder: state.bidder, bid: state.bid, trump: state.trump, points, made }
  const score = state.scores[team]
  if (Math.abs(score) < TARGET) {
    return { state: newRound({ scores: state.scores, dealer: (state.dealer + 1) % 4, round: state.round + 1, last: state.last, summary }) }
  }
  const winner = score > 0 ? team : 1 - team
  return {
    state: { ...state, phase: 'done', summary },
    result: { winners: [winner, winner + 2], reason: score > 0 ? `First to ${TARGET} game points` : `Other team fell to -${TARGET} game points` },
  }
}

export const twentynine = {
  seats: 4,

  start() {
    return newRound({ scores: [0, 0], dealer: randomInt(4), round: 1, last: null, summary: null })
  },

  turn(state) {
    return state.turn
  },

  /** What one player sees. The stock, other hands and an unrevealed trump stay on the server. */
  view(state, seat) {
    const mine = state.turn === seat
    return {
      phase: state.phase,
      round: state.round,
      dealer: state.dealer,
      turn: state.turn,
      scores: state.scores,
      hand: [...state.hands[seat]].sort(bySuitThenRank),
      counts: state.hands.map((hand) => hand.length),
      said: state.said,
      bid: state.bid,
      bidder: state.bidder,
      minBid: state.bid ? state.bid + 1 : MIN_BID,
      maxBid: MAX_BID,
      trump: state.revealed || seat === state.bidder ? state.trump : null,
      revealed: state.revealed,
      trick: state.trick.map((card, i) => ({ seat: seatAt(state, i), card })),
      tricks: state.tricks,
      taken: state.taken,
      last: state.last,
      summary: state.summary,
      legal: mine && state.phase === 'play' ? [...legalCards(state, seat)].sort(bySuitThenRank) : [],
      canReveal: mine && canReveal(state, seat),
    }
  },

  /** Returns the new state, plus `result` when a team has won the whole game. */
  move(current, seat, input) {
    if (current.phase === 'done') throw ApiError.badRequest('This game has ended')
    const state = structuredClone(current)
    let ended = null
    switch (input?.action) {
      case 'bid':
        bid(state, seat, input.value)
        break
      case 'pass':
        pass(state, seat)
        break
      case 'trump':
        chooseTrump(state, input.suit)
        break
      case 'reveal':
        reveal(state, seat)
        break
      case 'play':
        ended = play(state, seat, input.card)
        break
      default:
        throw ApiError.badRequest('That move is not allowed')
    }
    return ended ?? { state }
  },

  forfeitWinners(seat) {
    return [(seat + 1) % 4, (seat + 3) % 4].sort()
  },
}
