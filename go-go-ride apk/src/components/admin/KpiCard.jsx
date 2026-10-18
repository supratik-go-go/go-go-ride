import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUp, Minus } from 'lucide-react'
import { Skeleton } from '../ui/LoadingSpinner'
import './admin-ui.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/**
 * Trend pill: <Trend value={12.5} label="vs last week" />
 * Positive = green up arrow, negative = red down arrow, 0 = muted dash.
 * Pass `invert` when a rise is bad (e.g. cancellations).
 */
export function Trend({ value, label, invert = false }) {
  if (value == null || Number.isNaN(Number(value))) return null
  const v = Number(value)
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
  const good = invert ? (dir === 'up' ? 'down' : dir === 'down' ? 'up' : 'flat') : dir
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
  return (
    <span className={cx('adm-trend', good)}>
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(v).toFixed(1)}%{label && <span className="adm-trend-label">{label}</span>}
    </span>
  )
}

/**
 * Admin stat tile (design deck page 10).
 *
 *   <KpiCard icon={<Bus size={26} />} tone="primary" label="Total Buses" value="1,248"
 *            trend={12.5} trendLabel="vs last week" />
 *   <KpiCard ... link={{ to: '/admin/bus-requests', label: 'View requests' }} />
 *
 * tone: primary | accent | success | danger | warning | info | violet
 * `loading` swaps the value for a skeleton; `footer` renders under the value.
 */
export function KpiCard({ icon, tone = 'primary', label, value, trend, trendLabel, invertTrend, link, footer, loading, title }) {
  return (
    <div className="adm-card adm-kpi" title={title}>
      <span className={cx('adm-kpi-icon', `tone-${tone}`)} aria-hidden="true">
        {icon}
      </span>
      <div className="stack" style={{ '--gap': '2px', minWidth: 0 }}>
        <span className="adm-kpi-label">{label}</span>
        {loading ? <Skeleton width={90} height={28} style={{ margin: '3px 0' }} /> : <span className="adm-kpi-value">{value}</span>}
        {!loading && trend != null && <Trend value={trend} label={trendLabel} invert={invertTrend} />}
        {!loading && link && (
          <Link to={link.to} className="adm-kpi-link">
            {link.label} <ArrowRight size={14} />
          </Link>
        )}
        {!loading && footer && <div className="adm-kpi-foot">{footer}</div>}
      </div>
    </div>
  )
}

export default KpiCard
