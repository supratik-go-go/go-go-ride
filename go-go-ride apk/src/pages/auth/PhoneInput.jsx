import { forwardRef, useId } from 'react'
import { cleanPhone } from './formUtils'
import './auth.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/** 10-digit Indian mobile input with a fixed +91 prefix. `value` is digits only. */
export const PhoneInput = forwardRef(function PhoneInput(
  { label = 'Mobile number', value, onChange, error, hint, required, id, className, disabled, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <div className={cx('field', className)}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      <div className={cx('auth-phone', error && 'invalid', disabled && 'disabled')}>
        <span className="auth-phone-prefix" aria-hidden="true">
          <span className="auth-flag" />
          +91
        </span>
        <input
          ref={ref}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={14}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(cleanPhone(e.target.value))}
          {...rest}
        />
      </div>
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
})
