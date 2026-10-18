import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpDown,
  BusFront,
  CalendarDays,
  CirclePlus,
  Info,
  Lightbulb,
  MapPin,
  MapPinOff,
  Pencil,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { StopInput } from '../../components/navigation/SearchBar'
import { Button, EmptyState, ErrorState, IconButton, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { BusResultCard, DateStrip, openPicker, safeDate } from '../../components/passenger'
import { busService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { LABELS, addDays, formatCurrency, formatDate, formatDateLong, relativeDayLabel, to12h, todayISO } from '../../utils/format'
import './passenger.css'

const SEARCH_TYPES = ['ROUTE', 'BUS_NUMBER', 'BUS_NAME']
const SORTS = [
  { value: 'departure', label: 'Departure' },
  { value: 'fare', label: 'Fare' },
  { value: 'duration', label: 'Duration' },
  { value: 'rating', label: 'Rating' },
]
const pad = (n) => String(n).padStart(2, '0')
const TIME_OPTIONS = Array.from({ length: 20 }, (_, i) => `${pad(i + 4)}:00`)

function dateLine(iso) {
  const rel = relativeDayLabel(iso)
  const prefix = rel === 'Today' || rel === 'Tomorrow' ? rel : formatDateLong(iso).split(',')[0]
  return `${prefix}, ${formatDate(iso)}`
}

export default function SearchResults() {
  const [params, setParams] = useSearchParams()
  const topRef = useRef(null)
  const stripRef = useRef(null)
  const dateInputRef = useRef(null)

  const date = safeDate(params.get('date'))
  const q = (params.get('q') || '').trim()
  const rawType = params.get('searchType')
  const searchType = SEARCH_TYPES.includes(rawType) ? rawType : q && !params.get('from') ? 'BUS_NUMBER' : 'ROUTE'
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const fromId = params.get('fromId') || ''
  const toId = params.get('toId') || ''
  const time = params.get('time') || ''
  const type = params.get('type') || ''
  const category = params.get('category') || ''
  const maxFare = params.get('maxFare') || ''
  const sort = params.get('sort') || 'departure'

  const apiParams = useMemo(() => {
    const p = { date, sort }
    if (time) p.time = time
    if (type) p.type = type
    if (category) p.category = category
    if (maxFare) p.maxFare = maxFare
    if (searchType === 'ROUTE') {
      p.searchType = 'ROUTE'
      if (fromId) p.fromStopId = fromId
      else if (from) p.from = from
      if (toId) p.toStopId = toId
      else if (to) p.to = to
    } else {
      p.searchType = searchType
      p.q = q
    }
    return p
  }, [date, sort, time, type, category, maxFare, searchType, fromId, from, toId, to, q])

  const apiKey = JSON.stringify(apiParams)
  const res = useAsync(() => busService.search(apiParams), [apiKey])

  /** Patch the URL query (replace keeps the back button pointing at the previous page). */
  const update = (patch, { push = false } = {}) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: !push })
  }

  const setDate = (iso) => update({ date: iso })

  const buses = res.data?.buses ?? []
  const running = buses.filter((b) => b.isRunning !== false).length
  const notRunning = buses.length - running

  const fromName = res.data?.from?.name || from
  const toName = res.data?.to?.name || to
  const title =
    searchType === 'ROUTE' ? (
      <>
        <span>{fromName || 'Any stop'}</span>
        <ArrowRight size={22} className="text-accent" style={{ flexShrink: 0 }} />
        <span>{toName || 'Any stop'}</span>
      </>
    ) : (
      <span>
        {searchType === 'BUS_NUMBER' ? 'Bus No.' : 'Bus'} “{q}”
      </span>
    )

  // ---------------------------------------------------------------- filters
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilters = [
    type && { key: 'type', label: LABELS.busType[type] || type },
    category && { key: 'category', label: LABELS.busCategory[category] || category },
    maxFare && { key: 'maxFare', label: `Max ${formatCurrency(Number(maxFare))}` },
    time && { key: 'time', label: `After ${to12h(time)}` },
    sort !== 'departure' && { key: 'sort', label: `Sorted by ${sort}` },
  ].filter(Boolean)

  const clearFilters = () => update({ type: null, category: null, maxFare: null, time: null, sort: null })

  const viewOthers = () => {
    if (activeFilters.length) clearFilters()
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const changeDate = () => {
    stripRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    openPicker(dateInputRef.current)
  }

  // ---------------------------------------------------------------- modify search
  const [modifyOpen, setModifyOpen] = useState(false)

  return (
    <div className="px-page px-results px-wide" ref={topRef}>
      <PageHeader
        title="Search Results"
        actions={
          <IconButton label="Filter and sort" badge={activeFilters.length || null} onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={22} />
          </IconButton>
        }
      />

      <section className="px-results-head">
        <div className="px-results-title">
          <h1>{title}</h1>
          <p className="text-muted">{dateLine(date)}</p>
          <button type="button" className="link-btn px-modify-btn" onClick={() => setModifyOpen((o) => !o)} aria-expanded={modifyOpen}>
            {modifyOpen ? <X size={14} /> : <Pencil size={14} />} {modifyOpen ? 'Close' : 'Modify search'}
          </button>
        </div>
        <div className="px-addbus">
          <Button variant="outline-accent" to="/owner/buses/new" icon={<CirclePlus size={20} />} className="px-addbus-btn">
            Add Bus
          </Button>
          <span className="text-xs text-muted">Add your preferred bus</span>
        </div>
      </section>

      {modifyOpen && (
        <ModifySearch
          initial={{ searchType, from: from ? { id: fromId || null, name: from } : null, to: to ? { id: toId || null, name: to } : null, q }}
          onCancel={() => setModifyOpen(false)}
          onSubmit={(patch) => {
            update(patch, { push: true })
            setModifyOpen(false)
          }}
        />
      )}

      <div ref={stripRef} className="px-strip-wrap">
        <DateStrip value={date} onChange={setDate} />
      </div>

      <div className="px-infobar" role="status">
        <Info size={20} className="px-infobar-icon" />
        <span className="grow">
          Schedules shown for <strong>{formatDateLong(date)}</strong>
        </span>
        <label className="px-infobar-change">
          Change Date <CalendarDays size={18} />
          <input
            ref={dateInputRef}
            type="date"
            className="px-overlay-input"
            min={todayISO()}
            value={date}
            onChange={(e) => e.target.value && setDate(safeDate(e.target.value))}
            onClick={(e) => openPicker(e.currentTarget)}
            aria-label="Change travel date"
          />
        </label>
      </div>

      {activeFilters.length > 0 && (
        <div className="px-chip-row" aria-label="Active filters">
          {activeFilters.map((f) => (
            <button key={f.key} type="button" className="chip active px-filter-chip" onClick={() => update({ [f.key]: null })} aria-label={`Remove filter ${f.label}`}>
              {f.label} <X size={14} />
            </button>
          ))}
          <button type="button" className="link-btn" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {/* ---------------------------------------------------------------- results */}
      {res.loading && !res.data ? (
        <div className="stack" aria-busy="true" aria-label="Loading buses">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card px-result" style={{ gap: 12 }}>
              <div className="row">
                <Skeleton width={48} height={48} radius={12} />
                <div className="grow stack" style={{ '--gap': '6px' }}>
                  <Skeleton width="30%" height={20} />
                  <Skeleton width="60%" height={13} />
                </div>
              </div>
              <Skeleton height={40} />
              <div className="row-between">
                <Skeleton width={130} height={34} radius={10} />
                <Skeleton width={130} height={40} radius={8} />
              </div>
            </div>
          ))}
        </div>
      ) : res.error && !res.data ? (
        res.error.status === 404 ? (
          <EmptyState
            icon={<MapPinOff size={26} />}
            title="We couldn't find that stop"
            message={`${res.error.message}. Check the spelling or pick a stop from the suggestions.`}
            action={
              <Button icon={<Pencil size={16} />} onClick={() => setModifyOpen(true)}>
                Modify search
              </Button>
            }
          />
        ) : (
          <ErrorState error={res.error} onRetry={() => res.reload()} />
        )
      ) : buses.length === 0 ? (
        <NoResults hasFilters={activeFilters.length > 0} onClear={clearFilters} onModify={() => setModifyOpen(true)} onNextDay={() => setDate(addDays(date, 1))} />
      ) : (
        <div className={`stack px-results-list ${res.loading ? 'is-refreshing' : ''}`} aria-busy={res.loading}>
          <div className="row-between px-results-count">
            <span className="text-sm text-2">
              <strong>{res.data.total ?? buses.length}</strong> {buses.length === 1 ? 'bus' : 'buses'} found
              {notRunning > 0 && <span className="text-muted"> · {notRunning} not running on this date</span>}
            </span>
            {res.loading && <Spinner size={16} className="text-primary" />}
          </div>
          {buses.map((bus) => (
            <BusResultCard key={bus.id} bus={bus} date={res.data.date || date} onChangeDate={changeDate} onViewOthers={viewOthers} />
          ))}
          <p className="text-xs text-muted px-results-foot">
            Timings are from the published timetable. Can&apos;t find your bus? <Link to="/routes">Browse all routes</Link> or{' '}
            <Link to="/owner/buses/new">add it</Link>.
          </p>
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={{ type, category, maxFare, time, sort }}
        onApply={(v) => {
          update({ type: v.type, category: v.category, maxFare: v.maxFare, time: v.time, sort: v.sort === 'departure' ? null : v.sort })
          setFiltersOpen(false)
        }}
      />
    </div>
  )
}

function NoResults({ hasFilters, onClear, onModify, onNextDay }) {
  return (
    <div className="card px-card-pad px-noresults">
      <EmptyState
        icon={<BusFront size={26} />}
        title="No buses found"
        message="We couldn't find a bus for this search on the selected date."
        action={
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={onClear}>
                Clear filters
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<Pencil size={15} />} onClick={onModify}>
              Modify search
            </Button>
            <Button size="sm" icon={<CalendarDays size={15} />} onClick={onNextDay}>
              Try next day
            </Button>
          </div>
        }
      />
      <div className="px-tips">
        <div className="row" style={{ '--gap': '8px' }}>
          <Lightbulb size={18} className="text-warning" />
          <span className="fw-600 text-sm">Search tips</span>
        </div>
        <ul>
          <li>Pick stops from the suggestions so we match the exact stop.</li>
          <li>Direction matters — a bus only appears if it reaches your boarding stop before your destination.</li>
          <li>Try a nearby or bigger stop (e.g. “Howrah Station” instead of a lane name).</li>
          <li>
            Not sure which bus? <Link to="/routes">Browse all routes</Link> or find <Link to="/stops">bus stops near you</Link>.
          </li>
        </ul>
      </div>
    </div>
  )
}

