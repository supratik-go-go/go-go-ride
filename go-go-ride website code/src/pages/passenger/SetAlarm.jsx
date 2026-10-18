import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlarmClock,
  ArrowRight,
  Bell,
  BellRing,
  BusFront,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Info,
  MapPin,
  Snowflake,
  Star,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { Button, ErrorState, Skeleton, Spinner, useToast } from '../../components/ui'
import { openPicker, safeDate, toMinutes } from '../../components/passenger'
import { alarmService, busService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { busBadge, dateParts, formatDateLong, label, relativeDayLabel, to12h, todayISO } from '../../utils/format'
import './passenger.css'

const OPTIONS = [
  { value: 30, title: '30 minutes before', sub: 'Get notified well in advance', icon: AlarmClock },
  { value: 15, title: '15 minutes before', sub: 'Recommended', icon: AlarmClock, popular: true },
  { value: 5, title: '5 minutes before', sub: 'Get notified shortly before', icon: Timer },
  { value: 0, title: 'Bus arriving now', sub: 'Notify when bus is about to arrive', icon: BellRing },
]

const stopIdOf = (t) => t?.stop?.id ?? t?.stopId

function chipLabel(iso) {
  const rel = relativeDayLabel(iso)
  const { day, month, weekday } = dateParts(iso)
  return `${rel === 'Today' || rel === 'Tomorrow' ? rel : weekday}, ${day} ${month}`
}

function routeNameOf(bus) {
  if (bus?.route?.name) return bus.route.name
  const tt = bus?.timetable ?? []
  return tt.length > 1 ? `${tt[0].stop?.name} - ${tt[tt.length - 1].stop?.name}` : bus?.busName || ''
}

function askNotificationPermission() {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'default') {
      const result = window.Notification.requestPermission()
      result?.catch?.(() => {})
    }
  } catch {
    /* permission prompts are best-effort */
  }
}

