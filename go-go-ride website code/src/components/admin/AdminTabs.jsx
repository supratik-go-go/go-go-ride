import './admin-ui.css'

/**
 * Underlined tabs (same look as ui/Tabs) that also support disabled items
 * with a "Soon" pill - for screens whose backend isn't there yet.
 *
 *   <AdminTabs value={tab} onChange={setTab} items={[
 *     { value: 'overview', label: 'Overview' },
 *     { value: 'bus', label: 'Bus Reports', disabled: true, soon: true, title: 'Coming soon' },
 *     { value: 'all', label: 'All', count: 12 },
 *   ]} />
 */
export function AdminTabs({ items, value, onChange, className = '', ariaLabel }) {
  return (
    <div className={`tabs adm-tabs ${className}`} role="tablist" aria-label={ariaLabel}>
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          aria-disabled={t.disabled || undefined}
          title={t.title}
          className={`tab ${value === t.value ? 'active' : ''}`}
          onClick={() => !t.disabled && onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
          {t.soon && <span className="adm-soon">Soon</span>}
        </button>
      ))}
    </div>
  )
}

export default AdminTabs