const MODE_OPTIONS = [
  { value: 'ROUTE', label: 'Route', icon: Route },
  { value: 'BUS_NUMBER', label: 'Bus Number', icon: BusFront },
  { value: 'BUS_NAME', label: 'Bus Name', icon: Search },
]

function ModifySearch({ initial, onSubmit, onCancel }) {
  const [mode, setMode] = useState(initial.searchType)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [q, setQ] = useState(initial.q)
  const [error, setError] = useState('')
  const qRef = useRef(null)

  useEffect(() => {
    if (mode !== 'ROUTE') qRef.current?.focus()
  }, [mode])

  const submit = (e) => {
    e.preventDefault()
    if (mode === 'ROUTE') {
      if (!from?.name?.trim() || !to?.name?.trim()) {
        setError('Enter both a starting point and a destination.')
        return
      }
      onSubmit({ searchType: 'ROUTE', from: from.name.trim(), to: to.name.trim(), fromId: from.id || null, toId: to.id || null, q: null })
    } else {
      if (!q.trim()) {
        setError(mode === 'BUS_NUMBER' ? 'Enter a bus number.' : 'Enter a bus name.')
        return
      }
      onSubmit({ searchType: mode, q: q.trim(), from: null, to: null, fromId: null, toId: null })
    }
  }

  return (
    <form className="card px-card-pad px-modify" onSubmit={submit} aria-label="Modify search">
      <div className="segmented px-modify-modes" role="radiogroup" aria-label="Search by">
        {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={mode === value ? 'active' : ''}
            onClick={() => {
              setMode(value)
              setError('')
            }}
          >
            <Icon size={15} style={{ verticalAlign: '-3px', marginRight: 4 }} />
            {label}
          </button>
        ))}
      </div>
      {mode === 'ROUTE' ? (
        <div className="px-search-stops">
          <StopInput
            label="From"
            value={from}
            onChange={(v) => {
              setFrom(v)
              setError('')
            }}
            placeholder="Enter starting point"
            icon={<MapPin size={22} className="px-pin-from" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
          />
          <div className="search-bar-sep px-search-sep">
            <button
              type="button"
              className="swap-btn"
              onClick={() => {
                setFrom(to)
                setTo(from)
              }}
              aria-label="Swap from and to"
            >
              <ArrowUpDown size={18} />
            </button>
          </div>
          <StopInput
            label="To"
            value={to}
            onChange={(v) => {
              setTo(v)
              setError('')
            }}
            placeholder="Enter destination"
            icon={<MapPin size={22} className="px-pin-to" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
          />
        </div>
      ) : (
        <div className="field">
          <label className="field-label" htmlFor="px-modify-q">
            {mode === 'BUS_NUMBER' ? 'Bus number' : 'Bus name'}
          </label>
          <input
            id="px-modify-q"
            ref={qRef}
            className="input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setError('')
            }}
            placeholder={mode === 'BUS_NUMBER' ? 'e.g. WB 01 AB 1234' : 'e.g. Howrah Express'}
            autoComplete="off"
          />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" icon={<Search size={18} />}>
          Search
        </Button>
      </div>
    </form>
  )
}

