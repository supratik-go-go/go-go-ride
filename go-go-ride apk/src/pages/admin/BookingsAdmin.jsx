import { useState } from 'react'
import { Bus, CarFront, CarTaxiFront, CheckCircle2, Hourglass, Pencil, Ticket, XCircle } from 'lucide-react'
import { Button, DataTable, Input, Modal, RouteBadge, SectionHeader, Select, StatusBadge, TableToolbar, Textarea, optionsFrom } from '../../components/ui'
import {
  ChartCard,
  CHART_COLORS,
  DateRangePicker,
  KpiCard,
  TimeSeriesChart,
  TopRoutesList,
  presetRange,
  rangeParams,
  routeLabel,
  trendLabelFor,
  useStatusCounts,
} from '../../components/admin'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService, bookingService } from '../../services'
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPhone, label, LABELS } from '../../utils/format'
import './admin.css'

const COUNT_KEYS = ['', 'COMPLETED', 'CANCELLED', 'PENDING', 'CONFIRMED']
const TYPE_ICON = { BUS: Bus, RIDE: CarFront, LOCAL_CAR: CarTaxiFront }

/** What was booked: bus + route, shared ride from -> to, or the local car driver. */
function BookedItem({ b }) {
  if (b.type === 'BUS' && b.bus) {
    return (
      <div className="adm-cell">
        <span className="adm-route-cell">
          {b.bus.route?.routeNumber && <RouteBadge size="sm">{b.bus.route.routeNumber}</RouteBadge>}
          <span className="adm-cell-main">{b.bus.busNumber}</span>
        </span>
        <span className="adm-cell-sub">{routeLabel(b.bus)}</span>
      </div>
    )
  }
  if (b.type === 'RIDE' && b.ride) {
    return (
      <div className="adm-cell">
        <span className="adm-cell-main">
          {b.ride.fromStop?.name || '?'} → {b.ride.toStop?.name || '?'}
        </span>
        <span className="adm-cell-sub">
          {label('vehicleType', b.ride.vehicleType)}
          {b.ride.departureAt ? ` · ${formatDateTime(b.ride.departureAt)}` : ''}
        </span>
      </div>
    )
  }
  if (b.type === 'LOCAL_CAR' && b.localCar) {
    return (
      <div className="adm-cell">
        <span className="adm-cell-main">{b.localCar.driverName}</span>
        <span className="adm-cell-sub">{[b.localCar.carModel, b.localCar.carNumber, b.localCar.area].filter(Boolean).join(' · ')}</span>
      </div>
    )
  }
  return <span className="text-muted">Item removed</span>
}

// ---------------------------------------------------------------- status modal

