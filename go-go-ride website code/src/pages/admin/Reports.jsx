import { useState } from 'react'
import { Activity, CalendarDays, CalendarRange, Download, FileSpreadsheet, Gauge, IndianRupee, Route as RouteIcon, Ticket } from 'lucide-react'
import { Button, ErrorState, Input, Modal, SectionHeader, Spinner } from '../../components/ui'
import {
  AdminTabs,
  ChartCard,
  CHART_COLORS,
  DateRangePicker,
  DonutChart,
  KpiCard,
  TimeSeriesChart,
  TopRoutesList,
  compactNumber,
  computeTrend,
  formatRange,
  presetRange,
  previousRange,
  rangeDays,
  rangeParams,
  trendLabelFor,
} from '../../components/admin'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services'
import { downloadBlob } from '../../utils/csv'
import { formatCurrency, formatNumber, label, todayISO } from '../../utils/format'
import './admin.css'

const SOON = 'Coming soon - this report needs backend support'
const REPORT_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'bus', label: 'Bus Reports', disabled: true, soon: true, title: SOON },
  { value: 'route', label: 'Route Reports', disabled: true, soon: true, title: SOON },
  { value: 'user', label: 'User Reports', disabled: true, soon: true, title: SOON },
  { value: 'financial', label: 'Financial Reports', disabled: true, soon: true, title: SOON },
]

const PAYMENT_MODES = [
  { key: 'CASH', color: CHART_COLORS.navy },
  { key: 'UPI', color: CHART_COLORS.orange },
  { key: 'CARD', color: '#5b8def' },
  { key: 'WALLET', color: '#a9b8d8' },
]

const BOOKING_STATUSES = [
  { key: 'CONFIRMED', color: CHART_COLORS.navy },
  { key: 'COMPLETED', color: 'var(--success)' },
  { key: 'PENDING', color: CHART_COLORS.orange },
  { key: 'CANCELLED', color: 'var(--danger)' },
]

const rupeeAxis = (v) => `₹${compactNumber(v)}`

