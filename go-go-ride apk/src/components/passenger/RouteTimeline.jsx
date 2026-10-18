import { Link } from 'react-router-dom'
import './passenger-ui.css'

const cx = (...c) => c.filter(Boolean).join(' ')

const km = (v) => (v == null ? '' : `${Number(v).toFixed(1)} km`)

/**
 * Turn a bus `timetable[]` (GET /buses/:id) into timeline items, highlighting
 * the boarding (`fromId`) and arrival (`toId`) stops when they are on the bus.
 */
export function timelineFromTimetable(timetable = [], fromId, toId) {
  const ids = timetable.map((t) => t.stop?.id ?? t.stopId)
  const fromIdx = fromId ? ids.indexOf(fromId) : -1
  const toIdx = toId ? ids.indexOf(toId) : -1
  const segment = fromIdx >= 0 && toIdx > fromIdx
  const last = timetable.length - 1
  return timetable.map((t, i) => {
    const isStart = t.isStart || i === 0
    const isEnd = t.isEnd || i === last
    const tag = i === fromIdx ? 'Boarding' : i === toIdx ? 'Drop-off' : null
    return {
      key: t.id || `${i}`,
      name: t.stop?.name ?? 'Stop',
      caption: isStart ? 'Start Point' : isEnd ? 'End Point' : null,
      time: t.arrivalTime12h,
      sub: t.departureTime12h && t.departureTime12h !== t.arrivalTime12h ? `Leaves ${t.departureTime12h}` : null,
      meta: km(t.distanceKm),
      tag,
      tone: i === fromIdx ? 'board' : i === toIdx ? 'drop' : null,
      muted: segment && (i < fromIdx || i > toIdx),
    }
  })
}

/**
 * Vertical stop timeline (design 07): ring markers on a navy rail, stop name +
 * caption on the left, time and cumulative distance on the right.
 *
 * items: [{ key, name, caption, tag, time, sub, meta, tone: 'board'|'drop', muted, to }]
 */
export function RouteTimeline({ items, label = 'Stops on this route' }) {
  if (!items?.length) return null
  return (
    <ol className="px-timeline" aria-label={label}>
      {items.map((item) => {
        const content = (
          <>
            <div className="px-tl-body">
              <div className="px-tl-name">
                {item.name}
                {item.tag && <span className="px-tl-tag">{item.tag}</span>}
              </div>
              {item.caption && <div className="px-tl-caption">{item.caption}</div>}
            </div>
            {(item.time || item.meta) && (
              <div className="px-tl-side">
                {item.time && <div className="px-tl-time">{item.time}</div>}
                {item.sub && <div className="px-tl-meta">{item.sub}</div>}
                {item.meta && <div className="px-tl-meta">{item.meta}</div>}
              </div>
            )}
          </>
        )
        return (
          <li
            key={item.key}
            className={cx('px-tl-item', item.tone === 'board' && 'is-board', item.tone === 'drop' && 'is-drop', item.muted && 'is-muted')}
          >
            <span className="px-tl-rail" aria-hidden="true">
              <span className="px-tl-dot" />
            </span>
            {item.to ? (
              <Link to={item.to} className="px-tl-content">
                {content}
              </Link>
            ) : (
              <div className="px-tl-content">{content}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default RouteTimeline
