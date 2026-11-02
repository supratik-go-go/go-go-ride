import { useState } from 'react'
import './games.css'

// The ending character stops Android from drawing the pawn as a coloured emoji.
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' }
const FILES = 'abcdefgh'

/** { e4: { type: 'p', white: true }, ... } from the board part of a FEN. */
function readBoard(fen) {
  const board = {}
  fen
    .split(' ')[0]
    .split('/')
    .forEach((rank, r) => {
      let file = 0
      for (const ch of rank) {
        if (/\d/.test(ch)) {
          file += Number(ch)
        } else {
          board[`${FILES[file]}${8 - r}`] = { type: ch.toLowerCase(), white: ch === ch.toUpperCase() }
          file += 1
        }
      }
    })
  return board
}

/** Tap a piece, then tap where it should go. Black sees the board from their side. */
export function ChessBoard({ view, flipped, disabled, onMove }) {
  const [picked, setPicked] = useState(null)
  const board = readBoard(view.fen)
  const targets = picked ? view.moves.filter((m) => m.from === picked) : []

  const squares = []
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      squares.push(flipped ? `${FILES[7 - f]}${r + 1}` : `${FILES[f]}${8 - r}`)
    }
  }

  const tap = (square) => {
    if (disabled) return
    const move = targets.find((m) => m.to === square)
    if (move) {
      setPicked(null)
      // A pawn reaching the far side becomes a queen.
      onMove({ from: move.from, to: move.to, promotion: move.promotion ? 'q' : undefined })
    } else {
      setPicked(view.moves.some((m) => m.from === square) ? square : null)
    }
  }

  return (
    <div className="game-chess" role="grid" aria-label="Chess board">
      {squares.map((square) => {
        const piece = board[square]
        const file = FILES.indexOf(square[0])
        const dark = (file + Number(square[1])) % 2 === 1
        const classes = [
          'game-square',
          dark ? 'dark' : 'light',
          square === picked && 'picked',
          (view.last?.from === square || view.last?.to === square) && 'last',
          targets.some((m) => m.to === square) && 'target',
          view.check && piece?.type === 'k' && piece.white === (view.fen.split(' ')[1] === 'w') && 'check',
        ]
        return (
          <button
            key={square}
            type="button"
            className={classes.filter(Boolean).join(' ')}
            onClick={() => tap(square)}
            aria-label={piece ? `${square}, ${piece.white ? 'white' : 'black'} ${piece.type}` : square}
          >
            {piece && <span className={piece.white ? 'white' : 'black'}>{GLYPHS[piece.type]}</span>}
          </button>
        )
      })}
    </div>
  )
}
