import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarX2, Search, Ticket, Users, Wallet } from 'lucide-react'
import { Button, EmptyState, ErrorState, RouteBadge, SkeletonList, StatusBadge, Tabs } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { bookingService } from '../../services'
import { busBadge, formatCurrency, formatDate, label, relativeDayLabel } from '../../utils/format'
import { AccountPage, LoadMore } from './accountShared'
import { BOOKING_ICON, BOOKING_TONE, bookingSubtitle, bookingTitle, isPayDriver } from './accountUtils'

const PAGE_SIZE = 10

const TABS = [
  { value: 'all', label: 'All', statuses: [''] },
  { value: 'upcoming', label: 'Upcoming', statuses: ['CONFIRMED', 'PENDING'] },
  { value: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
]

const EMPTY = {
  all: { title: 'No bookings yet', message: 'Seats you book on buses, shared rides and local cars will show up here.' },
  upcoming: { title: 'No upcoming trips', message: 'Confirmed and pending bookings appear here until you travel.' },
  completed: { title: 'No completed trips', message: 'Trips you have finished will be listed here.' },
  cancelled: { title: 'No cancelled bookings', message: "Good news - you haven't cancelled anything." },
}

/**
 * Appending feed over one or more status filters. The API's `status` filter takes a
 * single value, so "Upcoming" runs one cursor per status and merges the pages.
 */
function useBookingFeed(statuses) {
  const key = statuses.join(',')
  const [state, setState] = useState({ items: [], loading: true, loadingMore: false, error: null, total: 0, hasMore: false })
  const cursors = useRef({})
  const callId = useRef(0)

  const fetchPage = useCallback(
    async (reset) => {
      const id = ++callId.current
      if (reset) cursors.current = {}
      setState((s) => (reset ? { items: [], loading: true, loadingMore: false, error: null, total: 0, hasMore: false } : { ...s, loadingMore: true, error: null }))
      const list = key.split(',')
      const pending = list.filter((st) => !cursors.current[st] || cursors.current[st].page < cursors.current[st].totalPages)
      try {
        const results = await Promise.all(
          pending.map((st) => bookingService.list({ page: (cursors.current[st]?.page || 0) + 1, limit: PAGE_SIZE, status: st || undefined })),
        )
        if (id !== callId.current) return
        results.forEach((r, i) => {
          cursors.current[pending[i]] = { page: r.meta?.page ?? 1, totalPages: r.meta?.totalPages ?? 1, total: r.meta?.total ?? r.data.length }
        })
        const total = list.reduce((n, st) => n + (cursors.current[st]?.total || 0), 0)
        const hasMore = list.some((st) => cursors.current[st] && cursors.current[st].page < cursors.current[st].totalPages)
        setState((s) => {
          const base = reset ? [] : s.items
          const seen = new Set(base.map((b) => b.id))
          const merged = base.slice()
          for (const r of results) {
            for (const b of r.data) {
              if (seen.has(b.id)) continue
              seen.add(b.id)
              merged.push(b)
            }
          }
          merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          return { items: merged, loading: false, loadingMore: false, error: null, total, hasMore }
        })
      } catch (error) {
        if (id !== callId.current) return
        setState((s) => ({ ...s, loading: false, loadingMore: false, error }))
      }
    },
    [key],
  )

  useEffect(() => {
    fetchPage(true)
  }, [fetchPage])

  return { ...state, reload: () => fetchPage(true), loadMore: () => fetchPage(false) }
}

function BookingCard({ booking: b }) {
  const Icon = BOOKING_ICON[b.type] || Ticket
  const date = String(b.travelDate || '').slice(0, 10)
  const rel = relativeDayLabel(date)
  const dateText = ['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${rel}, ${formatDate(date).replace(/ \d{4}$/, '')}` : formatDate(date)
  return (
    <Link to={`/bookings/${b.id}`} className="card acc-booking">
      <div className="acc-booking-top">
        <span className={`icon-tile ${BOOKING_TONE[b.type] || ''}`}>
          <Icon size={22} />
        </span>
        <div className="grow">
          <div className="acc-booking-title">
            {b.type === 'BUS' && b.bus && <RouteBadge size="sm">{busBadge(b.bus)}</RouteBadge>}
            <strong className="truncate">{bookingTitle(b)}</strong>
          </div>
          <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
            {bookingSubtitle(b)}
          </span>
        </div>
        <StatusBadge value={b.status} group="bookingStatus" />
      </div>
      <div className="acc-booking-meta">
        <span title="Travel date">
          <CalendarDays size={15} /> {dateText}
        </span>
        <span>
          <Users size={15} /> {b.seats} {b.seats === 1 ? 'seat' : 'seats'}
        </span>
        <span className="acc-amount tabular">{isPayDriver(b) ? 'Pay driver' : formatCurrency(b.amount)}</span>
      </div>
      <div className="acc-booking-foot">
        <span className="acc-ref">#{b.bookingRef}</span>
        <span className="row" style={{ '--gap': '6px' }}>
          <Wallet size={14} /> {label('paymentMode', b.paymentMode)}
          <StatusBadge value={b.paymentStatus} group="paymentStatus" />
        </span>
      </div>
    </Link>
  )
}

export default function Bookings() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'all'
  const current = TABS.find((t) => t.value === tab)
  const feed = useBookingFeed(current.statuses)

  const counts = useAsync(async () => {
    const statuses = ['', 'CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED']
    const res = await Promise.all(statuses.map((st) => bookingService.list({ limit: 1, status: st || undefined })))
    const t = res.map((r) => r.meta?.total ?? 0)
    return { all: t[0], upcoming: t[1] + t[2], completed: t[3], cancelled: t[4] }
  }, [])

  const setTab = (value) => setParams(value === 'all' ? {} : { tab: value }, { replace: true })

  return (
    <AccountPage title="My Bookings">
      <Tabs className="acc-tabs" value={tab} onChange={setTab} items={TABS.map((t) => ({ value: t.value, label: t.label, count: counts.data?.[t.value] }))} />

      {feed.loading ? (
        <SkeletonList count={4} height={150} />
      ) : feed.error && !feed.items.length ? (
        <ErrorState error={feed.error} onRetry={feed.reload} />
      ) : !feed.items.length ? (
        <EmptyState
          icon={tab === 'cancelled' ? <CalendarX2 size={26} /> : <Ticket size={26} />}
          title={EMPTY[tab].title}
          message={EMPTY[tab].message}
          action={
            tab === 'all' || tab === 'upcoming' ? (
              <Button to="/search" icon={<Search size={17} />}>
                Find a bus
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="acc-list">
          {feed.items.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
          {feed.error && <ErrorState error={feed.error} onRetry={feed.loadMore} compact />}
          <LoadMore hasMore={feed.hasMore} loading={feed.loadingMore} onClick={feed.loadMore} shown={feed.items.length} total={feed.total} noun="bookings" />
        </div>
      )}
    </AccountPage>
  )
}
