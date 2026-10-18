import { Skeleton } from '../ui/LoadingSpinner'
import { ErrorState } from '../ui/States'
import { Trend } from './KpiCard'
import './admin-ui.css'

/**
 * White admin panel with a title row, an optional headline number and a body.
 * Handles the loading (skeleton) and error states so charts only render data.
 *
 *   <ChartCard title="Buses Added" actions={<RangeChip />}
 *     headline={{ value: 45, label: 'New buses', trend: 10.2, trendLabel: 'vs last week' }}
 *     loading={q.loading && !q.data} error={q.error} onRetry={q.reload}>
 *     <TimeSeriesChart ... />
 *   </ChartCard>
 *
 * `bodyHeight` sizes the skeleton so the layout doesn't jump.
 */
export function ChartCard({ title, subtitle, actions, headline, loading, error, onRetry, bodyHeight = 220, className = '', children }) {
  return (
    <section className={`adm-card ${className}`}>
      {(title || actions) && (
        <div className="adm-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h2 className="adm-card-title">{title}</h2>}
            {subtitle && <div className="adm-card-sub">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className="adm-card-body">
        {headline && (
          <div className="adm-chart-headline">
            {loading ? (
              <Skeleton width={80} height={26} />
            ) : (
              <span className="adm-chart-value">{headline.value}</span>
            )}
            {headline.label && <span className="text-sm text-2">{headline.label}</span>}
            {!loading && headline.trend != null && <Trend value={headline.trend} label={headline.trendLabel} invert={headline.invert} />}
          </div>
        )}
        {error && !loading ? (
          <ErrorState error={error} onRetry={onRetry} compact />
        ) : loading ? (
          <Skeleton height={bodyHeight} radius={12} />
        ) : (
          children
        )}
      </div>
    </section>
  )
}

export default ChartCard
