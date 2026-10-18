import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const cx = (...c) => c.filter(Boolean).join(' ')

function Field({ id, label, required, hint, error, children, className }) {
  return (
    <div className={cx('field', className)}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

/** Text input with label, icon, hint and error. type="password" gets a show/hide toggle. */
export const Input = forwardRef(function Input(
  { label, required, hint, error, icon, suffix, className, type = 'text', id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id || autoId
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const actualSuffix = isPassword ? (
    <button type="button" className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  ) : (
    suffix
  )
  return (
    <Field id={inputId} label={label} required={required} hint={hint} error={error} className={className}>
      <div className={cx('input-wrap', icon && 'has-icon', actualSuffix && 'has-suffix')}>
        {icon && <span className="input-icon">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && show ? 'text' : type}
          className={cx('input', error && 'invalid')}
          aria-invalid={Boolean(error)}
          required={required}
          {...rest}
        />
        {actualSuffix && <span className="input-suffix">{actualSuffix}</span>}
      </div>
    </Field>
  )
})

/** <Select options={[{value,label}]} placeholder="Select…" /> */
export const Select = forwardRef(function Select(
  { label, required, hint, error, options = [], placeholder, className, id, children, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id || autoId
  return (
    <Field id={selectId} label={label} required={required} hint={hint} error={error} className={className}>
      <select ref={ref} id={selectId} className={cx('select', error && 'invalid')} required={required} {...rest}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
    </Field>
  )
})

export const Textarea = forwardRef(function Textarea({ label, required, hint, error, className, id, ...rest }, ref) {
  const autoId = useId()
  const taId = id || autoId
  return (
    <Field id={taId} label={label} required={required} hint={hint} error={error} className={className}>
      <textarea ref={ref} id={taId} className={cx('textarea', error && 'invalid')} required={required} {...rest} />
    </Field>
  )
})

/** Build select options from a LABELS group: optionsFrom(LABELS.busType) */
export const optionsFrom = (map) => Object.entries(map).map(([value, label]) => ({ value, label }))
