import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Crosshair, MapPin, Search } from 'lucide-react'
import { stopService } from '../../services/networkService'
import { locationService } from '../../services/locationService'
import { useDebounce } from '../../hooks/useDebounce'
import { useToast } from '../../context/ToastContext'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/LoadingSpinner'

/**
 * Bus-stop autocomplete backed by GET /stops?search=.
 * `value` is { id, name } | null; typing clears the id until a suggestion is picked
 * (the search API also accepts a free-text name, so an unpicked name still works).
 */
export function StopInput({ value, onChange, placeholder = 'Enter stop', label, icon, autoFocus, className = '', onLocate }) {
  const [text, setText] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const debounced = useDebounce(text, 200)
  const boxRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    setText(value?.name ?? '')
  }, [value?.id, value?.name])

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    setLoading(true)
    stopService
      .search(debounced.trim(), 8)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [debounced, open])

  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (stop) => {
    onChange?.({ id: stop.id, name: stop.name, area: stop.area, latitude: stop.latitude, longitude: stop.longitude })
    setText(stop.name)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={`stop-input ${className}`} ref={boxRef}>
      {label && <span className="stop-input-label">{label}</span>}
      <div className="row" style={{ '--gap': '8px' }}>
        {icon}
        <input
          className="stop-input-field"
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(-1)
            onChange?.(e.target.value ? { id: null, name: e.target.value } : null)
          }}
          onKeyDown={onKeyDown}
        />
        {onLocate && (
          <button type="button" className="icon-btn" onClick={onLocate} aria-label="Use my location" title="Use my location">
            <Crosshair size={19} />
          </button>
        )}
      </div>
      {open && (
        <ul className="stop-suggest" id={listId} role="listbox">
          {loading && !items.length && (
            <li className="stop-suggest-empty">
              <Spinner size={16} /> Searching…
            </li>
          )}
          {!loading && !items.length && <li className="stop-suggest-empty">No stops match “{text}”</li>}
          {items.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={`stop-suggest-item ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
            >
              <MapPin size={16} className="text-muted" />
              <span className="grow">
                <span className="fw-500">{s.name}</span>
                {s.area && <span className="text-xs text-muted"> · {s.area}</span>}
              </span>
              {s.busesAvailable > 0 && <span className="text-xs text-muted nowrap">{s.busesAvailable} buses</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * From / To search bar with swap button (landing page + desktop).
 * Navigates to /search?from=&to=&fromId=&toId=&date=
 */
export function SearchBar({ initialFrom = null, initialTo = null, date, compact }) {
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [locating, setLocating] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  const locate = async () => {
    setLocating(true)
    try {
      const pos = await locationService.getCurrentPosition()
      const stops = await stopService.nearby(pos.lat, pos.lng, 5, 1)
      if (stops?.[0]) setFrom({ id: stops[0].id, name: stops[0].name })
      else toast.info('No bus stop found within 5 km of you.')
    } catch (err) {
      toast.error(err)
    } finally {
      setLocating(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (!from?.name || !to?.name) {
      toast.warning('Enter both a starting point and a destination.')
      return
    }
    const q = new URLSearchParams({ from: from.name, to: to.name })
    if (from.id) q.set('fromId', from.id)
    if (to.id) q.set('toId', to.id)
    if (date) q.set('date', date)
    navigate(`/search?${q}`)
  }

  return (
    <form className={`search-bar card ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="search-bar-fields">
        <StopInput
          label="From"
          value={from}
          onChange={setFrom}
          placeholder="Enter starting point"
          icon={<span className="search-dot from" />}
          onLocate={locating ? undefined : locate}
        />
        <div className="search-bar-sep">
          <button type="button" className="swap-btn" onClick={swap} aria-label="Swap from and to">
            {locating ? <Spinner size={16} /> : <ArrowUpDown size={17} />}
          </button>
        </div>
        <StopInput label="To" value={to} onChange={setTo} placeholder="Enter destination" icon={<MapPin size={18} className="text-accent" />} />
      </div>
      <Button type="submit" size="lg" icon={<Search size={20} />} className="search-bar-btn">
        Search Buses
      </Button>
    </form>
  )
}
