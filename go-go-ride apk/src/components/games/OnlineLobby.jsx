import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Club, Crown, Dices, Play, Search, Spade, Target, Users, Volleyball } from 'lucide-react'
import { Button, useToast } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { gameService } from '../../services'
import './games.css'

const ONLINE_GAMES = [
  { id: 'chess', name: 'Chess', players: '2 players', Icon: Crown },
  { id: 'ludo', name: 'Ludo', players: '2 players', Icon: Dices },
  { id: 'callbreak', name: 'Call Break', players: '4 players', Icon: Spade },
  { id: 'twentynine', name: '29', players: '4 players in 2 teams', Icon: Club },
  { id: 'carrom', name: 'Carrom', players: '2 players', Icon: Target },
]

/** Pick a game, then find a stranger or play a friend with a code. */
export function OnlineLobby() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const [code, setCode] = useState('')

  const enter = async (kind, action) => {
    if (!isAuthenticated) {
      navigate('/login?next=/game')
      return
    }
    setBusy(kind)
    try {
      const room = await action()
      navigate(`/game/room/${room.id}`)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy('')
    }
  }

  const join = (e) => {
    e.preventDefault()
    if (code.trim()) enter('join', () => gameService.join(code))
  }

  return (
    <div className="game-list">
      <form className="card game-card" onSubmit={join} aria-label="Join with a code">
        <div className="game-join">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Friend's code" maxLength={6} autoComplete="off" aria-label="Friend's code" />
          <Button type="submit" variant="soft" loading={busy === 'join'}>
            Join
          </Button>
        </div>
      </form>

      {ONLINE_GAMES.map(({ id, name, players, Icon }) => (
        <section className="card game-card" key={id}>
          <div className="game-card-head">
            <span className="icon-tile">
              <Icon size={20} />
            </span>
            <div>
              <h2>{name}</h2>
              <p>{players} · 60 seconds a turn</p>
            </div>
          </div>
          <div className="game-card-actions">
            <Button icon={<Search size={17} />} onClick={() => enter(`${id}-quick`, () => gameService.quickMatch(id))} loading={busy === `${id}-quick`} disabled={Boolean(busy)}>
              Find player
            </Button>
            <Button variant="outline" icon={<Users size={17} />} onClick={() => enter(`${id}-friend`, () => gameService.privateRoom(id))} loading={busy === `${id}-friend`} disabled={Boolean(busy)}>
              Play a friend
            </Button>
          </div>
        </section>
      ))}

      <section className="card game-card">
        <div className="game-card-head">
          <span className="icon-tile">
            <Volleyball size={20} />
          </span>
          <div>
            <h2>Ping Ball</h2>
            <p>1 player · Up to 5 points a run</p>
          </div>
        </div>
        <Button icon={<Play size={17} />} to="/game/pingball" block>
          Play
        </Button>
      </section>
    </div>
  )
}
