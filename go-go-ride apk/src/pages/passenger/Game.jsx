import { useEffect, useState } from 'react'
import { Bike, BusFront, CarFront, CarTaxiFront, MapPin, RotateCcw, Ship, TrainFront, TramFront } from 'lucide-react'
import { Button, PageHeader } from '../../components/ui'
import { Leaderboard } from '../../components/games/Leaderboard'
import { OnlineLobby } from '../../components/games/OnlineLobby'
import './passenger.css'

const TABS = [
  { value: 'online', label: 'Online' },
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'offline', label: 'Offline' },
]

const OFFLINE_GAMES = [
  { value: 'memory', label: 'Memory Match' },
  { value: 'ttt', label: 'Tic-Tac-Toe' },
]

export default function Game() {
  const [tab, setTab] = useState('online')
  const [game, setGame] = useState('memory')

  return (
    <div className="px-page">
      <PageHeader title="Game" subtitle="Play people on GO-GO Ride and earn points" back={false} />
      <div className="segmented px-game-tabs" role="tablist" aria-label="Game sections">
        {TABS.map(({ value, label }) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'online' && <OnlineLobby />}
      {tab === 'leaderboard' && <Leaderboard />}
      {tab === 'offline' && (
        <>
          <div className="segmented px-game-tabs" role="tablist" aria-label="Choose a game">
            {OFFLINE_GAMES.map(({ value, label }) => (
              <button key={value} type="button" role="tab" aria-selected={game === value} className={game === value ? 'active' : ''} onClick={() => setGame(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="card px-card-pad px-game">{game === 'memory' ? <MemoryMatch /> : <TicTacToe />}</div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- memory match

const PICTURES = [BusFront, CarFront, CarTaxiFront, Bike, TrainFront, TramFront, Ship, MapPin]

function newDeck() {
  const deck = [...PICTURES.keys(), ...PICTURES.keys()].map((picture, id) => ({ id, picture }))
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function MemoryMatch() {
  const [deck, setDeck] = useState(newDeck)
  const [open, setOpen] = useState([])
  const [matched, setMatched] = useState([])
  const [moves, setMoves] = useState(0)

  useEffect(() => {
    if (open.length !== 2) return undefined
    const timer = setTimeout(() => setOpen([]), 700)
    return () => clearTimeout(timer)
  }, [open])

  const flip = (card) => {
    if (open.length === 2 || open.includes(card.id) || matched.includes(card.picture)) return
    const next = [...open, card.id]
    setOpen(next)
    if (next.length === 2) {
      setMoves((m) => m + 1)
      const first = deck.find((c) => c.id === next[0])
      if (first.picture === card.picture) {
        setMatched((m) => [...m, card.picture])
        setOpen([])
      }
    }
  }

  const restart = () => {
    setDeck(newDeck())
    setOpen([])
    setMatched([])
    setMoves(0)
  }

  const won = matched.length === PICTURES.length

  return (
    <>
      <p className="px-game-status" role="status">
        {won ? `You found every pair in ${moves} moves!` : `Moves: ${moves} · Pairs: ${matched.length} of ${PICTURES.length}`}
      </p>
      <div className="px-memory-grid">
        {deck.map((card) => {
          const Picture = PICTURES[card.picture]
          const shown = open.includes(card.id) || matched.includes(card.picture)
          return (
            <button key={card.id} type="button" className={`px-memory-card ${shown ? 'shown' : ''}`} onClick={() => flip(card)} aria-label={shown ? 'Open card' : 'Hidden card'}>
              {shown && <Picture size={26} />}
            </button>
          )
        })}
      </div>
      <Button variant="soft" block icon={<RotateCcw size={17} />} onClick={restart}>
        New game
      </Button>
    </>
  )
}

// ---------------------------------------------------------------- tic-tac-toe

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const EMPTY_BOARD = Array(9).fill(null)

const winnerOf = (board) => LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null

/** Win if possible, otherwise block the player, otherwise take the best free square. */
function computerMove(board) {
  for (const mark of ['O', 'X']) {
    for (const line of LINES) {
      const free = line.filter((i) => !board[i])
      if (free.length === 1 && line.filter((i) => board[i] === mark).length === 2) return free[0]
    }
  }
  const preferred = [4, 0, 2, 6, 8, 1, 3, 5, 7]
  return preferred.find((i) => !board[i])
}

function TicTacToe() {
  const [board, setBoard] = useState(EMPTY_BOARD)
  const line = winnerOf(board)
  const full = board.every(Boolean)
  const over = Boolean(line) || full

  const play = (i) => {
    if (board[i] || over) return
    const next = [...board]
    next[i] = 'X'
    if (!winnerOf(next) && !next.every(Boolean)) next[computerMove(next)] = 'O'
    setBoard(next)
  }

  const status = line ? (board[line[0]] === 'X' ? 'You win!' : 'The computer wins.') : full ? "It's a draw." : 'You are X. Tap a square.'

  return (
    <>
      <p className="px-game-status" role="status">
        {status}
      </p>
      <div className="px-ttt-grid">
        {board.map((mark, i) => (
          <button
            key={i}
            type="button"
            className={`px-ttt-cell ${mark === 'O' ? 'o' : ''} ${line?.includes(i) ? 'win' : ''}`}
            onClick={() => play(i)}
            aria-label={`Square ${i + 1}${mark ? `, ${mark}` : ''}`}
          >
            {mark}
          </button>
        ))}
      </div>
      <Button variant="soft" block icon={<RotateCcw size={17} />} onClick={() => setBoard(EMPTY_BOARD)}>
        New game
      </Button>
    </>
  )
}
