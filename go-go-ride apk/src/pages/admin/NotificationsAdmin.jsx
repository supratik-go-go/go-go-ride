import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlarmClock,
  Bell,
  BellOff,
  CalendarCheck,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  History,
  Info,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { Avatar, Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, Pagination, SectionHeader, Select, Skeleton, TableToolbar } from '../../components/ui'
import { AdminTabs, DateTimeCell, activityMeta } from '../../components/admin'
import { ChoiceGroup, Counter, humanizeCode, plural } from '../../components/admin-ops'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { notifyUnreadChanged, useUnreadCount } from '../../hooks/useUnreadCount'
import { adminService, notificationService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatDateTime, formatNumber, formatPhone, label, timeAgo, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const TAB_KEYS = ['activity', 'broadcast', 'mine']

/** Same look as the passenger feed (src/pages/account/Notifications.jsx). */
const TYPE_UI = {
  SYSTEM: { icon: Megaphone, tone: '', text: 'Update' },
  USER: { icon: CalendarCheck, tone: 'success', text: 'For you' },
  PROMO: { icon: Sparkles, tone: 'accent', text: 'Offer' },
  ALARM: { icon: AlarmClock, tone: 'warning', text: 'Alarm' },
}
const typeUi = (type) => TYPE_UI[type] || { icon: Bell, tone: '', text: label('notificationType', type) }

const AUDIENCES = [
  { value: 'ALL', label: 'Everyone', short: 'everyone' },
  { value: 'PASSENGER', label: 'Passengers', short: 'passengers' },
  { value: 'BUS_OWNER', label: 'Bus owners', short: 'bus owners' },
  { value: 'DRIVER', label: 'Drivers', short: 'drivers' },
  { value: 'ADMIN', label: 'Admins', short: 'admins' },
  { value: 'SUPER_ADMIN', label: 'Super admins', short: 'super admins' },
]
const audienceOf = (v) => AUDIENCES.find((a) => a.value === v) || AUDIENCES[0]

const TYPE_OPTIONS = [
  { value: 'SYSTEM', label: 'System update', icon: Megaphone },
  { value: 'PROMO', label: 'Offer / promo', icon: Sparkles },
  { value: 'USER', label: 'Account notice', icon: CalendarCheck },
]

const isValidLink = (v) => !v || /^\/[^\s]*$/.test(v) || /^https?:\/\/[^\s]+$/i.test(v)

// ---------------------------------------------------------------- activity log

const ACTIVITY_CSV = [
  { header: 'Time', value: (a) => formatDateTime(a.createdAt) },
  { header: 'Action', value: 'action' },
  { header: 'Message', value: 'message' },
  { header: 'Entity Type', value: (a) => a.entityType || '' },
  { header: 'Entity ID', value: (a) => a.entityId || '' },
  { header: 'By', value: (a) => a.actor?.name || '' },
  { header: 'By (phone)', value: (a) => a.actor?.phone || '' },
]

function ActivityLog() {
  const toast = useToast()
  const list = usePagedQuery(adminService.activities, { limit: 15 })

  const columns = [
    {
      key: 'message',
      header: 'Activity',
      render: (a) => {
        const { Icon, tone } = activityMeta(a.action)
        return (
          <div className="ops-activity-cell">
            <span className={`adm-activity-icon tone-bg-${tone}`} aria-hidden="true">
              <Icon size={16} />
            </span>
            <div className="adm-cell" style={{ whiteSpace: 'normal' }}>
              <span className="fw-600 text-sm" style={{ overflowWrap: 'anywhere' }}>
                {a.message}
              </span>
              <span className="adm-cell-sub">{humanizeCode(a.action)}</span>
            </div>
          </div>
        )
      },
    },
    {
      key: 'entity',
      header: 'Record',
      render: (a) =>
        a.entityType ? (
          <div className="adm-cell">
            <span className="text-sm fw-500">{humanizeCode(a.entityType)}</span>
            {a.entityId && (
              <span className="adm-cell-sub" title={a.entityId}>
                <span className="ops-code">{a.entityId.length > 12 ? `…${a.entityId.slice(-8)}` : a.entityId}</span>
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      key: 'actor',
      header: 'By',
      render: (a) =>
        a.actor ? (
          <div className="adm-person">
            <Avatar src={a.actor.avatarUrl} name={a.actor.name} size={30} />
            <div className="adm-cell">
              <span className="adm-cell-main" style={{ fontWeight: 500 }}>
                {a.actor.name}
              </span>
              {(a.actor.phone || a.actor.email) && <span className="adm-cell-sub">{a.actor.phone ? formatPhone(a.actor.phone) : a.actor.email}</span>}
            </div>
          </div>
        ) : (
          <span className="text-muted">System</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'When',
      render: (a) => (
        <div className="adm-cell">
          <DateTimeCell value={a.createdAt} />
          <span className="adm-cell-sub">{timeAgo(a.createdAt)}</span>
        </div>
      ),
    },
  ]

  return (
    <section className="adm-card adm-table-card">
      <TableToolbar
        actions={
          <>
            <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={list.reload} loading={list.loading && Boolean(list.rows.length)}>
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={16} />}
              disabled={!list.rows.length}
              onClick={() => {
                exportCsv(`gogoride-activity-log-${todayISO()}.csv`, list.rows, ACTIVITY_CSV)
                toast.info(`Exported ${plural(list.rows.length, 'entry', 'entries')} from this page`)
              }}
            >
              Export
            </Button>
          </>
        }
      >
        <div className="stack" style={{ '--gap': '2px' }}>
          <span className="ops-section-title">Admin activity log</span>
          <span className="text-xs text-muted">{list.meta ? `${formatNumber(list.meta.total)} entries, newest first` : 'Newest first'}</span>
        </div>
      </TableToolbar>
      <div className="card-note">
        Records bus submissions and approvals, route changes, new user accounts and settings updates. GO-GO Ride doesn't keep an admin-wide history of notifications sent to users yet, so broadcasts don't
        appear here.
      </div>
      <DataTable
        columns={columns}
        rows={list.rows}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        meta={list.meta}
        onPageChange={list.setPage}
        noun="entries"
        empty={{ icon: <History size={24} />, title: 'No activity yet', message: 'Approvals, route changes and settings updates show up here.' }}
      />
    </section>
  )
}

// ---------------------------------------------------------------- broadcast

const EMPTY_BROADCAST = { title: '', message: '', type: 'SYSTEM', audience: 'ALL', link: '' }

function FeedItem({ title, message, type, link, broadcast, time = 'Just now', unread = true, className = '' }) {
  const ui = typeUi(type)
  return (
    <div className={`ops-notif ${unread ? 'unread' : ''} ${className}`}>
      <span className={`icon-tile ${ui.tone}`}>
        <ui.icon size={20} />
      </span>
      <div className="ops-notif-body">
        <div className="ops-notif-title">{title}</div>
        <div className="ops-notif-msg">{message}</div>
        <div className="ops-notif-meta">
          <span>{time}</span>
          <Badge tone="neutral" square>
            {broadcast ? 'Announcement' : ui.text}
          </Badge>
          {link && (
            <span className="row text-primary fw-500" style={{ '--gap': '2px' }}>
              View <ChevronRight size={13} />
            </span>
          )}
        </div>
      </div>
      {unread && <span className="ops-notif-dot" aria-hidden="true" />}
    </div>
  )
}

function Broadcast() {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_BROADCAST)
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(false)
  const audience = audienceOf(form.audience)
  const reach = useAsync(
    () => adminService.users({ ...(form.audience === 'ALL' ? {} : { role: form.audience }), status: 'ACTIVE', limit: 1 }).then((r) => r.meta?.total ?? 0),
    [form.audience],
  )
  const set = (k) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [k]: value }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }
  const dirty = form.title || form.message || form.link

  const review = (ev) => {
    ev.preventDefault()
    const e = {}
    if (form.title.trim().length < 2) e.title = 'Enter a title (at least 2 characters)'
    else if (form.title.trim().length > 120) e.title = 'Keep the title to 120 characters'
    if (form.message.trim().length < 2) e.message = 'Write the message (at least 2 characters)'
    else if (form.message.trim().length > 500) e.message = 'Keep the message to 500 characters'
    if (!isValidLink(form.link.trim())) e.link = 'Use an app path like /running-car or a full https:// link'
    setErrors(e)
    if (!Object.keys(e).length) setConfirming(true)
  }

  const send = async () => {
    const body = {
      title: form.title.trim(),
      message: form.message.trim(),
      type: form.type,
      audience: form.audience,
      ...(form.link.trim() ? { link: form.link.trim() } : {}),
    }
    try {
      const res = await notificationService.broadcast(body)
      toast.success(res?.recipients == null ? 'Announcement published to everyone' : `Sent to ${plural(res.recipients, audience.short.replace(/s$/, ''), audience.short)}`)
      setForm(EMPTY_BROADCAST)
      setErrors({})
      notifyUnreadChanged()
    } catch (err) {
      toast.error(err)
      if (err.fieldErrors && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors)
      else throw err // keep the dialog open to retry
    }
  }

  const reachText =
    reach.data == null
      ? null
      : form.audience === 'ALL'
        ? `Every signed-in user sees it (${formatNumber(reach.data)} active accounts today).`
        : `${plural(reach.data, 'active account')} with this role will get a copy.`

  return (
    <div className="ops-two-col">
      <section className="adm-card ops-panel">
        <div className="ops-panel-head">
          <div>
            <h2 className="ops-section-title" style={{ fontSize: 'var(--fs-md)' }}>
              Compose broadcast
            </h2>
            <p className="text-xs text-muted">Shows up in the bell feed of everyone in the audience, right away.</p>
          </div>
        </div>
        <form className="ops-form" onSubmit={review} noValidate>
          <div className="field">
            <div className="ops-legend">
              <label className="field-label" htmlFor="ops-bc-title">
                Title<span className="req">*</span>
              </label>
              <Counter value={form.title} max={120} />
            </div>
            <input id="ops-bc-title" className={`input ${errors.title ? 'invalid' : ''}`} value={form.title} onChange={set('title')} placeholder="e.g. New AC route S24 is live" maxLength={140} aria-invalid={Boolean(errors.title)} autoComplete="off" />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </div>
          <div className="field">
            <div className="ops-legend">
              <label className="field-label" htmlFor="ops-bc-msg">
                Message<span className="req">*</span>
              </label>
              <Counter value={form.message} max={500} />
            </div>
            <textarea id="ops-bc-msg" className={`textarea ${errors.message ? 'invalid' : ''}`} value={form.message} onChange={set('message')} placeholder="What should people know?" maxLength={600} aria-invalid={Boolean(errors.message)} />
            {errors.message && <span className="field-error">{errors.message}</span>}
          </div>
          <div className="field">
            <span className="field-label">Type</span>
            <ChoiceGroup ariaLabel="Notification type" tone="accent" options={TYPE_OPTIONS} value={form.type} onChange={set('type')} />
            {errors.type && <span className="field-error">{errors.type}</span>}
          </div>
          <div className="ops-form-grid">
            <Select label="Audience" required value={form.audience} onChange={set('audience')} options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} error={errors.audience} hint={reachText || (reach.loading ? 'Counting recipients…' : undefined)} />
            <Input label="In-app link" placeholder="/running-car" value={form.link} onChange={set('link')} error={errors.link} hint="Optional. Where tapping the notification goes." autoComplete="off" />
          </div>
          {form.audience === 'ALL' && (
            <div className="alert alert-info">
              <Info size={18} />
              <div>An "Everyone" announcement is a single shared copy: once any user marks it read, it shows as read for everybody (known server issue). Role broadcasts send a separate copy to each person.</div>
            </div>
          )}
          <div className="row wrap" style={{ justifyContent: 'flex-end', '--gap': '10px' }}>
            <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={() => setForm(EMPTY_BROADCAST)} disabled={!dirty}>
              Clear
            </Button>
            <Button type="submit" variant="accent" icon={<Send size={16} />}>
              Review &amp; send
            </Button>
          </div>
        </form>
      </section>

      <section className="adm-card ops-panel">
        <div className="ops-panel-head">
          <div>
            <h2 className="ops-section-title" style={{ fontSize: 'var(--fs-md)' }}>
              Live preview
            </h2>
            <p className="text-xs text-muted">How it appears in the app.</p>
          </div>
          <Badge tone="primary" icon={<Users size={13} />}>
            {audience.label}
          </Badge>
        </div>
        <div className="ops-preview" aria-label="Notification preview">
          <div className="ops-preview-bar">
            <span className="fw-600">GO-GO Ride</span>
            <span className="ops-preview-bell">
              <Bell size={16} />
            </span>
          </div>
          <div className={`ops-preview-toast ${form.type.toLowerCase()}`}>
            <Bell size={15} className="text-primary" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div className="fw-600" style={{ overflowWrap: 'anywhere' }}>
                {form.title.trim() || 'Your title appears here'}
              </div>
              <div className="text-muted" style={{ overflowWrap: 'anywhere' }}>
                {form.message.trim() ? (form.message.trim().length > 90 ? `${form.message.trim().slice(0, 89)}…` : form.message.trim()) : 'The first line of your message.'}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted" style={{ padding: '0 4px' }}>
            In the notifications feed
          </div>
          <FeedItem
            className="in-preview"
            title={form.title.trim() || 'Your title appears here'}
            message={form.message.trim() || 'Write a message to see it here. Keep it short and clear - most people read notifications on their phone.'}
            type={form.type}
            link={form.link.trim()}
            broadcast={form.audience === 'ALL'}
          />
        </div>
      </section>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="primary"
        title={`Send to ${audience.label.toLowerCase()}?`}
        confirmLabel="Send now"
        message={
          <>
            <b>“{form.title.trim()}”</b> goes out immediately
            {reach.data != null ? (form.audience === 'ALL' ? ` to every signed-in user (${formatNumber(reach.data)} active accounts)` : ` to ${plural(reach.data, 'active account')}`) : ''}. A sent broadcast can't be edited or
            recalled.
          </>
        }
        onConfirm={send}
      />
    </div>
  )
}

