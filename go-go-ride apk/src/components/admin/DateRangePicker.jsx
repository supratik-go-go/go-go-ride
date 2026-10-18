import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { todayISO } from '../../utils/format'
import { formatRange, presetRange, rangeDays, RANGE_PRESETS } from './adminUtils'
import './admin-ui.css'

const MAX_DAYS = 366

/**
 * Date range dropdown: presets + a custom from/to.
 *
 *   const [range, setRange] = useState(() => presetRange('30d'))   // { preset, from, to }
 *   <DateRangePicker value={range} onChange={setRange} />
 *   adminService.reports(rangeParams(range))
 *
 * A value without from/to (e.g. `{ preset: '7d' }`) means "let the server pick
 * its default window"; pass `displayFrom`/`displayTo` (e.g. the first/last
 * date the API returned) so the button can still show real dates.
 *
 * presets: any keys of RANGE_PRESETS ('today', '7d', '30d', '90d').
 */
export function DateRangePicker({
  value,
  onChange,
  presets = ['7d', '30d', '90d'],
  allowCustom = true,
  displayFrom,
  displayTo,
  size = 'md',
  align = 'right',
  label = 'Date range',
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value?.from || '')
  const [to, setTo] = useState(value?.to || '')
  const ref = useRef(null)
  const popId = useId()
  const today = todayISO()

  useEffect(() => {
    if (!open) return undefined
    setFrom(value?.from || displayFrom || '')
    setTo(value?.to || displayTo || '')
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const shownFrom = value?.from || displayFrom
  const shownTo = value?.to || displayTo
  const presetLabel = RANGE_PRESETS[value?.preset]?.label
  const text = shownFrom && shownTo ? formatRange(shownFrom, shownTo) : presetLabel || 'Select dates'

  let customError = ''
  if (from && to && from > to) customError = 'Start date must be before the end date'
  else if (from && to && rangeDays(from, to) > MAX_DAYS) customError = 'Pick a range of one year or less'
  const canApply = from && to && !customError

  const pick = (preset) => {
    onChange?.(presetRange(preset))
    setOpen(false)
  }

  const apply = () => {
    if (!canApply) return
    onChange?.({ preset: 'custom', from, to })
    setOpen(false)
  }

  return (
    <div className={`adm-range ${align === 'left' ? 'align-left' : ''}`} ref={ref}>
      <button
        type="button"
        className={`adm-range-btn ${size === 'sm' ? 'sm' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={popId}
        aria-label={`${label}: ${presetLabel ? `${presetLabel}, ` : ''}${text}`}
        title={presetLabel}
      >
        <CalendarDays size={size === 'sm' ? 15 : 18} />
        <span className="truncate">{text}</span>
        <ChevronDown size={16} className="chev" />
      </button>
      {open && (
        <div className="adm-range-pop" id={popId} role="dialog" aria-label={label}>
          {presets.map((p) => (
            <button key={p} type="button" className={`adm-range-opt ${value?.preset === p ? 'active' : ''}`} onClick={() => pick(p)}>
              {RANGE_PRESETS[p]?.label || p}
              {value?.preset === p && <Check size={16} />}
            </button>
          ))}
          {allowCustom && (
            <div className="adm-range-custom">
              <span className="text-xs fw-600 text-2">Custom range</span>
              <div className="grid grid-2 keep-mobile">
                <label className="field">
                  <span className="text-xs text-muted">From</span>
                  <input type="date" className="input" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="field">
                  <span className="text-xs text-muted">To</span>
                  <input type="date" className="input" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
              {customError && <span className="field-error">{customError}</span>}
              <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={apply}>
                Apply range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DateRangePicker
