import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, useToast } from '../../components/ui'
import { PingBall } from '../../components/games/PingBall'
import { gameService } from '../../services'
import '../../components/games/games.css'
import './passenger.css'

function runText({ score, points }) {
  if (points > 0) return `+${points} ${points === 1 ? 'point' : 'points'}`
  return score < 10 ? 'Return 10 balls to earn a point' : "No points: today's 5 paying runs are used"
}

export default function PingBallGame() {
  const navigate = useNavigate()
  const toast = useToast()
  const [best, setBest] = useState(null)
  const [last, setLast] = useState(null)

  useEffect(() => {
    gameService
      .pingballBest()
      .then((reply) => setBest(reply.best))
      .catch(() => {})
  }, [])

  const finish = useCallback(
    async (score) => {
      setLast(null)
      try {
        const run = await gameService.pingballScore(score)
        setLast(run)
        setBest(run.best)
      } catch (err) {
        toast.error(err)
      }
    },
    [toast],
  )

  return (
    <div className="px-page game-room">
      <PageHeader title="Ping Ball" onBack={() => navigate('/game')} />
      <PingBall onFinish={finish} />
      {last && (
        <p className="game-status" role="status">
          {runText(last)}
        </p>
      )}
      <p className="game-note">
        {best != null && `Your best: ${best} · `}Every 10 balls returned earns 1 point, up to 5 a run, on 5 runs a day.
      </p>
    </div>
  )
}
