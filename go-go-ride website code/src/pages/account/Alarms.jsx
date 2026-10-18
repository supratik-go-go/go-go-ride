import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlarmClock, AlarmClockOff, ArrowRight, BellRing, CalendarDays, Info, Plus, Search, Trash2, XCircle } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  RouteBadge,
  SkeletonList,
  Spinner,
  StatusBadge,
  Tabs,
  useToast,
} from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { alarmService } from '../../services'
import { busBadge, formatDate, formatDateTime, relativeDayLabel } from '../../utils/format'
import { AccountPage } from './accountShared'

const LEADS = [
  { value: 30, label: '30 min' },
  { value: 15, label: '15 min' },
  { value: 5, label: '5 min' },
  { value: 0, label: 'Arriving' },
]

const dateOf = (a) => String(a.alarmDate || '').slice(0, 10)

function reminderText(a) {
  if (a.status === 'TRIGGERED') return a.notifiedAt ? `Reminded you at ${formatDateTime(a.notifiedAt).split(', ')[1]}` : 'Reminder sent'
  if (a.status === 'CANCELLED') return 'Cancelled - no reminder will be sent'
  if (a.status === 'EXPIRED') return 'Expired - the trip date has passed'
  if (!a.remindBeforeMin) return 'Reminds you when the bus is arriving'
  return `Reminds you ${a.remindBeforeMin} min before${a.notifyAt12h ? ` · at ${a.notifyAt12h}` : ''}`
}

