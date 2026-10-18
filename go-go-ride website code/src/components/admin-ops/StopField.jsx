import { useEffect, useId, useRef } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { StopInput } from '../navigation/SearchBar'
import '../../pages/admin/admin-ops.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/**
 * Bus-stop autocomplete as a labelled form field.
 * `value` is { id, name, ... } | null. `invalid` marks the box red without a message. Typing clears the id until a suggestion
 * is picked, so callers validate with `value?.id` (forms here need real ids).
 *
 *   <StopField label="From stop" required value={from} onChange={setFrom} error={errors.fromStopId} />
 */
export function StopField({ label, required, value, onChange, placeholder = 'Type a stop name', error, invalid, hint, ariaLabel, compact, className }) {
  const bad = Boolean(error || invalid)
  const ref = useRef(null)
  const labelId = useId()
  useEffect(() => {
    const input = ref.current?.querySelector('input')
    if (!input) return
    if (label) input.setAttribute('aria-labelledby', labelId)
    else input.setAttribute('aria-label', ariaLabel || placeholder)
    input.setAttribute('aria-invalid', bad ? 'true' : 'false')
    input.setAttribute('autocomplete', 'off')
    if (required) input.setAttribute('aria-required', 'true')
  }, [label, labelId, ariaLabel, placeholder, bad, required])

  return (
    <div className={cx('field', className)}>
      {label && (
        <span className="field-label" id={labelId}>
          {label}
          {required && <span className="req">*</span>}
        </span>
      )}
      <div ref={ref} className={cx('ops-stopfield', bad && 'invalid', compact && 'compact')}>
        <StopInput value={value} onChange={onChange} placeholder={placeholder} />
        {value?.id && <CheckCircle2 size={16} className="ops-stopfield-ok" aria-label="Stop selected" />}
      </div>
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export default StopField