function UpdateBookingModal({ booking, onClose, onSaved }) {
  const toast = useToast()
  // Remounted per booking (key), so the selects start from its current values.
  const [status, setStatus] = useState(booking?.status || '')
  const [paymentStatus, setPaymentStatus] = useState(booking?.paymentStatus || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const cancelling = booking && status === 'CANCELLED' && booking.status !== 'CANCELLED'
  const statusOptions = ['CONFIRMED', 'COMPLETED', 'CANCELLED']
  if (booking?.status === 'PENDING') statusOptions.unshift('PENDING')
  const unchanged = booking && status === booking.status && paymentStatus === booking.paymentStatus

  const save = async () => {
    setSaving(true)
    try {
      let updated
      if (cancelling) {
        // The cancel endpoint also releases shared-ride seats and refunds paid bookings.
        updated = await bookingService.cancel(booking.id, reason.trim() || undefined)
        if (paymentStatus !== booking.paymentStatus && paymentStatus !== updated.paymentStatus) {
          updated = await bookingService.setStatus(booking.id, 'CANCELLED', paymentStatus)
        }
      } else {
        updated = await bookingService.setStatus(booking.id, status, paymentStatus !== booking.paymentStatus ? paymentStatus : undefined)
      }
      toast.success(`Booking ${booking.bookingRef} updated`)
      onSaved(updated)
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(booking)}
      onClose={saving ? undefined : onClose}
      size="sm"
      title="Update booking"
      subtitle={booking && `${booking.bookingRef} · ${booking.user?.name || ''} · ${formatCurrency(booking.amount)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={unchanged}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '14px' }}>
        <Select label="Booking status" value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions.map((s) => ({ value: s, label: label('bookingStatus', s) }))} />
        <Select label="Payment status" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} options={optionsFrom(LABELS.paymentStatus)} hint={`Paid by ${label('paymentMode', booking?.paymentMode)}`} />
        {cancelling && (
          <>
            <Textarea label="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Optional - shown on the passenger's booking" style={{ minHeight: 80 }} />
            <div className="alert alert-warning">
              <XCircle size={18} />
              <div>Cancelling frees any shared-ride seats and marks a paid booking as refunded.</div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- page

export default function BookingsAdmin() {
  const counts = useStatusCounts(bookingService.list, 'status', COUNT_KEYS)
  const [range, setRange] = useState(() => presetRange('7d'))
  const trend = useAsync(() => adminService.dashboard(rangeParams(range)), [range.from, range.to])
  const list = usePagedQuery(bookingService.list, { limit: 10, initialFilters: { status: '', type: '', from: '', to: '' } })
  const [editing, setEditing] = useState(null)

  const c = counts.data
  const countsLoading = counts.loading && !c
  const t = trend.data
  const n = (v) => (v == null ? '-' : formatNumber(v))

  const dateError = list.filters.from && list.filters.to && list.filters.from > list.filters.to

  const columns = [
    {
      key: 'ref',
      header: 'Booking',
      render: (b) => {
        const Icon = TYPE_ICON[b.type] || Ticket
        return (
          <div className="adm-person">
            <span className="icon-tile sm" aria-hidden="true">
              <Icon size={16} />
            </span>
            <div className="adm-cell">
              <span className="adm-cell-main">{b.bookingRef}</span>
              <span className="adm-cell-sub">{label('bookingType', b.type)} · {formatDate(b.createdAt)}</span>
            </div>
          </div>
        )
      },
    },
    {
      key: 'user',
      header: 'User',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main" style={{ fontWeight: 500 }}>
            {b.user?.name || '-'}
          </span>
          {b.user?.phone && <span className="adm-cell-sub">{formatPhone(b.user.phone)}</span>}
        </div>
      ),
    },
    { key: 'item', header: 'Item', render: (b) => <BookedItem b={b} /> },
    { key: 'travelDate', header: 'Travel Date', render: (b) => <span className="nowrap">{formatDate(b.travelDate)}</span> },
    { key: 'seats', header: 'Seats', align: 'center', render: (b) => <span className="tabular">{b.seats}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (b) => <span className="adm-amount">{formatCurrency(b.amount)}</span> },
    {
      key: 'payment',
      header: 'Payment',
      render: (b) => (
        <div className="adm-cell" style={{ gap: 3 }}>
          <span className="text-sm">{label('paymentMode', b.paymentMode)}</span>
          <span>
            <StatusBadge value={b.paymentStatus} group="paymentStatus" />
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <span title={b.cancelReason ? `Reason: ${b.cancelReason}` : undefined}>
          <StatusBadge value={b.status} group="bookingStatus" withDot />
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (b) => (
        <button type="button" className="adm-act" onClick={() => setEditing(b)} aria-label={`Update booking ${b.bookingRef}`} title="Change status">
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  return (
    <div className="adm-page">
      <SectionHeader title="Bookings Overview" subtitle="Bus, shared ride and local car bookings across GO-GO Ride." />

      <div className="adm-kpis">
        <KpiCard
          icon={<Ticket size={26} />}
          tone="accent"
          label="Total Bookings"
          value={n(c?.[''])}
          loading={countsLoading}
          footer={c?.CONFIRMED != null && <span className="text-muted">{formatNumber(c.CONFIRMED)} confirmed / upcoming</span>}
        />
        <KpiCard icon={<CheckCircle2 size={26} />} tone="success" label="Completed" value={n(c?.COMPLETED)} loading={countsLoading} />
        <KpiCard icon={<XCircle size={26} />} tone="danger" label="Cancelled" value={n(c?.CANCELLED)} loading={countsLoading} />
        <KpiCard icon={<Hourglass size={26} />} tone="warning" label="Pending" value={n(c?.PENDING)} loading={countsLoading} footer={<span className="text-muted">Awaiting confirmation</span>} />
      </div>

      <div className="adm-split">
        <ChartCard
          title="Bookings Trend"
          subtitle="Bookings made per day"
          loading={trend.loading && !t}
          error={trend.error && !t ? trend.error : null}
          onRetry={trend.reload}
          bodyHeight={240}
          actions={<DateRangePicker value={range} onChange={setRange} size="sm" />}
          headline={{ value: n(t?.bookingsOverview?.value ?? 0), label: 'Bookings in this period', trend: t?.bookingsOverview?.trend, trendLabel: trendLabelFor(range) }}
        >
          <div className={trend.loading ? 'adm-dim' : ''}>
            <TimeSeriesChart data={t?.charts || []} height={240} series={[{ key: 'bookings', label: 'Bookings', color: CHART_COLORS.navy, type: 'area' }]} emptyLabel="No bookings in this period" />
          </div>
        </ChartCard>
        <ChartCard title="Top Routes by Bookings" subtitle="Seats booked in the same period" loading={trend.loading && !t} bodyHeight={220}>
          <div className={trend.loading ? 'adm-dim' : ''}>
            <TopRoutesList routes={t?.topRoutes} />
          </div>
        </ChartCard>
      </div>

      <section className="adm-card adm-table-card">
        <div className="adm-card-head" style={{ paddingBottom: 4 }}>
          <h2 className="adm-card-title">All Bookings</h2>
        </div>
        <TableToolbar>
          <label className="adm-toolbar-field">
            <span>Status</span>
            <select className="select" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)}>
              <option value="">All</option>
              {Object.entries(LABELS.bookingStatus).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-toolbar-field">
            <span>Type</span>
            <select className="select" value={list.filters.type} onChange={(e) => list.setFilter('type', e.target.value)}>
              <option value="">All</option>
              {Object.entries(LABELS.bookingType).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-toolbar-field">
            <span>Travel from</span>
            <Input type="date" aria-label="Travel date from" value={list.filters.from} max={list.filters.to || undefined} onChange={(e) => list.setFilter('from', e.target.value)} />
          </label>
          <label className="adm-toolbar-field">
            <span>to</span>
            <Input type="date" aria-label="Travel date to" value={list.filters.to} min={list.filters.from || undefined} onChange={(e) => list.setFilter('to', e.target.value)} />
          </label>
          {(list.filters.status || list.filters.type || list.filters.from || list.filters.to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                list.setFilters({ status: '', type: '', from: '', to: '' })
                list.setPage(1)
              }}
            >
              Clear filters
            </Button>
          )}
        </TableToolbar>
        {dateError && <div className="card-note text-danger">The start date is after the end date.</div>}
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="bookings"
          empty={{ icon: <Ticket size={24} />, title: 'No bookings found', message: 'Try a different status, type or travel date.' }}
        />
      </section>

      <UpdateBookingModal
        key={editing?.id || 'none'}
        booking={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          list.patchRow(updated.id, updated)
          setEditing(null)
          counts.reload()
        }}
      />

    </div>
  )
}