function StatusBars({ counts = {}, total }) {
  const sum = total || Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className="adm-status-bars">
      {BOOKING_STATUSES.map((s) => {
        const n = counts[s.key] || 0
        const pct = sum ? (n / sum) * 100 : 0
        return (
          <div key={s.key} className="adm-status-bar">
            <span className="text-2">{label('bookingStatus', s.key)}</span>
            <span className="track" aria-hidden="true">
              <span style={{ width: `${pct}%`, background: s.color }} />
            </span>
            <span className="fw-600 tabular" style={{ textAlign: 'right' }}>
              {formatNumber(n)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Reports() {
  const toast = useToast()
  const [range, setRange] = useState(() => presetRange('30d'))
  const [busy, setBusy] = useState(null)
  const [custom, setCustom] = useState(null)

  const q = useAsync(async () => {
    const [current, previous] = await Promise.all([
      adminService.reports(rangeParams(range)),
      adminService.reports(previousRange(range)).catch(() => null),
    ])
    return { current, previous }
  }, [range.from, range.to])

  const r = q.data?.current
  const p = q.data?.previous
  const loading = q.loading && !r
  const refreshing = q.loading && Boolean(r)
  const trendLabel = trendLabelFor(range)
  const trend = (key) => (p ? computeTrend(r?.[key], p[key]) : undefined)

  const payments = PAYMENT_MODES.map((m) => {
    const row = r?.paymentSplit?.find((x) => x.mode === m.key)
    return { key: m.key, label: label('paymentMode', m.key), color: m.color, value: row?.amount ?? 0, percentage: row?.percentage ?? 0 }
  })

  const download = async (key, from, to) => {
    setBusy(key)
    try {
      const blob = await adminService.exportReport({ from, to })
      downloadBlob(blob, `gogoride-report-${from}-to-${to}.csv`)
      toast.success(`Report for ${formatRange(from, to)} downloaded`)
      return true
    } catch (err) {
      toast.error(err)
      return false
    } finally {
      setBusy(null)
    }
  }

  const today = todayISO()
  const week = presetRange('7d')
  const month = presetRange('30d')
  const downloads = [
    { key: 'daily', label: 'Daily Report', hint: 'Today', icon: <CalendarDays size={18} />, run: () => download('daily', today, today) },
    { key: 'weekly', label: 'Weekly Report', hint: 'Last 7 days', icon: <CalendarRange size={18} />, run: () => download('weekly', week.from, week.to) },
    { key: 'monthly', label: 'Monthly Report', hint: 'Last 30 days', icon: <FileSpreadsheet size={18} />, run: () => download('monthly', month.from, month.to) },
    { key: 'custom', label: 'Custom Report', hint: 'Pick dates', icon: <Download size={18} />, run: () => setCustom({ from: range.from, to: range.to }) },
  ]

  let customError = ''
  if (custom?.from && custom?.to && custom.from > custom.to) customError = 'Start date must be before the end date'
  else if (custom?.from && custom?.to && rangeDays(custom.from, custom.to) > 366) customError = 'Pick a range of one year or less'

  return (
    <div className="adm-page">
      <SectionHeader title="Reports & Analytics" subtitle="Revenue, trips and occupancy from bookings in the selected period." actions={<DateRangePicker value={range} onChange={setRange} />} />

      <div>
        <AdminTabs items={REPORT_TABS} value="overview" onChange={() => {}} ariaLabel="Report type" />
        <p className="text-xs text-muted" style={{ marginTop: 10 }}>
          Showing {formatRange(range.from, range.to)}
          {p && ` · trends compare with ${formatRange(previousRange(range).from, previousRange(range).to)}`}
        </p>
      </div>

      {q.error && !r ? (
        <div className="adm-card">
          <ErrorState error={q.error} onRetry={q.reload} />
        </div>
      ) : (
        <>
          <div className={`adm-kpis ${refreshing ? 'adm-dim' : ''}`}>
            <KpiCard icon={<IndianRupee size={26} />} tone="accent" label="Total Revenue" value={formatCurrency(r?.totalRevenue ?? 0)} trend={trend('totalRevenue')} trendLabel={trendLabel} loading={loading} title="Sum of booking amounts, cancelled bookings excluded" />
            <KpiCard icon={<Ticket size={26} />} tone="primary" label="Total Trips" value={formatNumber(r?.totalTrips ?? 0)} trend={trend('totalTrips')} trendLabel={trendLabel} loading={loading} title="Bookings in the period that were not cancelled" />
            <KpiCard icon={<Gauge size={26} />} tone="success" label="Avg. Occupancy" value={`${Number(r?.avgOccupancy ?? 0).toFixed(1)}%`} trend={trend('avgOccupancy')} trendLabel={trendLabel} loading={loading} title="Seats booked as a share of bus capacity" />
            <KpiCard icon={<RouteIcon size={26} />} tone="violet" label="Total Distance" value={`${formatNumber(r?.totalDistanceKm ?? 0)} km`} trend={trend('totalDistanceKm')} trendLabel={trendLabel} loading={loading} title="Route distance x seats booked (passenger-km)" />
          </div>

          <div className={`adm-split ${refreshing ? 'adm-dim' : ''}`}>
            <ChartCard title="Revenue Trend" subtitle="Daily revenue, cancelled bookings excluded" loading={loading} bodyHeight={260}>
              <TimeSeriesChart
                data={r?.series || []}
                height={260}
                series={[{ key: 'revenue', label: 'Revenue', color: CHART_COLORS.orange, type: 'area', format: (v) => formatCurrency(v) }]}
                axisFormat={rupeeAxis}
                emptyLabel="No revenue in this period"
              />
            </ChartCard>
            <ChartCard title="Revenue by Payment Mode" loading={loading} bodyHeight={200}>
              <DonutChart data={payments} centerValue={formatCurrency(r?.totalRevenue ?? 0)} centerLabel="Revenue" formatValue={(v) => formatCurrency(v)} />
            </ChartCard>
          </div>

          <div className={`adm-charts-2 ${refreshing ? 'adm-dim' : ''}`}>
            <ChartCard title="Top Routes by Bookings" subtitle="Seats booked on linked routes" loading={loading} bodyHeight={200}>
              <TopRoutesList routes={r?.topRoutes} limit={7} />
            </ChartCard>
            <ChartCard
              title="Bookings by Status"
              subtitle={`${formatNumber(r?.totalBookings ?? 0)} bookings made in this period`}
              loading={loading}
              bodyHeight={160}
              actions={<Activity size={18} className="text-muted" />}
            >
              <StatusBars counts={r?.statusCounts} total={r?.totalBookings} />
            </ChartCard>
          </div>
        </>
      )}

      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <h2 className="adm-card-title">Download Report</h2>
            <div className="adm-card-sub">CSV with buses added, bookings and revenue per day</div>
          </div>
        </div>
        <div className="adm-card-body">
          <div className="adm-download-grid">
            {downloads.map((d) => (
              <button key={d.key} type="button" className="adm-download" onClick={d.run} disabled={Boolean(busy)} aria-busy={busy === d.key}>
                <span className="icon-tile">{busy === d.key ? <Spinner size={18} /> : d.icon}</span>
                <span style={{ textAlign: 'left' }}>
                  {d.label}
                  <small>{d.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <Modal
        open={Boolean(custom)}
        onClose={() => !busy && setCustom(null)}
        title="Custom report"
        subtitle="Download the daily figures for any period up to a year."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCustom(null)} disabled={busy === 'custom'}>
              Cancel
            </Button>
            <Button
              icon={<Download size={16} />}
              loading={busy === 'custom'}
              disabled={!custom?.from || !custom?.to || Boolean(customError)}
              onClick={async () => {
                if (await download('custom', custom.from, custom.to)) setCustom(null)
              }}
            >
              Download CSV
            </Button>
          </>
        }
      >
        <div className="grid grid-2 keep-mobile">
          <Input label="From" type="date" required value={custom?.from || ''} max={custom?.to || today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <Input label="To" type="date" required value={custom?.to || ''} min={custom?.from || undefined} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
        {customError && (
          <p className="field-error" style={{ marginTop: 8 }}>
            {customError}
          </p>
        )}
      </Modal>
    </div>
  )
}
