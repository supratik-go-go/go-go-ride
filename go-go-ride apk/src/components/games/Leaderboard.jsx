import { Trophy } from 'lucide-react'
import { Avatar, EmptyState, ErrorState, Skeleton } from '../ui'
import { gameService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import './games.css'

/** Most points across all online games. */
export function Leaderboard() {
  const board = useAsync(() => gameService.leaderboard(), [])
  const rows = board.data?.rows ?? []
  const me = board.data?.me

  if (board.loading) return <Skeleton height={240} radius={14} />
  if (board.error) return <ErrorState error={board.error} onRetry={board.reload} />
  if (!rows.length) return <EmptyState icon={<Trophy size={26} />} title="No scores yet" message="Win an online game to be the first on the board." />

  return (
    <div className="game-list">
      {me && (
        <div className="card game-rank-me">
          <span>Your rank: #{me.rank}</span>
          <span>{me.points} points</span>
        </div>
      )}
      <div className="card">
        {rows.map((r) => (
          <div className={`game-rank-row ${r.isMe ? 'me' : ''}`} key={r.rank}>
            <span className="game-rank-no">{r.rank}</span>
            <Avatar src={r.avatarUrl} name={r.name} size={34} />
            <span className="game-rank-name">
              {r.name}
              <small>
                {r.wins} {r.wins === 1 ? 'win' : 'wins'} · {r.played} {r.played === 1 ? 'game' : 'games'}
              </small>
            </span>
            <span className="game-rank-points">{r.points}</span>
          </div>
        ))}
      </div>
      <p className="px-news-note">Win 10 points · Draw 3 · Loss 1. Leaving a game earns nothing.</p>
    </div>
  )
}