function FilterSheet({ open, onClose, value, onApply }) {
  const [draft, setDraft] = useState(value)
  const [fareError, setFareError] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(value)
      setFareError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  const apply = () => {
    if (draft.maxFare !== '' && draft.maxFare != null && (Number.isNaN(Number(draft.maxFare)) || Number(draft.maxFare) <= 0)) {
      setFareError('Enter a fare above ₹0, or leave it empty')
      return
    }
    onApply(draft)
  }

  const chips = (key, options) => (
    <div className="px-chip-row">
      {[{ value: '', label: 'All' }, ...options].map((o) => (
        <button key={o.value || 'all'} type="button" className={`chip ${draft[key] === o.value ? 'active' : ''}`} aria-pressed={draft[key] === o.value} onClick={() => set(key, o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter & sort"
      subtitle="Narrow down the buses for this trip"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => setDraft({ type: '', category: '', maxFare: '', time: '', sort: 'departure' })}>
            Reset
          </Button>
          <Button onClick={apply}>Show buses</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' }}>
        <div className="field">
          <span className="field-label">Bus type</span>
          {chips('type', Object.entries(LABELS.busType).map(([v, l]) => ({ value: v, label: l })))}
        </div>
        <div className="field">
          <span className="field-label">Category</span>
          {chips('category', Object.entries(LABELS.busCategory).map(([v, l]) => ({ value: v, label: l })))}
        </div>
        <div className="grid grid-2 keep-mobile" style={{ '--gap': '12px' }}>
          <div className="field">
            <label className="field-label" htmlFor="px-maxfare">
              Max fare (₹)
            </label>
            <input
              id="px-maxfare"
              className={`input ${fareError ? 'invalid' : ''}`}
              type="number"
              inputMode="numeric"
              min="1"
              placeholder="Any"
              value={draft.maxFare}
              onChange={(e) => {
                set('maxFare', e.target.value)
                setFareError('')
              }}
            />
            {fareError && <span className="field-error">{fareError}</span>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="px-after">
              Departs after
            </label>
            <select id="px-after" className="select" value={draft.time} onChange={(e) => set('time', e.target.value)}>
              <option value="">Any time</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {to12h(t)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Sort by</span>
          <div className="segmented px-sort" role="radiogroup" aria-label="Sort by">
            {SORTS.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={draft.sort === s.value} className={draft.sort === s.value ? 'active' : ''} onClick={() => set('sort', s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
