import { PageHeader } from '../../components/ui'
import './account.css'

/** Phone-style page frame for the signed-in account area: header + centred narrow column. */
export function AccountPage({ title, subtitle, back = true, actions, children, className = '' }) {
  return (
    <div className={`app-narrow acc-page ${className}`}>
      <PageHeader title={title} subtitle={subtitle} back={back} actions={actions} />
      {children}
    </div>
  )
}

/** Simple "Load more" footer for appended lists. */
export function LoadMore({ hasMore, loading, onClick, shown, total, noun = 'items' }) {
  if (!hasMore && !(total > 0)) return null
  return (
    <div className="acc-load-more">
      {total != null && (
        <span className="text-xs text-muted">
          Showing {shown} of {total} {noun}
        </span>
      )}
      {hasMore && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onClick} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
