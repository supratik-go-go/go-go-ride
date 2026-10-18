import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlarmClock, Bell, BellOff, CalendarCheck, CheckCheck, ChevronRight, Megaphone, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorState, SkeletonList, useToast } from '../../components/ui'
import { notifyUnreadChanged } from '../../hooks/useUnreadCount'
import { notificationService } from '../../services'
import { formatDateTime, label, timeAgo } from '../../utils/format'
import { AccountPage, LoadMore } from './accountShared'

const PAGE_SIZE = 15

const TYPE_UI = {
  SYSTEM: { icon: Megaphone, tone: '', text: 'Update' },
  USER: { icon: CalendarCheck, tone: 'success', text: 'For you' },
  PROMO: { icon: Sparkles, tone: 'accent', text: 'Offer' },
  ALARM: { icon: AlarmClock, tone: 'warning', text: 'Alarm' },
}

export default function Notifications() {
  const navigate = useNavigate()
  const toast = useToast()
  const [filter, setFilter] = useState('all') // all | unread
  const [state, setState] = useState({ items: [], meta: null, unread: 0, loading: true, loadingMore: false, error: null })
  const [markingAll, setMarkingAll] = useState(false)
  const callId = useRef(0)

  const load = useCallback(
    async (page) => {
      const id = ++callId.current
      setState((s) => ({ ...s, loading: page === 1, loadingMore: page > 1, error: null, ...(page === 1 ? { items: [] } : null) }))
      try {
        const { data, meta } = await notificationService.list({ page, limit: PAGE_SIZE, unreadOnly: filter === 'unread' ? true : undefined })
        if (id !== callId.current) return
        setState((s) => ({
          items: page === 1 ? data : [...s.items, ...data.filter((n) => !s.items.some((x) => x.id === n.id))],
          meta,
          unread: meta?.unread ?? 0,
          loading: false,
          loadingMore: false,
          error: null,
        }))
      } catch (error) {
        if (id !== callId.current) return
        setState((s) => ({ ...s, loading: false, loadingMore: false, error }))
      }
    },
    [filter],
  )

  useEffect(() => {
    load(1)
  }, [load])

  const patch = (id, changes) => setState((s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, ...changes } : n)) }))

  const open = async (n) => {
    if (!n.isRead) {
      patch(n.id, { isRead: true })
      setState((s) => ({ ...s, unread: Math.max(0, s.unread - 1) }))
      notificationService
        .markRead(n.id)
        .then(() => notifyUnreadChanged())
        .catch(() => {
          patch(n.id, { isRead: false })
          setState((s) => ({ ...s, unread: s.unread + 1 }))
        })
    }
    if (n.link) {
      if (/^https?:\/\//i.test(n.link)) window.open(n.link, '_blank', 'noopener,noreferrer')
      else if (n.link.startsWith('/')) navigate(n.link)
    }
  }

  const remove = async (n) => {
    const before = state
    setState((s) => ({
      ...s,
      items: s.items.filter((x) => x.id !== n.id),
      unread: n.isRead ? s.unread : Math.max(0, s.unread - 1),
      meta: s.meta ? { ...s.meta, total: Math.max(0, s.meta.total - 1) } : s.meta,
    }))
    try {
      await notificationService.remove(n.id)
      if (!n.isRead) notifyUnreadChanged()
      toast.success('Notification deleted')
    } catch (err) {
      setState(before)
      toast.error(err)
    }
  }

  const markAll = async () => {
    setMarkingAll(true)
    try {
      await notificationService.markAllRead()
      // read-all only covers personal notifications; mark visible announcements too
      const broadcasts = state.items.filter((n) => !n.isRead && !n.userId)
      await Promise.allSettled(broadcasts.map((n) => notificationService.markRead(n.id)))
      notifyUnreadChanged()
      toast.success('All caught up')
      await load(1)
    } catch (err) {
      toast.error(err)
    } finally {
      setMarkingAll(false)
    }
  }

  const { items, meta, unread } = state

  return (
    <AccountPage
      title="Notifications"
      subtitle={unread ? `${unread} unread` : undefined}
    >
      <div className="row-between">
        <div className="segmented" role="tablist" aria-label="Filter">
          <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            All
          </button>
          <button type="button" role="tab" aria-selected={filter === 'unread'} className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
            Unread{unread ? ` (${unread})` : ''}
          </button>
        </div>
        {unread > 0 && (
          <button type="button" className="link-btn" onClick={markAll} disabled={markingAll}>
            <CheckCheck size={16} /> {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {state.loading ? (
        <SkeletonList count={5} height={84} />
      ) : state.error && !items.length ? (
        <ErrorState error={state.error} onRetry={() => load(1)} />
      ) : !items.length ? (
        filter === 'unread' ? (
          <EmptyState icon={<CheckCheck size={26} />} title="You're all caught up" message="No unread notifications right now." />
        ) : (
          <EmptyState icon={<BellOff size={26} />} title="No notifications yet" message="Alarm reminders, booking updates and announcements will appear here." />
        )
      ) : (
        <>
          <Card pad={false} className="acc-notif-list">
            {items.map((n) => {
              const ui = TYPE_UI[n.type] || { icon: Bell, tone: '', text: label('notificationType', n.type) }
              const broadcast = !n.userId
              return (
                <div key={n.id} className={`acc-notif ${n.isRead ? '' : 'unread'}`}>
                  <button type="button" className="acc-notif-main" onClick={() => open(n)} aria-label={`${n.isRead ? '' : 'Unread: '}${n.title}`}>
                    <span className={`icon-tile ${ui.tone}`}>
                      <ui.icon size={20} />
                    </span>
                    <span className="acc-notif-text">
                      <span className="acc-notif-title">{n.title}</span>
                      <span className="acc-notif-msg">{n.message}</span>
                      <span className="acc-notif-meta">
                        <span title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
                        <Badge tone="neutral" square>
                          {broadcast ? 'Announcement' : ui.text}
                        </Badge>
                        {n.link && (
                          <span className="row text-primary fw-500" style={{ '--gap': '2px' }}>
                            View <ChevronRight size={13} />
                          </span>
                        )}
                      </span>
                    </span>
                    {!n.isRead && <span className="acc-unread-dot" aria-hidden="true" />}
                  </button>
                  <div className="acc-notif-side">
                    {!broadcast && (
                      <button type="button" className="acc-x" onClick={() => remove(n)} aria-label={`Delete notification: ${n.title}`} title="Delete">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
          {state.error && <ErrorState error={state.error} onRetry={() => load((meta?.page || 1) + 1)} compact />}
          <LoadMore
            hasMore={meta && meta.page < meta.totalPages}
            loading={state.loadingMore}
            onClick={() => load(meta.page + 1)}
            shown={items.length}
            total={meta?.total}
            noun="notifications"
          />
        </>
      )}
    </AccountPage>
  )
}
