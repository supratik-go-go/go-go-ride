import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { assetUrl } from '../../api/client'
import { initials } from '../../utils/format'
import logoWordmark from '../../assets/brand/logo-wordmark.png'

const cx = (...c) => c.filter(Boolean).join(' ')

export function Logo({ height = 44, className }) {
  return <img src={logoWordmark} alt="GO-GO Ride" style={{ height, width: 'auto' }} className={className} draggable="false" />
}

export function Avatar({ src, name, size = 44, className }) {
  const url = assetUrl(src)
  return url ? (
    <img src={url} alt={name || ''} className={cx('avatar', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cx('avatar avatar-fallback', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  )
}

/** Read-only stars (supports halves) or interactive when `onChange` is given. */
export function StarRating({ value = 0, size = 16, onChange, showValue }) {
  const stars = [1, 2, 3, 4, 5]
  return (
    <span className="row" style={{ '--gap': '2px', display: 'inline-flex' }}>
      {stars.map((s) => {
        const fill = Math.max(0, Math.min(1, value - (s - 1)))
        const content = (
          <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
            <Star size={size} color="#f59e0b" fill="none" strokeWidth={1.8} />
            {fill > 0 && (
              <span style={{ position: 'absolute', inset: 0, width: `${fill * 100}%`, overflow: 'hidden', display: 'inline-flex' }}>
                <Star size={size} color="#f59e0b" fill="#f59e0b" strokeWidth={1.8} style={{ flexShrink: 0 }} />
              </span>
            )}
          </span>
        )
        return onChange ? (
          <button key={s} type="button" onClick={() => onChange(s)} aria-label={`${s} star${s > 1 ? 's' : ''}`} style={{ background: 'none', border: 0, padding: 2 }}>
            {content}
          </button>
        ) : (
          <span key={s}>{content}</span>
        )
      })}
      {showValue && <span className="fw-600" style={{ marginLeft: 6 }}>{Number(value).toFixed(1)}</span>}
    </span>
  )
}

/** Mobile-app style page header: back arrow, centred title, right actions. */
export function PageHeader({ title, subtitle, back = true, onBack, actions, className }) {
  const navigate = useNavigate()
  const goBack = () => (onBack ? onBack() : window.history.length > 1 ? navigate(-1) : navigate('/home'))
  return (
    <div className={cx('page-header', className)}>
      <div className="page-header-side">
        {back && (
          <button type="button" className="icon-btn" onClick={goBack} aria-label="Go back">
            <ArrowLeft size={22} />
          </button>
        )}
      </div>
      <div className="page-header-title">
        <h1>{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="page-header-side right">{actions}</div>
    </div>
  )
}

/** Admin-style title row: title + subtitle on the left, actions on the right. */
export function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="section-header">
      <div>
        <h1 className="section-header-title">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  )
}

/** Underlined tabs: <Tabs value={tab} onChange={setTab} items={[{value,label,count}]} /> */
export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          className={cx('tab', value === t.value && 'active')}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Pager for API `meta` ({ page, limit, total, totalPages }). */
export function Pagination({ meta, onChange, noun = 'items' }) {
  if (!meta || !meta.total) return null
  const { page, limit, total, totalPages } = meta
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const pages = []
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }
  return (
    <div className="pagination">
      <span className="text-sm text-muted">
        Showing {start} to {end} of {total} {noun}
      </span>
      {totalPages > 1 && (
        <div className="row" style={{ '--gap': '6px' }}>
          <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="text-muted">
                …
              </span>
            ) : (
              <button key={p} type="button" className={cx('page-btn', p === page && 'active')} onClick={() => onChange(p)}>
                {p}
              </button>
            ),
          )}
          <button type="button" className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Small key/value block used on detail cards. */
export function InfoItem({ icon, label, value }) {
  return (
    <div className="info-item">
      {icon && <span className="info-item-icon">{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <div className="text-xs text-muted">{label}</div>
        <div className="fw-600 truncate">{value ?? '-'}</div>
      </div>
    </div>
  )
}
