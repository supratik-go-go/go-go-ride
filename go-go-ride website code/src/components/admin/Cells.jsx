import { formatDateTime } from '../../utils/format'
import './admin-ui.css'

/** Timestamp as two lines for tables: "24 May 2026" over "09:30 AM". */
export function DateTimeCell({ value }) {
  if (!value) return <span className="text-muted">-</span>
  const [date, time] = formatDateTime(value).split(', ')
  return (
    <span className="adm-datetime">
      {date}
      {time && <small>{time}</small>}
    </span>
  )
}

export default DateTimeCell
