import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Search, Users } from 'lucide-react'
import { Badge, Button, useToast } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { gameService } from '../../services'
import './games.css'

const COMING_SOON = ['Ludo', 'Call Break', '29', 'Carrom', 'Ping Ball']

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
      <section className="card game-card">
        <div className="game-card-head">
          <span className="icon-tile">
            <Crown size={20} />
          </span>
          <div>
            <h2>Chess</h2>
            <p>2 players · 60 seconds a move</p>
          </div>
        </div>
        <div className="game-card-actions">
          <Button icon={<Search size={17} />} onClick={() => enter('quick', () => gameService.quickMatch('chess'))} loading={busy === 'quick'}>
            Find player
          </Button>
          <Button variant="outline" icon={<Users size={17} />} onClick={() => enter('friend', () => gameService.privateRoom('chess'))} loading={busy === 'friend'}>
            Play a friend
          </Button>
        </div>
      </section>

      <form className="card game-card" onSubmit={join} aria-label="Join with a code">
        <div className="game-join">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Friend's code" maxLength={6} autoComplete="off" aria-label="Friend's code" />
          <Button type="submit" variant="soft" loading={busy === 'join'}>
            Join
          </Button>
        </div>
      </form>

      {COMING_SOON.map((name) => (
        <div className="card game-soon" key={name}>
          {name}
          <Badge tone="neutral" square>
            Coming Soon
          </Badge>
        </div>
      ))}
    </div>
  )
}
