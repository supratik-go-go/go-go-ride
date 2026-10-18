import { BusFront, Mail, MapPin, Phone, RefreshCw, Route, Signpost, Users } from 'lucide-react'
import { Skeleton } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { platformService } from '../../services'
import { formatNumber } from '../../utils/format'

const STAT_ITEMS = [
  { key: 'buses', label: 'Buses listed', icon: BusFront, tone: '' },
  { key: 'routes', label: 'Routes covered', icon: Route, tone: 'accent' },
  { key: 'stops', label: 'Bus stops', icon: Signpost, tone: 'success' },
  { key: 'users', label: 'Registered riders', icon: Users, tone: 'violet' },
]

/** Platform counters from GET /stats (buses, routes, stops, users). */
export function PlatformStats({ variant = 'light' }) {
  const stats = useAsync(() => platformService.stats(), [])
  return (
    <div className={`pub-stats pub-stats-${variant}`}>
      {STAT_ITEMS.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className="pub-stat">
          <span className={`icon-tile ${tone}`}>
            <Icon size={22} />
          </span>
          <div className="pub-stat-text">
            {stats.loading && !stats.data ? (
              <Skeleton width={56} height={26} />
            ) : (
              <strong className="tabular">{stats.data ? formatNumber(stats.data[key] ?? 0) : '-'}</strong>
            )}
            <span>{label}</span>
          </div>
        </div>
      ))}
      {stats.error && !stats.data && (
        <button type="button" className="link-btn pub-stats-retry" onClick={() => stats.reload()}>
          <RefreshCw size={14} /> Couldn&apos;t load the latest numbers - retry
        </button>
      )}
    </div>
  )
}

/** Phone / email / address rows from GET /settings. Pass a useAsync() state. */
export function ContactDetails({ state, compact }) {
  const { data, loading, error, reload } = state
  if (loading && !data) {
    return (
      <div className="pub-contact-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pub-contact-row">
            <Skeleton width={44} height={44} radius={12} />
            <div className="grow stack" style={{ '--gap': '6px' }}>
              <Skeleton width="30%" height={12} />
              <Skeleton width="70%" height={16} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="alert alert-warning" role="alert">
        <span className="grow">Contact details couldn&apos;t be loaded. {error.message}</span>
        <button type="button" className="link-btn" onClick={() => reload()}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }
  const s = data || {}
  const rows = [
    s.contactNumber && {
      icon: Phone,
      label: 'Call us',
      value: s.contactNumber,
      href: `tel:${String(s.contactNumber).replace(/[^\d+]/g, '')}`,
      tone: '',
    },
    s.platformEmail && { icon: Mail, label: 'Email', value: s.platformEmail, href: `mailto:${s.platformEmail}`, tone: 'accent' },
    s.address && {
      icon: MapPin,
      label: 'Office',
      value: s.address,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`,
      external: true,
      tone: 'success',
    },
  ].filter(Boolean)
  if (!rows.length) return <p className="text-sm text-muted">Contact details will be published soon.</p>
  return (
    <div className={`pub-contact-list ${compact ? 'compact' : ''}`}>
      {rows.map(({ icon: Icon, label, value, href, external, tone }) => (
        <a key={label} className="pub-contact-row" href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          <span className={`icon-tile ${tone}`}>
            <Icon size={20} />
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="text-xs text-muted">{label}</span>
            <span className="pub-contact-value">{value}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
