import { Bell } from 'lucide-react'
import { Skeleton } from '../ui/LoadingSpinner'
import { EmptyState, ErrorState } from '../ui/States'
import { formatDateTime, timeAgo } from '../../utils/format'
import { activityMeta } from './adminUtils'
import './admin-ui.css'

/**
 * Audit-log list ("Recent Activities").
 *
 *   <ActivityList items={data.recentActivities} loading={q.loading} error={q.error} onRetry={q.reload} />
 */
export function ActivityList({ items, loading, error, onRetry, skeletonCount = 4 }) {
  if (loading && !items?.length) {
    return (
      <ul className="adm-activity" aria-busy="true">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <li key={i}>
            <Skeleton width={38} height={38} radius={19} />
            <div className="grow stack" style={{ '--gap': '6px' }}>
              <Skeleton height={12} width="80%" />
              <Skeleton height={10} width="45%" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (error && !items?.length) return <ErrorState error={error} onRetry={onRetry} compact />
  if (!items?.length) return <EmptyState icon={<Bell size={24} />} title="No activity yet" message="Approvals, route changes and settings updates show up here." compact />

  return (
    <ul className="adm-activity">
      {items.map((a) => {
        const { Icon, tone } = activityMeta(a.action)
        return (
          <li key={a.id}>
            <span className={`adm-activity-icon tone-bg-${tone}`} aria-hidden="true">
              <Icon size={18} />
            </span>
            <div className="grow">
              <div className="adm-activity-msg">{a.message}</div>
              {a.actor?.name && <div className="adm-activity-meta">by {a.actor.name}</div>}
            </div>
            <time className="adm-activity-time" dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
              {timeAgo(a.createdAt)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}

export default ActivityList
