import '../../pages/admin/admin-ops.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/**
 * On/off switch. <Switch checked={v} onChange={(next) => ...} label="Verified" busy={saving} />
 * `label` is the accessible name; render visible text next to it yourself.
 */
export function Switch({ checked, onChange, label, disabled, busy, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      aria-busy={busy || undefined}
      title={title || label}
      className={cx('ops-switch', checked && 'on', busy && 'busy')}
      disabled={disabled}
      onClick={() => !busy && onChange(!checked)}
    >
      <span className="ops-switch-knob" />
    </button>
  )
}

/**
 * Single-choice button group (radio semantics).
 *   <ChoiceGroup ariaLabel="Vehicle" value={v} onChange={setV} options={[{ value, label, icon: Car }]} />
 */
export function ChoiceGroup({ options, value, onChange, ariaLabel, tone, disabled }) {
  return (
    <div className={cx('ops-choice', tone)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const Icon = o.icon
        return (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} disabled={disabled} title={o.title}>
            {Icon && <Icon size={17} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Live character counter for length-limited fields. */
export function Counter({ value, max }) {
  const n = String(value || '').length
  return (
    <span className={cx('ops-counter', n > max && 'over')} aria-live="polite">
      {n}/{max}
    </span>
  )
}
