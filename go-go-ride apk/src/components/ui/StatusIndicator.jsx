import { AlertCircle, CheckCircle2, Clock, Navigation } from 'lucide-react'

const TONES = {
  running: { color: 'var(--success)', bg: 'var(--success-50)', icon: Navigation, pulse: true },
  waiting: { color: 'var(--warning)', bg: 'var(--warning-50)', icon: Clock },
  stopped: { color: 'var(--danger)', bg: 'var(--danger-50)', icon: AlertCircle },
  done: { color: 'var(--muted)', bg: '#eef0f5', icon: CheckCircle2 },
  info: { color: 'var(--info)', bg: 'var(--info-50)', icon: Clock },
}

/** Live-ish status pill: <StatusIndicator tone="running" label="On the way" /> */
export function StatusIndicator({ tone = 'info', label, compact }) {
  const t = TONES[tone] || TONES.info
  const Icon = t.icon
  return (
    <span
      className="badge"
      style={{ background: t.bg, color: t.color, padding: compact ? '2px 8px' : undefined }}
      role="status"
    >
      {t.pulse ? <span className="dot dot-pulse" /> : <Icon size={13} />}
      {label}
    </span>
  )
}

/** Map a trackingService.estimate() status to an indicator. */
export function TrackingStatus({ status, label }) {
  const map = {
    MOVING: ['running', 'On the way'],
    AT_STOP: ['waiting', 'At stop'],
    NOT_STARTED: ['info', 'Not started'],
    COMPLETED: ['done', 'Trip completed'],
    NOT_RUNNING: ['stopped', 'Not running'],
    NO_DATA: ['done', 'No timetable'],
  }
  const [tone, text] = map[status] || ['info', status]
  return <StatusIndicator tone={tone} label={label || text} />
}
