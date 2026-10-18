import { Search } from 'lucide-react'
import { Skeleton } from './LoadingSpinner'
import { EmptyState, ErrorState } from './States'
import { Pagination } from './Misc'

/**
 * Admin table with built-in loading / error / empty states and pagination.
 *
 *   <DataTable
 *     columns={[{ key: 'busNumber', header: 'Bus Number', render: (row) => ..., width, align }]}
 *     rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
 *     meta={list.meta} onPageChange={list.setPage} noun="buses"
 *     empty={{ title: 'No buses', message: '...' }}
 *     onRowClick={(row) => ...}
 *   />
 */
export function DataTable({ columns, rows, loading, error, onRetry, meta, onPageChange, noun, empty, onRowClick, rowKey = 'id' }) {
  const showSkeleton = loading && !rows?.length
  return (
    <div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width, textAlign: c.align }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ opacity: loading && rows?.length ? 0.55 : 1, transition: 'opacity 150ms' }}>
            {showSkeleton &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`s${i}`}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <Skeleton height={14} width={`${50 + ((i * 7 + c.key.length * 13) % 45)}%`} />
                    </td>
                  ))}
                </tr>
              ))}
            {!showSkeleton &&
              rows?.map((row) => (
                <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align }}>
                      {c.render ? c.render(row) : (row[c.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && error && !rows?.length && <ErrorState error={error} onRetry={onRetry} compact />}
      {!loading && !error && !rows?.length && <EmptyState icon={<Search size={24} />} compact {...empty} />}
      {meta && onPageChange && <Pagination meta={meta} onChange={onPageChange} noun={noun} />}
    </div>
  )
}

/** Search box + filter slots + right-side actions, above a table. */
export function TableToolbar({ search, onSearch, placeholder = 'Search…', children, actions }) {
  return (
    <div className="table-toolbar">
      {onSearch && (
        <div className="input-wrap has-icon table-search">
          <span className="input-icon">
            <Search size={17} />
          </span>
          <input className="input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label="Search" />
        </div>
      )}
      {children}
      {actions && <div className="row wrap" style={{ marginLeft: 'auto' }}>{actions}</div>}
    </div>
  )
}
