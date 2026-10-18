const cx = (...c) => c.filter(Boolean).join(' ')

/** <Card pad hover title="..." action={<a/>}>...</Card> */
export function Card({ pad = true, padLg, hover, title, subtitle, action, className, children, as: Tag = 'div', ...rest }) {
  const hasHeader = title || action
  return (
    <Tag className={cx('card', hover && 'card-hover', className)} {...rest}>
      {hasHeader && (
        <div className="card-header">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="section-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={cx(pad && !padLg && 'card-pad', padLg && 'card-pad-lg')}>{children}</div>
    </Tag>
  )
}

/** Dashboard stat tile: icon, label, big value, optional trend %. */
export function StatCard({ icon, tone = '', label, value, trend, trendLabel = 'vs last period', footer }) {
  const up = trend > 0
  const down = trend < 0
  return (
    <div className="card card-pad stat-card">
      <div className={cx('icon-tile lg', tone)}>{icon}</div>
      <div className="stack" style={{ '--gap': '2px', minWidth: 0 }}>
        <span className="text-sm text-muted">{label}</span>
        <span className="stat-value tabular">{value}</span>
        {trend != null && (
          <span className={cx('text-xs fw-500', up && 'text-success', down && 'text-danger', !up && !down && 'text-muted')}>
            {up ? '↑' : down ? '↓' : '•'} {Math.abs(trend).toFixed(1)}% <span className="text-muted">{trendLabel}</span>
          </span>
        )}
        {footer}
      </div>
    </div>
  )
}
