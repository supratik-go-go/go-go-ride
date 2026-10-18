import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { StopField } from './StopField'
import { newRouteStopRow } from './opsUtils'
import '../admin/admin-ui.css' // .adm-act buttons
import '../../pages/admin/admin-ops.css'

function Endpoint({ seq, stop, km, end, missing }) {
  return (
    <li className={`ops-rs-row endpoint ${end ? 'end' : ''}`}>
      <span className="ops-rs-seq" aria-hidden="true">
        {seq}
      </span>
      <span className="ops-rs-name">
        {stop?.id ? stop.name : <span className="text-muted">{missing}</span>}
        <small>{end ? 'Last stop (To)' : 'First stop (From)'}</small>
      </span>
      <span className="ops-rs-km-static">{km === '' || km == null ? '- km' : `${km} km`}</span>
      <span className="ops-rs-actions placeholder" aria-hidden="true" />
    </li>
  )
}

/**
 * Ordered stops of a route between the From and To stops.
 * `rows` = [{ key, stop: {id,name}|null, km: string }]; endpoints are shown
 * read-only (0 km and the route distance). `errors` maps row key -> message.
 */
export function RouteStopsEditor({ from, to, distanceKm, rows, onChange, errors = {} }) {
  const update = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key) => onChange(rows.filter((r) => r.key !== key))
  const move = (index, dir) => {
    const next = [...rows]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <ol className="ops-rs" aria-label="Stops in travel order">
        <Endpoint seq={1} stop={from} km={0} missing="Pick the From stop above" />
        {rows.map((r, i) => (
          <li key={r.key} className="ops-rs-row">
            <span className="ops-rs-seq" aria-hidden="true">
              {i + 2}
            </span>
            <StopField
              compact
              ariaLabel={`Stop ${i + 2}`}
              placeholder="Type a stop name"
              value={r.stop}
              onChange={(stop) => update(r.key, { stop })}
              invalid={Boolean(errors[r.key])}
            />
            <label className="ops-rs-km">
              <input
                className={`input ${errors[r.key] ? 'invalid' : ''}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="0.0"
                value={r.km}
                onChange={(e) => update(r.key, { km: e.target.value })}
                aria-label={`Distance from start for stop ${i + 2}, in kilometres`}
              />
              <span>km</span>
            </label>
            <span className="ops-rs-actions">
              <button type="button" className="adm-act" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move stop ${i + 2} up`} title="Move up">
                <ArrowUp size={15} />
              </button>
              <button type="button" className="adm-act" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move stop ${i + 2} down`} title="Move down">
                <ArrowDown size={15} />
              </button>
              <button type="button" className="adm-act danger" onClick={() => remove(r.key)} aria-label={`Remove stop ${i + 2}`} title="Remove">
                <Trash2 size={14} />
              </button>
            </span>
            {errors[r.key] && <span className="ops-rs-error">{errors[r.key]}</span>}
          </li>
        ))}
        <Endpoint seq={rows.length + 2} stop={to} km={distanceKm} end missing="Pick the To stop above" />
      </ol>
      {!rows.length && <div className="ops-rs-empty">No stops in between yet - add the stops buses halt at, in travel order.</div>}
      <div>
        <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => onChange([...rows, newRouteStopRow()])}>
          Add stop
        </Button>
      </div>
    </div>
  )
}

export default RouteStopsEditor