function AlarmCard({ alarm: a, saving, onLead, onCancel, onDelete }) {
  const active = a.status === 'ACTIVE'
  const bus = a.bus
  const date = dateOf(a)
  const rel = relativeDayLabel(date)
  return (
    <article className={`card acc-alarm ${active ? '' : 'past'}`}>
      <header className="acc-alarm-head">
        <RouteBadge muted={!active}>{busBadge(bus) || '-'}</RouteBadge>
        <div className="grow" style={{ minWidth: 0 }}>
          <strong className="truncate" style={{ display: 'block' }}>
            {bus?.busName || bus?.busNumber || 'Bus no longer listed'}
          </strong>
          <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
            {[bus?.route?.name, bus?.busNumber].filter(Boolean).join(' · ')}
          </span>
        </div>
        {active ? (
          <Badge tone="success" square>
            <span className="dot" /> Active
          </Badge>
        ) : (
          <StatusBadge value={a.status} group="alarmStatus" />
        )}
      </header>

      <div className="acc-stops">
        <div className="acc-stop from">
          <span className="acc-stop-text">
            <small>Boarding at</small>
            <strong className="truncate">{a.boardingStop?.name || '-'}</strong>
          </span>
          <span className="acc-stop-time" title="Expected arrival at your boarding stop">
            {a.expectedArrival12h}
          </span>
        </div>
        <div className="acc-stop to">
          <span className="acc-stop-text">
            <small>Getting off at</small>
            <strong className="truncate">{a.arrivalStop?.name || '-'}</strong>
          </span>
        </div>
      </div>

      <div className="acc-alarm-info">
        <span>
          <CalendarDays size={15} />
          {['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${rel}, ` : ''}
          {formatDate(date)}
        </span>
        <span>
          <BellRing size={15} /> {reminderText(a)}
        </span>
      </div>

      {active && (
        <div className="acc-lead">
          <span className="text-sm fw-500 row" style={{ '--gap': '6px' }}>
            {saving ? <Spinner size={14} /> : <AlarmClock size={15} />} Remind me
          </span>
          <div className="segmented" role="radiogroup" aria-label="Reminder lead time">
            {LEADS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={a.remindBeforeMin === l.value}
                className={a.remindBeforeMin === l.value ? 'active' : ''}
                disabled={saving}
                onClick={() => a.remindBeforeMin !== l.value && onLead(a, l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="acc-card-actions">
        {bus ? (
          <Link to={`/bus/${a.busId}`} className="link-btn">
            View bus <ArrowRight size={15} />
          </Link>
        ) : (
          <span />
        )}
        <div className="row">
          {active && (
            <Button variant="ghost" size="sm" icon={<XCircle size={16} />} onClick={() => onCancel(a)}>
              Cancel
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<Trash2 size={16} />} onClick={() => onDelete(a)} style={{ '--btn-fg': 'var(--danger)' }} aria-label="Delete alarm">
            Delete
          </Button>
        </div>
      </footer>
    </article>
  )
}

export default function Alarms() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'past' ? 'past' : 'active'
  const navigate = useNavigate()
  const toast = useToast()
  const q = useAsync(() => alarmService.list({ limit: 100 }), [])
  const [savingId, setSavingId] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'cancel'|'delete', alarm }

  const all = useMemo(() => q.data?.data || [], [q.data])
  const active = all.filter((a) => a.status === 'ACTIVE')
  const past = all
    .filter((a) => a.status !== 'ACTIVE')
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.expectedArrival).localeCompare(String(a.expectedArrival)))
  const shown = tab === 'active' ? active : past

  const replace = (updated) => q.setData((d) => ({ ...d, data: d.data.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) }))

  const changeLead = async (alarm, minutes) => {
    const before = alarm.remindBeforeMin
    replace({ id: alarm.id, remindBeforeMin: minutes })
    setSavingId(alarm.id)
    try {
      const updated = await alarmService.update(alarm.id, { remindBeforeMin: minutes })
      if (updated) replace(updated)
      toast.success(minutes ? `We'll remind you ${minutes} min before the bus arrives` : "We'll remind you when the bus is arriving")
    } catch (err) {
      replace({ id: alarm.id, remindBeforeMin: before })
      toast.error(err)
    } finally {
      setSavingId(null)
    }
  }

  const runConfirm = async () => {
    const { kind, alarm } = confirm
    try {
      if (kind === 'cancel') {
        const updated = await alarmService.cancel(alarm.id)
        replace(updated || { id: alarm.id, status: 'CANCELLED' })
        toast.success('Alarm cancelled')
      } else {
        await alarmService.remove(alarm.id)
        q.setData((d) => ({ ...d, data: d.data.filter((x) => x.id !== alarm.id), meta: d.meta ? { ...d.meta, total: d.meta.total - 1 } : d.meta }))
        toast.success('Alarm deleted')
      }
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const setTab = (v) => setParams(v === 'past' ? { tab: 'past' } : {}, { replace: true })

  return (
    <AccountPage
      title="My Alarms"
      actions={
        <IconButton label="Set a new alarm" onClick={() => navigate('/search')}>
          <Plus size={22} />
        </IconButton>
      }
    >
      <Tabs
        className="acc-tabs"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'active', label: 'Active', count: q.data ? active.length : undefined },
          { value: 'past', label: 'Past', count: q.data ? past.length : undefined },
        ]}
      />

      {q.loading && !q.data ? (
        <SkeletonList count={3} height={230} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !shown.length ? (
        tab === 'active' ? (
          <EmptyState
            icon={<AlarmClock size={26} />}
            title="No active alarms"
            message="Find your bus, pick where you board and get off, and we'll remind you before it arrives."
            action={
              <Button to="/search" icon={<Search size={17} />}>
                Find a bus
              </Button>
            }
          />
        ) : (
          <EmptyState icon={<AlarmClockOff size={26} />} title="No past alarms" message="Alarms that have rung, expired or been cancelled are kept here." />
        )
      ) : (
        <div className="acc-list">
          {shown.map((a) => (
            <AlarmCard
              key={a.id}
              alarm={a}
              saving={savingId === a.id}
              onLead={changeLead}
              onCancel={(alarm) => setConfirm({ kind: 'cancel', alarm })}
              onDelete={(alarm) => setConfirm({ kind: 'delete', alarm })}
            />
          ))}
          {q.data?.meta?.totalPages > 1 && (
            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
              Showing your {all.length} most recent alarms.
            </p>
          )}
        </div>
      )}

      {tab === 'active' && (
        <div className="soft-panel acc-muted-note">
          <Info size={17} />
          <span>
            Reminder times are worked out from the bus timetable at your boarding stop. Reminders arrive in your <Link to="/notifications">notifications</Link> - turn on
            browser alerts in <Link to="/settings">Settings</Link> so you don&apos;t miss them.
          </span>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.kind === 'cancel' ? 'Cancel this alarm?' : 'Delete this alarm?'}
        message={
          confirm?.kind === 'cancel'
            ? `You won't be reminded about ${busBadge(confirm.alarm.bus) || 'this bus'} at ${confirm.alarm.boardingStop?.name || 'your stop'}. The alarm moves to Past.`
            : 'This removes the alarm from your list permanently.'
        }
        confirmLabel={confirm?.kind === 'cancel' ? 'Cancel alarm' : 'Delete'}
      />
    </AccountPage>
  )
}