// ---------------------------------------------------------------- my notifications

function MyNotifications() {
  const toast = useToast()
  const navigate = useNavigate()
  const list = usePagedQuery(notificationService.list, { limit: 10, initialFilters: { unreadOnly: '' } })
  const [markingAll, setMarkingAll] = useState(false)
  const [sharedTarget, setSharedTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const unread = list.meta?.unread ?? 0
  const onlyUnread = list.filters.unreadOnly === 'true'

  const markRead = async (n) => {
    list.patchRow(n.id, { isRead: true })
    try {
      await notificationService.markRead(n.id)
      notifyUnreadChanged()
      list.reload()
    } catch (err) {
      list.patchRow(n.id, { isRead: false })
      toast.error(err)
      throw err
    }
  }

  const askRead = (n) => {
    if (!n.userId) setSharedTarget(n)
    else markRead(n).catch(() => {})
  }

  const open = (n) => {
    if (!n.isRead && n.userId) markRead(n).catch(() => {})
    if (n.link) {
      if (/^https?:\/\//i.test(n.link)) window.open(n.link, '_blank', 'noopener,noreferrer')
      else if (n.link.startsWith('/')) navigate(n.link)
    }
  }

  const markAll = async () => {
    setMarkingAll(true)
    try {
      const res = await notificationService.markAllRead()
      notifyUnreadChanged()
      const { data, meta } = await notificationService.list({ unreadOnly: true, limit: 1 })
      list.reload()
      const left = meta?.total ?? data.length
      if (left > 0) toast.info(`${plural(res?.updated ?? 0, 'notification')} marked read. ${plural(left, 'shared announcement stays', 'shared announcements stay')} unread - marking those read would clear them for every user.`)
      else toast.success('All caught up')
    } catch (err) {
      toast.error(err)
    } finally {
      setMarkingAll(false)
    }
  }

  const remove = async () => {
    try {
      await notificationService.remove(deleting.id)
      toast.success('Notification deleted')
      list.removeRow(deleting.id)
      if (!deleting.isRead) notifyUnreadChanged()
      list.reload()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const showSkeleton = list.loading && !list.rows.length

  return (
    <section className="adm-card adm-table-card">
      <div className="ops-notif-head">
        <div className="segmented" role="tablist" aria-label="Filter">
          <button type="button" role="tab" aria-selected={!onlyUnread} className={!onlyUnread ? 'active' : ''} onClick={() => list.setFilter('unreadOnly', '')}>
            All
          </button>
          <button type="button" role="tab" aria-selected={onlyUnread} className={onlyUnread ? 'active' : ''} onClick={() => list.setFilter('unreadOnly', 'true')}>
            Unread{unread ? ` (${unread})` : ''}
          </button>
        </div>
        <Button variant="outline" size="sm" icon={<CheckCheck size={16} />} onClick={markAll} loading={markingAll} disabled={!unread}>
          Mark all as read
        </Button>
      </div>

      {showSkeleton ? (
        <div className="stack" style={{ padding: 18 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={64} radius={12} />
          ))}
        </div>
      ) : list.error && !list.rows.length ? (
        <ErrorState error={list.error} onRetry={list.reload} compact />
      ) : !list.rows.length ? (
        onlyUnread ? (
          <EmptyState compact icon={<CheckCheck size={24} />} title="You're all caught up" message="No unread notifications right now." />
        ) : (
          <EmptyState compact icon={<BellOff size={24} />} title="No notifications yet" message="New bus requests, replies and announcements for your account appear here." />
        )
      ) : (
        <ul className={`ops-notif-list ${list.loading ? 'adm-dim' : ''}`}>
          {list.rows.map((n) => {
            const ui = typeUi(n.type)
            const shared = !n.userId
            return (
              <li key={n.id} className={`ops-notif ${n.isRead ? '' : 'unread'}`}>
                <span className={`icon-tile ${ui.tone}`}>
                  <ui.icon size={20} />
                </span>
                <div className="ops-notif-body">
                  <div className="ops-notif-title">{n.title}</div>
                  <div className="ops-notif-msg">{n.message}</div>
                  <div className="ops-notif-meta">
                    <span title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
                    <Badge tone="neutral" square>
                      {shared ? 'Announcement' : ui.text}
                    </Badge>
                    {n.link && (
                      <button type="button" className="link-btn" onClick={() => open(n)}>
                        Open <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="ops-notif-actions">
                  {!n.isRead && (
                    <button type="button" className="adm-act approve" onClick={() => askRead(n)} aria-label={`Mark "${n.title}" as read`} title={shared ? 'Mark read (for everyone)' : 'Mark as read'}>
                      <Check size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="adm-act danger"
                    onClick={() => setDeleting(n)}
                    disabled={shared}
                    aria-label={`Delete "${n.title}"`}
                    title={shared ? 'Announcements are shared with every user and cannot be deleted from one feed' : 'Delete'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {list.meta && <Pagination meta={list.meta} onChange={list.setPage} noun="notifications" />}

      <ConfirmDialog
        open={Boolean(sharedTarget)}
        onClose={() => setSharedTarget(null)}
        tone="primary"
        title="Mark read for everyone?"
        confirmLabel="Mark read"
        message={
          sharedTarget && (
            <>
              <b>“{sharedTarget.title}”</b> is an announcement shared by every user. Because read state is stored once (known server issue), marking it read here also clears it from every passenger's
              bell.
            </>
          )
        }
        onConfirm={() => markRead(sharedTarget)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this notification?"
        confirmLabel="Delete"
        message={deleting && <>“{deleting.title}” will be removed from your feed.</>}
        onConfirm={remove}
      />
    </section>
  )
}

// ---------------------------------------------------------------- page

export default function NotificationsAdmin() {
  const [params, setParams] = useSearchParams()
  const tab = TAB_KEYS.includes(params.get('tab')) ? params.get('tab') : 'activity'
  const unread = useUnreadCount()
  const setTab = (v) => setParams(v === 'activity' ? {} : { tab: v }, { replace: true })

  return (
    <div className="adm-page">
      <SectionHeader title="Notifications" subtitle="The admin activity log, announcements to users and your own notifications." />
      <AdminTabs
        className="ops-page-tabs"
        ariaLabel="Notifications sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'activity', label: 'Activity Log' },
          { value: 'broadcast', label: 'Broadcast' },
          { value: 'mine', label: 'My Notifications', count: unread || undefined },
        ]}
      />
      {tab === 'activity' && <ActivityLog />}
      {tab === 'broadcast' && <Broadcast />}
      {tab === 'mine' && <MyNotifications />}
    </div>
  )
}
