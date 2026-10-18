import { label as enumLabel, statusTone } from '../../utils/format'

const cx = (...c) => c.filter(Boolean).join(' ')

/** <Badge tone="success|warning|danger|info|primary|accent|neutral" icon={...}>Text</Badge> */
export function Badge({ tone = 'neutral', icon, size, square, className, children, ...rest }) {
  return (
    <span className={cx('badge', `badge-${tone}`, size === 'lg' && 'badge-lg', square && 'badge-square', className)} {...rest}>
      {icon}
      {children}
    </span>
  )
}

/**
 * Status pill for any backend enum: <StatusBadge value="UNDER_REVIEW" group="busStatus" />
 * Picks colour from the value and text from LABELS[group].
 */
export function StatusBadge({ value, group, size, withDot }) {
  const tone = statusTone(value)
  return (
    <Badge tone={tone} size={size} square>
      {withDot && <span className="dot" />}
      {group ? enumLabel(group, value) : String(value || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  )
}

/** "S12" style route badge; falls back to bus number. */
export function RouteBadge({ children, size = 'md', muted }) {
  const style =
    size === 'lg'
      ? { fontSize: '1.5rem', padding: '6px 16px', borderRadius: 10 }
      : size === 'sm'
        ? { fontSize: '0.75rem', padding: '2px 8px' }
        : undefined
  return (
    <span className="route-badge" style={{ ...style, ...(muted ? { background: '#9aa3bb' } : null) }}>
      {children}
    </span>
  )
}
