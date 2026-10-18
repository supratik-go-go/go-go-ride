import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  Check,
  FileText,
  FileUp,
  GripVertical,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { StopInput } from '../navigation/SearchBar'
import { formatBytes, DOC_ACCEPT, DAY_ORDER, validateUpload } from './ownerUtils'
import { LABELS, to12h } from '../../utils/format'
import '../../pages/owner/owner.css'

const cx = (...c) => c.filter(Boolean).join(' ')

let rowSeq = 0
const keySalt = Math.random().toString(36).slice(2, 7)
/** A blank stopage row. `key` keeps each row's autocomplete state stable across reorders. */
export const newStopRow = (patch) => ({ key: `r${keySalt}${(rowSeq += 1)}`, stop: null, arrivalTime: '', departureTime: '', distanceKm: '', ...patch })

/** Stop autocomplete inside a bordered form box, with an accessible name and invalid state. */
export function StopField({ value, onChange, placeholder = 'Type a stop name', ariaLabel, invalid, tag, icon, label, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const input = ref.current?.querySelector('input')
    if (!input) return
    if (ariaLabel) input.setAttribute('aria-label', ariaLabel)
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
    input.setAttribute('autocomplete', 'off')
  }, [ariaLabel, invalid])
  return (
    <div ref={ref} className={cx('own-stopfield', invalid && 'own-invalid', tag && 'has-tag', label && 'has-label', className)}>
      <StopInput value={value} onChange={onChange} placeholder={placeholder} label={label} icon={icon} />
      {tag}
    </div>
  )
}

