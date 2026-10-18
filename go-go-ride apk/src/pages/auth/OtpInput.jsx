import { useEffect, useRef } from 'react'
import './auth.css'

const LENGTH = 6

/**
 * Six one-digit boxes. Supports typing, backspace, arrow keys, paste and the
 * SMS one-time-code autofill (the first box carries autocomplete="one-time-code";
 * an autofilled 6-digit string is spread across the boxes).
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, autoFocus = true }) {
  const refs = useRef([])
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || '')

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, LENGTH - 1)]?.focus()
    // focus once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH)
    onChange(clean)
    if (clean.length === LENGTH) onComplete?.(clean)
    return clean
  }

  const handleInput = (i, raw) => {
    let typed = raw.replace(/\D/g, '')
    if (!typed) return
    // The first box accepts 6 chars (for autofill); typing over its digit yields "35" -> keep the new one.
    if (i === 0 && typed.length === 2 && digits[0] && typed.startsWith(digits[0])) typed = typed[1]
    if (typed.length > 1) {
      // autofill or paste into one box
      const clean = commit(typed.length >= LENGTH ? typed : value.slice(0, i) + typed)
      refs.current[Math.min(clean.length, LENGTH - 1)]?.focus()
      return
    }
    const arr = digits.slice()
    arr[i] = typed
    const clean = commit(arr.join(''))
    refs.current[Math.min(clean.length, LENGTH - 1)]?.focus()
  }

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = digits.slice()
      if (arr[i]) {
        arr[i] = ''
        onChange(arr.join(''))
      } else if (i > 0) {
        arr[i - 1] = ''
        onChange(arr.join(''))
        refs.current[i - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < LENGTH - 1) {
      refs.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!text) return
    e.preventDefault()
    const clean = commit(text)
    refs.current[Math.min(clean.length, LENGTH - 1)]?.focus()
  }

  return (
    <div className={`auth-otp ${invalid ? 'invalid' : ''}`} role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className={`auth-otp-box ${d ? 'filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? LENGTH : 1}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  )
}
