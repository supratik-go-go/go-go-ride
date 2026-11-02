import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, ConfirmDialog, ErrorState, LoadingSpinner, PageHeader, Spinner, useToast } from '../../components/ui'
import { ChessBoard } from '../../components/games/ChessBoard'
import { gameService } from '../../services'
import '../../components/games/games.css'
import './passenger.css'

const POLL_MS = 2500

function PlayerTag({ player, active }) {
  if (!player) return <div className="game-player">Waiting…</div>
  return (
    <div className={`game-player ${active ? 'turn' : ''}`}>
      <Avatar src={player.avatarUrl} name={player.name} size={28} />
      <span>{player.name}</span>
    </div>
  )
}

function outcomeText(room) {
  const { result, seat, players } = room
  const earned = players.find((p) => p.seat === seat)?.pointsEarned ?? 0
  const heading = result.winners.length === 0 ? "It's a draw" : result.winners.includes(seat) ? 'You won!' : 'You lost'
  return { heading, reason: result.reason, earned }
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
    await gameService.leave(id)
    navigate('/game', { replace: true })
  }

  if (error) return <ErrorState error={error} />
  if (!room) return <LoadingSpinner />

  const me = room.players.find((p) => p.seat === room.seat)
  const rival = room.players.find((p) => p.seat !== room.seat)
  const myTurn = room.status === 'PLAYING' && room.turn === room.seat
  const done = room.status === 'FINISHED' && outcomeText(room)

  return (
    <div className="px-page game-room">
      <PageHeader title="Chess" onBack={() => navigate('/game')} />

      {room.status === 'CANCELLED' && (
        <div className="card game-result">
          <h2>Game closed</h2>
          <p>Nobody joined in time.</p>
          <Button to="/game">Back to games</Button>
        </div>
      )}

      {room.status === 'WAITING' && (
        <div className="card game-result">
          <h2>{room.code ? 'Share this code with your friend' : 'Looking for a player…'}</h2>
          {room.code ? <div className="game-code">{room.code}</div> : <Spinner size={28} className="game-spinner" />}
          <p>The game starts as soon as someone joins.</p>
          <Button variant="outline" onClick={leave}>
            Cancel
          </Button>
        </div>
      )}

      {(room.status === 'PLAYING' || room.status === 'FINISHED') && (
        <>
          <div className="game-players">
            <PlayerTag player={rival} active={room.status === 'PLAYING' && !myTurn} />
            {seconds != null && <span className={`game-clock ${seconds <= 10 ? 'low' : ''}`}>{seconds}s</span>}
          </div>
          <ChessBoard view={room.view} flipped={room.seat === 1} disabled={!myTurn || sending} onMove={move} />
          <div className="game-players">
            <PlayerTag player={me} active={myTurn} />
            {room.status === 'PLAYING' && (
              <Button variant="ghost" size="sm" onClick={() => setLeaving(true)}>
                Leave
              </Button>
            )}
          </div>
          {room.status === 'PLAYING' && <p className="game-status">{myTurn ? 'Your turn' : `Waiting for ${rival?.name}…`}</p>}
          {done && (
            <div className="card game-result">
              <h2>{done.heading}</h2>
              <p>
                {done.reason} · +{done.earned} points
              </p>
              <Button to="/game">Back to games</Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={leave}
        title="Leave this game?"
        message="You will lose the game and earn no points."
        confirmLabel="Leave game"
      />
    </div>
  )
}