/** Toggle chips bound to a single value (Bus Type / Category quick pickers). */
export function ChoiceChips({ options, value, onChange, ariaLabel }) {
  return (
    <div className="own-choice" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const Icon = o.icon
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx('own-choice-chip', active && 'active', o.tone)}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={18} />}
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Mon-Sun toggle tiles -> array of day codes. */
export function ServiceDaysPicker({ value, onChange, error }) {
  const set = new Set(value)
  const toggle = (d) => {
    const next = new Set(set)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    onChange(DAY_ORDER.filter((x) => next.has(x)))
  }
  const preset = (days) => onChange(days)
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className={cx('own-days', error && 'own-invalid')} role="group" aria-label="Service days">
        {DAY_ORDER.map((d) => {
          const on = set.has(d)
          return (
            <button key={d} type="button" role="checkbox" aria-checked={on} className={cx('own-day', on && 'on')} onClick={() => toggle(d)} aria-invalid={Boolean(error) && !value.length}>
              <span className="own-day-name">{LABELS.day[d]}</span>
              <span className="own-day-check">{on && <Check size={13} strokeWidth={3} />}</span>
            </button>
          )
        })}
      </div>
      <div className="row wrap" style={{ '--gap': '8px' }}>
        <button type="button" className="link-btn" onClick={() => preset(DAY_ORDER.slice(0, 5))}>
          Weekdays
        </button>
        <span className="text-muted">·</span>
        <button type="button" className="link-btn" onClick={() => preset(DAY_ORDER.slice(0, 6))}>
          Mon–Sat
        </button>
        <span className="text-muted">·</span>
        <button type="button" className="link-btn" onClick={() => preset([...DAY_ORDER])}>
          Every day
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

export const DOC_TILES = [
  { type: 'RC_BOOK', title: 'RC Book', sub: '(Registration Certificate)', icon: FileText, tone: 'violet' },
  { type: 'ROUTE_PERMIT', title: 'Route Permit', sub: '(Valid Permit)', icon: ShieldCheck, tone: 'primary' },
  { type: 'INSURANCE', title: 'Insurance', sub: '(Certificate)', icon: BadgeCheck, tone: 'success' },
  { type: 'OTHER', title: 'Other Document', sub: '(Any official proof)', icon: FileUp, tone: 'accent' },
]

/** Four dashed upload tiles (design 08). `files` / `errors` are keyed by docType. */
export function DocTiles({ files, errors = {}, existing = [], onChange, invalid }) {
  const pick = (type, e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    onChange(type, file, validateUpload(file))
  }
  return (
    <div className={cx('own-doc-tiles', invalid && 'own-invalid')}>
      {DOC_TILES.map(({ type, title, sub, icon: Icon, tone }) => {
        const file = files[type]
        const err = errors[type]
        const already = existing.filter((d) => d.docType === type).length
        return (
          <label key={type} className={cx('own-doc-tile', file && !err && 'has-file', err && 'has-error')}>
            <input
              type="file"
              accept={DOC_ACCEPT}
              className="own-sr-only"
              onChange={(e) => pick(type, e)}
              aria-label={`Upload ${title}`}
              aria-invalid={Boolean(err)}
            />
            <span className={cx('own-doc-icon', tone)}>
              <Icon size={22} />
            </span>
            <span className="own-doc-title">{title}</span>
            <span className="own-doc-sub">{sub}</span>
            {already > 0 && !file && <span className="own-doc-existing">{already} on file</span>}
            {file ? (
              <span className="own-doc-file">
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="own-doc-size">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className="own-doc-remove"
                  aria-label={`Remove ${title} file`}
                  onClick={(e) => {
                    e.preventDefault()
                    onChange(type, null, null)
                  }}
                >
                  <X size={14} />
                </button>
              </span>
            ) : (
              <span className="own-doc-up" aria-hidden="true">
                <ArrowUp size={14} />
              </span>
            )}
            {err && (
              <span className="own-doc-err">
                {err}
                <button
                  type="button"
                  className="link-btn own-doc-clear"
                  onClick={(e) => {
                    e.preventDefault()
                    onChange(type, null, null)
                  }}
                >
                  Clear
                </button>
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

/** Error text for one row field: matches server keys like "stopages.0.arrivalTime". */
const rowErr = (errors, i, field) => errors[`stopages.${i}.${field}`]
const stopErr = (errors, i) => errors[`stopages.${i}.stop`] || errors[`stopages.${i}.stopName`] || errors[`stopages.${i}.stopId`] || errors[`stopages.${i}`]

/**
 * Ordered stopages table: drag handle (HTML5 drag-and-drop) + up/down buttons
 * for touch, autocomplete stop names (free text creates the stop server-side),
 * arrival / departure times and cumulative distance.
 */
export function StopagesEditor({ rows, onChange, errors = {}, onEdited }) {
  const [armed, setArmed] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const last = rows.length - 1

  const update = (i, patch, field) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    const base = `stopages.${i}`
    onEdited?.(field === 'stop' ? [`${base}.stop`, `${base}.stopName`, `${base}.stopId`, base] : [`${base}.${field}`], i)
  }
  const reordered = (next) => {
    onChange(next)
    onEdited?.('all')
  }
  const move = (from, to) => {
    if (to < 0 || to > last || from === to) return
    const next = [...rows]
    const [r] = next.splice(from, 1)
    next.splice(to, 0, r)
    reordered(next)
  }
  const remove = (i) => {
    if (rows.length <= 2) return
    reordered(rows.filter((_, j) => j !== i))
  }
  const add = () => {
    const next = [...rows]
    next.splice(Math.max(1, rows.length - 1), 0, newStopRow())
    reordered(next)
  }
  const reset = () => {
    setArmed(null)
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="own-stp">
      <div className="own-stp-head-row">
        <div>
          <div className="fw-600">Stopages</div>
          <div className="text-xs text-muted">Add all stopages in order with time. Drag rows (or use the arrows) to reorder.</div>
        </div>
        <button type="button" className="own-add-btn" onClick={add}>
          <Plus size={16} /> Add Stopage
        </button>
      </div>

      <div className="own-stp-table" role="list" aria-label="Stopages in route order">
        <div className="own-stp-cols" aria-hidden="true">
          <span />
          <span>Stopage</span>
          <span>Arrival Time</span>
          <span>Departure Time</span>
          <span>Distance (km)</span>
          <span />
        </div>
        {rows.map((r, i) => {
          const tag = i === 0 ? <span className="own-stp-tag start">Start Point</span> : i === last ? <span className="own-stp-tag end">End Point</span> : null
          const dropClass = dragging !== null && over === i && dragging !== i ? (over > dragging ? 'drop-below' : 'drop-above') : ''
          const arrErr = rowErr(errors, i, 'arrivalTime')
          const depErr = rowErr(errors, i, 'departureTime')
          const distErr = rowErr(errors, i, 'distanceKm')
          return (
            <div
              key={r.key}
              role="listitem"
              className={cx('own-stp-row', dragging === i && 'dragging', dropClass)}
              draggable={armed === r.key}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
                setDragging(i)
              }}
              onDragOver={(e) => {
                if (dragging === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== i) setOver(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging !== null && dragging !== i) move(dragging, i)
                reset()
              }}
              onDragEnd={reset}
            >
              <div className="own-stp-lead">
                <span
                  className="own-stp-handle"
                  onMouseDown={() => setArmed(r.key)}
                  onMouseUp={() => setArmed(null)}
                  title="Drag to reorder"
                  aria-hidden="true"
                >
                  <GripVertical size={18} />
                </span>
                <span className="own-stp-num">{i + 1}</span>
                <span className="own-stp-mtag">{tag}</span>
              </div>

              <div className="own-stp-stop">
                <StopField
                  value={r.stop}
                  onChange={(stop) => update(i, { stop }, 'stop')}
                  placeholder={i === 0 ? 'Starting stop' : i === last ? 'Last stop' : 'Stop name'}
                  ariaLabel={`Stop ${i + 1} name`}
                  invalid={Boolean(stopErr(errors, i))}
                  tag={tag ? <span className="own-stp-dtag">{tag}</span> : null}
                />
                {stopErr(errors, i) && <span className="field-error">{stopErr(errors, i)}</span>}
              </div>

              <div className="own-stp-arr">
                <span className="own-stp-mlabel">Arrival</span>
                <input
                  type="time"
                  className={cx('input', arrErr && 'invalid')}
                  value={r.arrivalTime}
                  onChange={(e) => {
                    const v = e.target.value
                    // Departure defaults to arrival so a quick stop needs one time.
                    update(i, { arrivalTime: v, ...(r.departureTime ? null : { departureTime: v }) }, 'arrivalTime')
                  }}
                  aria-label={`Arrival time at stop ${i + 1}`}
                  aria-invalid={Boolean(arrErr)}
                />
                {arrErr && <span className="field-error">{arrErr}</span>}
              </div>

              <div className="own-stp-dep">
                <span className="own-stp-mlabel">Departure</span>
                <input
                  type="time"
                  className={cx('input', depErr && 'invalid')}
                  value={r.departureTime}
                  onChange={(e) => update(i, { departureTime: e.target.value }, 'departureTime')}
                  aria-label={`Departure time at stop ${i + 1}`}
                  aria-invalid={Boolean(depErr)}
                />
                {depErr && <span className="field-error">{depErr}</span>}
              </div>

              <div className="own-stp-dist">
                <span className="own-stp-mlabel">Km</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  className={cx('input', distErr && 'invalid')}
                  value={r.distanceKm}
                  placeholder={i === 0 ? '0' : 'km'}
                  onChange={(e) => update(i, { distanceKm: e.target.value }, 'distanceKm')}
                  aria-label={`Distance from start to stop ${i + 1}, in kilometres`}
                  aria-invalid={Boolean(distErr)}
                />
                {distErr && <span className="field-error">{distErr}</span>}
              </div>

              <div className="own-stp-act">
                <button type="button" className="own-icon-btn" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move stop ${i + 1} up`} title="Move up">
                  <ArrowUp size={16} />
                </button>
                <button type="button" className="own-icon-btn" onClick={() => move(i, i + 1)} disabled={i === last} aria-label={`Move stop ${i + 1} down`} title="Move down">
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="own-icon-btn danger"
                  onClick={() => remove(i)}
                  disabled={rows.length <= 2}
                  aria-label={`Delete stop ${i + 1}`}
                  title={rows.length <= 2 ? 'A route needs at least two stops' : 'Delete stopage'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button" className="own-add-another" onClick={add}>
        <Plus size={16} /> Add Another Stopage
      </button>
    </div>
  )
}

/** From / To boxes bound to the first and last stopage, with a swap button. */
export function RouteEnds({ rows, onChange, errors = {}, onEdited }) {
  const last = rows.length - 1
  const setStop = (i, stop) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, stop } : r)))
    onEdited?.([`stopages.${i}.stop`, `stopages.${i}.stopName`, `stopages.${i}.stopId`, `stopages.${i}`], i)
  }
  const swap = () => {
    const a = rows[0].stop
    const b = rows[last].stop
    onChange(rows.map((r, j) => (j === 0 ? { ...r, stop: b } : j === last ? { ...r, stop: a } : r)))
    onEdited?.('all')
  }
  return (
    <div className="own-ends">
      <StopField
        label="From"
        value={rows[0]?.stop}
        onChange={(s) => setStop(0, s)}
        placeholder="Select starting point"
        ariaLabel="From (starting stop)"
        icon={<span className="own-dot-start" />}
        invalid={Boolean(stopErr(errors, 0))}
      />
      <button type="button" className="own-swap" onClick={swap} aria-label="Swap starting point and destination" title="Swap">
        <ArrowUpDown size={17} />
      </button>
      <StopField
        label="To"
        value={rows[last]?.stop}
        onChange={(s) => setStop(last, s)}
        placeholder="Select destination"
        ariaLabel="To (last stop)"
        icon={<MapPin size={18} className="text-accent" />}
        invalid={Boolean(stopErr(errors, last))}
      />
    </div>
  )
}

/** "06:40 AM → 07:25 AM · 45m · 28 km" when the timetable is complete. */
export function JourneySummary({ rows }) {
  if (rows.length < 2) return null
  const first = rows[0]
  const end = rows[rows.length - 1]
  if (!first.departureTime || !end.arrivalTime) return null
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const mins = toMin(end.arrivalTime) - toMin(first.departureTime)
  if (mins <= 0) return null
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`
  const km = Number(end.distanceKm)
  return (
    <div className="own-journey">
      <span className="fw-600">{to12h(first.departureTime)}</span>
      <span className="own-journey-line" aria-hidden="true" />
      <span className="own-journey-mid">
        {dur}
        {km > 0 ? ` · ${km} km` : ''} · {rows.length} stops
      </span>
      <span className="own-journey-line" aria-hidden="true" />
      <span className="fw-600">{to12h(end.arrivalTime)}</span>
    </div>
  )
}
