import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, dateParts, formatDateLong, todayISO } from '../../utils/format'
import './passenger-ui.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/** First day of the window that should show `value`. */
function windowStart(value, min, days) {
  if (!value || value < min) return min
  if (value <= addDays(min, days - 1)) return min
  return value
}

/**
 * 7-day date picker strip (design 05). The window starts today; the arrows
 * shift it by a week without changing the selection.
 *
 *   <DateStrip value={date} onChange={setDate} />
 */
export function DateStrip({ value, onChange, days = 7, min }) {
  const floor = min || todayISO()
  const [start, setStart] = useState(() => windowStart(value, floor, days))

  // Keep the selected day visible when it is changed from elsewhere (e.g. a date input).
  useEffect(() => {
    if (!value) return
    if (value < start || value > addDays(start, days - 1)) setStart(windowStart(value, floor, days))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const list = Array.from({ length: days }, (_, i) => addDays(start, i))
  const today = todayISO()
  const canPrev = start > floor

  return (
    <div className="px-datestrip" role="group" aria-label="Choose travel date">
      <button
        type="button"
        className="px-datestrip-arrow"
        onClick={() => {
          const prev = addDays(start, -days)
          setStart(prev < floor ? floor : prev)
        }}
        disabled={!canPrev}
        aria-label="Previous week"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="px-datestrip-days">
        {list.map((iso) => {
          const p = dateParts(iso)
          const active = iso === value
          return (
            <button
              key={iso}
              type="button"
              className={cx('px-day', active && 'active', iso === today && 'is-today')}
              onClick={() => onChange?.(iso)}
              aria-pressed={active}
              aria-label={`${iso === today ? 'Today, ' : ''}${formatDateLong(iso)}`}
            >
              <span className="px-day-num">{p.day}</span>
              <span className="px-day-month">{p.month}</span>
              <span className="px-day-week">{p.weekday}</span>
            </button>
          )
        })}
      </div>
      <button type="button" className="px-datestrip-arrow" onClick={() => setStart(addDays(start, days))} aria-label="Next week">
        <ChevronRight size={20} />
      </button>
    </div>
  )
}

export default DateStrip
