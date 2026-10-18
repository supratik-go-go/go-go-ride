import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from './Button'
import { LoadingSpinner, SkeletonList } from './LoadingSpinner'

/** Friendly empty state with optional action. */
export function EmptyState({ icon, title = 'Nothing here yet', message, action, compact }) {
  return (
    <div className="state-box" style={compact ? { padding: '24px 12px' } : undefined}>
      <div className="icon-tile lg round">{icon || <Inbox size={26} />}</div>
      <h4>{title}</h4>
      {message && <p className="text-sm text-muted">{message}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}

/** Error state that shows the API's user-facing message and a retry button. */
export function ErrorState({ error, onRetry, title, compact }) {
  const offline = error?.code === 'NETWORK'
  return (
    <div className="state-box" style={compact ? { padding: '24px 12px' } : undefined} role="alert">
      <div className="icon-tile lg round danger">{offline ? <WifiOff size={26} /> : <AlertTriangle size={26} />}</div>
      <h4>{title || (offline ? 'You are offline' : error?.status === 404 ? 'Not found' : 'Something went wrong')}</h4>
      <p className="text-sm text-muted">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  )
}

/**
 * Handles the three non-happy states for a useAsync() result in one place.
 *
 *   <DataState state={q} empty={!q.data?.length} emptyProps={{ title: 'No buses' }} skeleton>
 *     {(data) => <List data={data} />}
 *   </DataState>
 */
export function DataState({ state, empty, emptyProps, skeleton, skeletonCount = 3, skeletonHeight, loadingLabel, children }) {
  const { loading, error, data, reload } = state
  if (loading && data == null) {
    return skeleton ? <SkeletonList count={skeletonCount} height={skeletonHeight} /> : <LoadingSpinner label={loadingLabel} />
  }
  if (error && data == null) return <ErrorState error={error} onRetry={reload} />
  if (empty) return <EmptyState {...emptyProps} />
  return typeof children === 'function' ? children(data) : children
}
