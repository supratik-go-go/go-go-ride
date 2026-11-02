// Online chess. The server holds the board and checks every move, so points can be trusted.
import { Chess } from 'chess.js'
import { ApiError } from '../errors.js'

const seatToMove = (fen) => (fen.split(' ')[1] === 'w' ? 0 : 1)

export const chess = {
  seats: 2,

  start() {
    return { fen: new Chess().fen(), last: null }
  },

  turn(state) {
    return seatToMove(state.fen)
  },

  /** What one player sees. Legal moves are sent only to the player whose turn it is. */
  view(state, seat) {
    const game = new Chess(state.fen)
    const mine = seat === seatToMove(state.fen)
    return {
      fen: state.fen,
      last: state.last,
      check: game.inCheck(),
      moves: mine ? game.moves({ verbose: true }).map((m) => ({ from: m.from, to: m.to, promotion: m.promotion ?? null })) : [],
    }
  },

  /** Returns the new state, plus `result` when the move ended the game. */
  move(state, seat, input) {
    const game = new Chess(state.fen)
    let played
    try {
      played = game.move({ from: input?.from, to: input?.to, promotion: input?.promotion })
    } catch {
      throw ApiError.badRequest('That move is not allowed')
    }
    const next = { fen: game.fen(), last: { from: played.from, to: played.to } }
    if (game.isCheckmate()) return { state: next, result: { winners: [seat], reason: 'Checkmate' } }
    if (game.isDraw()) return { state: next, result: { winners: [], reason: 'Draw' } }
    return { state: next }
  },
}
