import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, ConfirmDialog, ErrorState, LoadingSpinner, PageHeader, Spinner, useToast } from '../../components/ui'
import { CallbreakBoard } from '../../components/games/CallbreakBoard'
import { CarromBoard } from '../../components/games/CarromBoard'
import { ChessBoard } from '../../components/games/ChessBoard'
import { LudoBoard } from '../../components/games/LudoBoard'
import { TwentynineBoard } from '../../components/games/TwentynineBoard'
import { gameService } from '../../services'
import '../../components/games/games.css'
import './passenger.css'

const POLL_MS = 2500

const GAMES = {
  chess: { title: 'Chess', Board: ChessBoard },
  ludo: { title: 'Ludo', Board: LudoBoard },
  callbreak: { title: 'Call Break', Board: CallbreakBoard },
  twentynine: { title: '29', Board: TwentynineBoard, teams: true },
  carrom: { title: 'Carrom', Board: CarromBoard },
}

function PlayerTag({ player, active }) {
  if (!player) return <div className="game-player">Waiting…</div>
  return (
    <div className={`game-player ${active ? 'turn' : ''}`}>
      <Avatar src={player.avatarUrl} name={player.name} size={28} />
      <span>{player.name}</span>
    </div>
  )
}

/** Everyone at a four-seat table, in play order starting from you. */
function SeatStrip({ room, teams }) {
  const finished = room.status === 'FINISHED'
  // A finished table can have an empty seat: a super admin's delete removes that player's row.
  const inOrder = Array.from({ length: room.seats }, (_, i) => room.players.find((p) => p.seat === (room.seat + i) % room.seats))
  return (
    <div className="game-seats">
      {inOrder.map(
        (player, i) =>
          player && (
            <div className={`game-seat ${room.turn === player.seat ? 'turn' : ''}`} key={player.seat}>
              <Avatar src={player.avatarUrl} name={player.name} size={28} />
              <span>{i === 0 ? 'You' : player.name}</span>
              {finished ? <small>+{player.pointsEarned}</small> : teams && i === 2 && <small>Partner</small>}
            </div>
          ),
      )}
    </div>
  )
}

function outcomeText(room, teams) {
  const { result, seat, players } = room
  const earned = players.find((p) => p.seat === seat)?.pointsEarned ?? 0
  const won = result.winners.includes(seat)
  const lost = teams ? 'Your team lost' : 'You lost'
  let heading = lost
  if (seat !== result.forfeited) {
    if (result.winners.length === 0) heading = result.forfeited == null ? "It's a draw" : 'Game ended early'
    else if (won && teams) heading = 'Your team won!'
    else if (won) heading = result.winners.length > 1 ? 'You shared the win!' : 'You won!'
  }
  const names = result.winners.map((s) => players.find((p) => p.seat === s)?.name)
  // With one rival "You lost" says who won. At a bigger table it does not.
  const winners = room.seats > 2 && !won && names.length ? `${names.join(' and ')} won` : null
  return { heading, winners, reason: result.reason, earned }
}

export default function OnlineRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [room, setRoom] = useState(null)
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [seconds, setSeconds] = useState(null)
  const version = useRef(null)
  const deadline = useRef(null)

  const apply = useCallback((next) => {
    // On a slow network a poll sent before a move can answer after it.
    if (next.version < version.current) return
    version.current = next.version
    deadline.current = next.secondsLeft == null ? null : Date.now() + next.secondsLeft * 1000
    setRoom(next)
  }, [])

  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return
      try {
        const next = await gameService.room(id, version.current)
        if (!next.unchanged) apply(next)
        setError(null)
      } catch (err) {
        if (version.current == null) setError(err)
      }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [id, apply])

  useEffect(() => {
    const tick = () => setSeconds(deadline.current == null ? null : Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [room])

  const move = async (input) => {
    setSending(true)
    try {
      apply(await gameService.move(id, input))
    } catch (err) {
      toast.error(err)
    } finally {
      setSending(false)
    }
  }

  const leave = async () => {
    try {
      await gameService.leave(id)
      navigate('/game', { replace: true })
    } catch (err) {
      toast.error(err)
    }
  }

  if (error) return <ErrorState error={error} />
  if (!room) return <LoadingSpinner />

  const meta = GAMES[room.game]
  if (!meta) {
    return (
      <div className="px-page game-room">
        <PageHeader title="Game" onBack={() => navigate('/game')} />
        <div className="card game-result">
          <h2>Update the app</h2>
          <p>This game needs a newer version of GO-GO Ride.</p>
          <Button to="/game">Back to games</Button>
        </div>
      </div>
    )
  }

  const { Board, teams } = meta
  const table = room.seats > 2
  const live = room.status === 'PLAYING'
  const me = room.players.find((p) => p.seat === room.seat)
  const rival = room.players.find((p) => p.seat !== room.seat)
  const current = room.players.find((p) => p.seat === room.turn)
  const myTurn = live && room.turn === room.seat
  const done = room.status === 'FINISHED' && outcomeText(room, teams)
  const clock = seconds != null && <span className={`game-clock ${seconds <= 10 ? 'low' : ''}`}>{seconds}s</span>
  const leaveCost = teams ? 'Your team will lose and you will earn no points.' : table ? 'The game will end for everyone and you will earn no points.' : 'You will lose the game and earn no points.'

  return (
    <div className="px-page game-room">
      <PageHeader title={meta.title} onBack={() => navigate('/game')} />

      {room.status === 'CANCELLED' && (
        <div className="card game-result">
          <h2>Game closed</h2>
          <p>{table ? 'Not enough players joined in time.' : 'Nobody joined in time.'}</p>
          <Button to="/game">Back to games</Button>
        </div>
      )}

      {room.status === 'WAITING' && (
        <div className="card game-result">
          <h2>{room.code ? `Share this code with your ${table ? 'friends' : 'friend'}` : `Looking for ${table ? 'players' : 'a player'}…`}</h2>
          {room.code ? <div className="game-code">{room.code}</div> : <Spinner size={28} className="game-spinner" />}
          {table && (
            <p className="game-joined">
              {room.players.length} of {room.seats} players joined
            </p>
          )}
          <p>{table ? 'The game starts when every seat is filled.' : 'The game starts as soon as someone joins.'}</p>
          <Button variant="outline" onClick={leave}>
            Cancel
          </Button>
        </div>
      )}

      {(live || room.status === 'FINISHED') && (
        <>
          {table ? (
            <SeatStrip room={room} teams={teams} />
          ) : (
            <div className="game-players">
              <PlayerTag player={rival} active={live && !myTurn} />
              {clock}
            </div>
          )}
          <Board view={room.view} seat={room.seat} flipped={room.seat === 1} myTurn={myTurn} disabled={!myTurn || sending} finished={room.status === 'FINISHED'} players={room.players} onMove={move} />
          <div className="game-players">
            {table ? clock : <PlayerTag player={me} active={myTurn} />}
            {live && (
              <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>
                Leave
              </Button>
            )}
          </div>
          {live && <p className="game-status">{myTurn ? 'Your turn' : `Waiting for ${current?.name}…`}</p>}
          {done && (
            <div className="card game-result">
              <h2>{done.heading}</h2>
              {done.winners && <p>{done.winners}</p>}
              <p>
                {done.reason} · +{done.earned} points
              </p>
              <Button to="/game">Back to games</Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={leaving} onClose={() => setLeaving(false)} onConfirm={leave} title="Leave this game?" message={leaveCost} confirmLabel="Leave game" />
    </div>
  )
}