export default function SetAlarm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [date, setDate] = useState(() => safeDate(params.get('date')))
  const [boardingId, setBoardingId] = useState(params.get('from') || '')
  const [arrivalId, setArrivalId] = useState(params.get('to') || '')
  const [remind, setRemind] = useState(15)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)

  const q = useAsync(() => busService.get(id, date), [id, date])
  const bus = q.data
  const timetable = useMemo(() => bus?.timetable ?? [], [bus])
  const ids = useMemo(() => timetable.map(stopIdOf), [timetable])

  // Snap the stop pickers onto the timetable once it loads.
  useEffect(() => {
    if (ids.length < 2) return
    let b = ids.indexOf(boardingId)
    if (b < 0 || b >= ids.length - 1) b = 0
    let a = ids.indexOf(arrivalId)
    if (a <= b) a = ids.length - 1
    setBoardingId(ids[b])
    setArrivalId(ids[a])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id, ids.length])

  const bIdx = ids.indexOf(boardingId)
  const boarding = timetable[bIdx]
  const arrival = timetable[ids.indexOf(arrivalId)]
  const availability = bus?.availability
  const notRunning = availability && availability.isRunning === false && availability.date === date

  // Reminder time already gone for today?
  const notifyMin = boarding ? toMinutes(boarding.arrivalTime) - remind : null
  const now = new Date()
  const passed = date === todayISO() && notifyMin != null && notifyMin < now.getHours() * 60 + now.getMinutes()

  const backToBus = `/bus/${id}?${new URLSearchParams({ date, ...(boardingId ? { from: boardingId } : {}), ...(arrivalId ? { to: arrivalId } : {}) })}`

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(backToBus))

  const changeBoarding = (value) => {
    setBoardingId(value)
    setError(null)
    const nb = ids.indexOf(value)
    if (ids.indexOf(arrivalId) <= nb) setArrivalId(ids[ids.length - 1])
  }

  const save = async () => {
    setError(null)
    if (!boardingId || !arrivalId) {
      setError({ message: 'Choose your boarding and arrival stops.' })
      return
    }
    askNotificationPermission()
    setSaving(true)
    try {
      const alarm = await alarmService.create({ busId: id, boardingStopId: boardingId, arrivalStopId: arrivalId, date, remindBeforeMin: remind })
      setSaved(alarm)
      toast.success(`We'll remind you at ${alarm?.notifyAt12h ?? 'the selected time'}.`, 'Alarm saved')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- success
  if (saved) {
    const opt = OPTIONS.find((o) => o.value === saved.remindBeforeMin) || OPTIONS[1]
    return (
      <div className="px-page px-alarm px-narrow">
        <AlarmHeader onBack={() => navigate(backToBus)} title="Alarm Saved" subtitle="We'll take it from here" />
        <div className="px-alarm-sheet">
          <section className="card px-alarm-done" role="status">
            <span className="px-done-icon">
              <BellRing size={34} />
            </span>
            <h2>Alarm set!</h2>
            <p className="text-2">
              We&apos;ll remind you at <strong className="text-accent">{saved.notifyAt12h}</strong>
              {saved.remindBeforeMin > 0 ? `, ${saved.remindBeforeMin} minutes before your bus arrives.` : ', when your bus is about to arrive.'}
            </p>
            <dl className="px-done-list">
              <div>
                <dt>Bus</dt>
                <dd>
                  <span className="route-badge" style={{ fontSize: 13, padding: '2px 10px' }}>
                    {busBadge(saved.bus || bus)}
                  </span>{' '}
                  {routeNameOf(bus)}
                </dd>
              </div>
              <div>
                <dt>Trip</dt>
                <dd>
                  {saved.boardingStop?.name || boarding?.stop?.name} <ArrowRight size={13} style={{ verticalAlign: -2 }} /> {saved.arrivalStop?.name || arrival?.stop?.name}
                </dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDateLong(saved.alarmDate || date)}</dd>
              </div>
              <div>
                <dt>Expected arrival</dt>
                <dd>{saved.expectedArrival12h}</dd>
              </div>
              <div>
                <dt>Reminder</dt>
                <dd>{opt.title}</dd>
              </div>
            </dl>
            {saved.notifyAt && date === todayISO() && toMinutes(saved.notifyAt) < now.getHours() * 60 + now.getMinutes() && (
              <div className="alert alert-warning" style={{ textAlign: 'left' }}>
                <TriangleAlert size={18} />
                <span>The reminder time has already passed for today, so this alarm may not ring.</span>
              </div>
            )}
            <div className="px-done-actions">
              <Button to="/alarms" icon={<Bell size={18} />}>
                My Alarms
              </Button>
              <Button to={backToBus} variant="outline" icon={<BusFront size={18} />}>
                Back to bus
              </Button>
            </div>
          </section>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- loading / error
  if (q.loading && !bus) {
    return (
      <div className="px-page px-alarm px-narrow" aria-busy="true">
        <AlarmHeader onBack={goBack} />
        <div className="px-alarm-sheet stack" style={{ '--gap': '14px' }}>
          <Skeleton height={110} radius={16} />
          <Skeleton height={90} radius={16} />
          <Skeleton height={96} radius={16} />
          <Skeleton height={220} radius={16} />
        </div>
      </div>
    )
  }
  if (q.error && !bus) {
    return (
      <div className="px-page px-alarm px-narrow">
        <AlarmHeader onBack={goBack} />
        <div className="px-alarm-sheet">
          <ErrorState error={q.error} title={q.error.status === 404 ? 'Bus not found' : undefined} onRetry={() => q.reload()} />
        </div>
      </div>
    )
  }

  const tooShort = ids.length < 2

  // ---------------------------------------------------------------- form
  return (
    <div className="px-page px-alarm px-narrow">
      <AlarmHeader onBack={goBack} />

      <div className="px-alarm-sheet stack" style={{ '--gap': '14px' }}>
        {/* bus */}
        <section className="card px-alarm-bus">
          <span className="px-alarm-bus-icon" aria-hidden="true">
            <BusFront size={38} />
          </span>
          <div style={{ minWidth: 0 }}>
            <span className="text-sm text-muted">Bus Number</span>
            <div className="row wrap" style={{ '--gap': '10px' }}>
              <span className="px-alarm-badge">{busBadge(bus)}</span>
              <span className="px-type-chip">
                <Snowflake size={15} /> {label('busType', bus.type)}
              </span>
            </div>
            <div className="fw-600 px-alarm-route">{routeNameOf(bus)}</div>
          </div>
        </section>

        {tooShort ? (
          <div className="alert alert-warning">
            <Info size={18} />
            <span>This bus has no published timetable yet, so an alarm can&apos;t be set.</span>
          </div>
        ) : (
          <>
            {/* stops */}
            <section className="card px-alarm-stops" aria-label="Your trip">
              <div className="px-stop-pick">
                <span className="px-stop-pin board" aria-hidden="true">
                  <MapPin size={22} fill="currentColor" stroke="#fff" strokeWidth={1.6} />
                </span>
                <div className="px-stop-pick-text">
                  <label htmlFor="px-board" className="text-sm text-muted">
                    Boarding Stop
                  </label>
                  <select id="px-board" className="px-stop-select" value={boardingId} onChange={(e) => changeBoarding(e.target.value)}>
                    {timetable.slice(0, -1).map((t) => (
                      <option key={stopIdOf(t)} value={stopIdOf(t)}>
                        {t.stop?.name} · {t.arrivalTime12h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="px-stops-arrow" aria-hidden="true">
                <ArrowRight size={20} />
              </span>
              <div className="px-stop-pick">
                <span className="px-stop-pin drop" aria-hidden="true">
                  <MapPin size={22} fill="currentColor" stroke="#fff" strokeWidth={1.6} />
                </span>
                <div className="px-stop-pick-text">
                  <label htmlFor="px-drop" className="text-sm text-muted">
                    Arrival Stop
                  </label>
                  <select
                    id="px-drop"
                    className="px-stop-select"
                    value={arrivalId}
                    onChange={(e) => {
                      setArrivalId(e.target.value)
                      setError(null)
                    }}
                  >
                    {timetable.slice(Math.max(bIdx, 0) + 1).map((t) => (
                      <option key={stopIdOf(t)} value={stopIdOf(t)}>
                        {t.stop?.name} · {t.arrivalTime12h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* expected arrival */}
            <section className="px-eta">
              <span className="px-eta-icon" aria-hidden="true">
                <Clock size={30} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <span className="text-sm text-muted">Expected Arrival Time</span>
                <div className="px-eta-time">{boarding?.arrivalTime12h || '--:--'}</div>
                {boarding && <span className="text-xs text-muted">at {boarding.stop?.name}</span>}
              </div>
              <label className="px-date-chip">
                {q.loading ? <Spinner size={15} /> : <CalendarDays size={16} />}
                <span>{chipLabel(date)}</span>
                <input
                  type="date"
                  className="px-overlay-input"
                  min={todayISO()}
                  value={date}
                  onChange={(e) => {
                    if (!e.target.value) return
                    setDate(safeDate(e.target.value))
                    setError(null)
                  }}
                  onClick={(e) => openPicker(e.currentTarget)}
                  aria-label={`Travel date, ${formatDateLong(date)}`}
                />
              </label>
            </section>

            {notRunning && (
              <div className="alert alert-danger" role="alert">
                <CircleAlert size={18} />
                <span>
                  This bus is not running on {formatDateLong(date)}. {availability.reason ? `${availability.reason}.`.replace(/\.\.$/, '.') : ''} Pick another date.
                </span>
              </div>
            )}

            {/* remind me */}
            <section aria-labelledby="px-remind-title" className="stack" style={{ '--gap': '12px' }}>
              <div className="row" style={{ '--gap': '14px' }}>
                <span className="px-remind-icon" aria-hidden="true">
                  <Bell size={24} />
                </span>
                <div>
                  <h2 id="px-remind-title" className="px-remind-title">
                    Remind Me
                  </h2>
                  <p className="text-sm text-muted">Choose when you want to be notified</p>
                </div>
              </div>
              <div className="px-remind-grid" role="radiogroup" aria-labelledby="px-remind-title">
                {OPTIONS.map(({ value, title, sub, icon: Icon, popular }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={remind === value}
                    className={`px-remind-opt ${remind === value ? 'active' : ''}`}
                    onClick={() => setRemind(value)}
                  >
                    {popular && (
                      <span className="px-ribbon">
                        <Star size={11} fill="currentColor" /> Most Popular
                      </span>
                    )}
                    <span className="px-radio" aria-hidden="true" />
                    <span className="px-remind-text">
                      <span className="px-remind-name">{title}</span>
                      <span className="px-remind-sub">{sub}</span>
                    </span>
                    <span className="px-remind-badge" aria-hidden="true">
                      <Icon size={22} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {passed && !notRunning && (
              <div className="alert alert-warning" role="note">
                <TriangleAlert size={18} />
                <span>
                  The reminder time ({to12h(`${String(Math.floor(Math.max(notifyMin, 0) / 60)).padStart(2, '0')}:${String(Math.max(notifyMin, 0) % 60).padStart(2, '0')}`)}) has already passed today. Consider picking a later date.
                </span>
              </div>
            )}

            <div className="px-amber-note">
              <span className="px-amber-icon" aria-hidden="true">
                <Info size={18} />
              </span>
              <p>You will receive a notification at the selected time, so you never miss your bus.</p>
            </div>

            {error && (
              <div className="alert alert-danger" role="alert">
                <CircleAlert size={18} />
                <div>
                  <div>{error.message}</div>
                  {error.code === 'CONFLICT' && (
                    <Link to="/alarms" className="fw-600">
                      View my alarms
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="stack" style={{ '--gap': '10px' }}>
              <Button
                variant="accent"
                size="lg"
                block
                icon={<Bell size={20} />}
                iconRight={<ChevronRight size={20} className="px-save-chev" />}
                onClick={save}
                loading={saving}
                disabled={notRunning || q.loading}
                className="px-save-btn"
              >
                Save Alarm
              </Button>
              <Button variant="outline" size="lg" block onClick={goBack} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AlarmHeader({ onBack, title = 'Set Alarm', subtitle = 'Get notified before your bus arrives' }) {
  return (
    <header className="px-alarm-header">
      <button type="button" className="px-alarm-back" onClick={onBack} aria-label="Go back">
        <ChevronLeft size={24} />
      </button>
      <div className="px-alarm-heading">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <span className="px-alarm-bell" aria-hidden="true">
        <BellRing size={26} />
      </span>
    </header>
  )
}
