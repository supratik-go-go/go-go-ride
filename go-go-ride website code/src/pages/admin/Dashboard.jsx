import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bus, Route as RouteIcon, UserCheck, Users } from 'lucide-react'
import { DataTable, ErrorState, SectionHeader, StatusBadge } from '../../components/ui'
import {
  ActivityList,
  ApprovalActions,
  BusReviewDrawer,
  ChartCard,
  CHART_COLORS,
  DateRangePicker,
  DateTimeCell,
  DonutChart,
  KpiCard,
  RANGE_PRESETS,
  TimeSeriesChart,
  TopRoutesList,
  firstName,
  rangeParams,
  routeLabel,
  trendLabelFor,
} from '../../components/admin'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services'
import { formatNumber } from '../../utils/format'
import './admin.css'

const STATUS_SLICES = [
  { key: 'APPROVED', label: 'Approved', color: CHART_COLORS.navy },
  { key: 'PENDING', label: 'Pending', color: CHART_COLORS.orange },
  { key: 'UNDER_REVIEW', label: 'Under Review', color: CHART_COLORS.blue },
  { key: 'REJECTED', label: 'Rejected', color: CHART_COLORS.grey },
]

const value = (n) => formatNumber(n ?? 0)

export default function Dashboard() {
  const { user } = useAuth()
  // No dates = the API's default window (last 7 days); other presets send from/to.
  const [range, setRange] = useState({ preset: '7d' })
  const [review, setReview] = useState(null)
  const q = useAsync(() => adminService.dashboard(rangeParams(range)), [range.from, range.to])

  const d = q.data
  const loading = q.loading && !d
  const refreshing = q.loading && Boolean(d)
  const trendLabel = trendLabelFor(range)
  const charts = d?.charts || []
  const rangeChip = <span className="adm-range-chip">{RANGE_PRESETS[range.preset]?.label}</span>
  const refresh = () => q.reload({ silent: true })

  const slices = STATUS_SLICES.map((s) => {
    const b = d?.busStatusOverview?.breakdown?.find((x) => x.status === s.key)
    return { ...s, value: b?.count ?? 0, percentage: b?.percentage ?? 0 }
  })

  const columns = [
    {
      key: 'owner',
      header: 'Owner Name',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{b.owner?.name || '-'}</span>
        </div>
      ),
    },
    { key: 'busNumber', header: 'Bus Number', render: (b) => <span className="fw-600 nowrap">{b.busNumber}</span> },
    { key: 'route', header: 'Route', render: (b) => <span className="nowrap">{routeLabel(b)}</span> },
    { key: 'submittedAt', header: 'Submitted On', render: (b) => <DateTimeCell value={b.submittedAt || b.createdAt} /> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge value={b.status} group="busStatus" /> },
    {
      key: 'action',
      header: 'Action',
      render: (b) => <ApprovalActions bus={b} showReview={false} onChanged={refresh} />,
    },
  ]

  return (
    <div className="adm-page">
      <SectionHeader
        title="Dashboard"
        subtitle={`Welcome back, ${firstName(user?.name)}!`}
        actions={<DateRangePicker value={range} onChange={setRange} displayFrom={charts[0]?.date} displayTo={charts[charts.length - 1]?.date} />}
      />

      {q.error && !d ? (
        <div className="adm-card">
          <ErrorState error={q.error} onRetry={q.reload} />
        </div>
      ) : (
        <>
          <div className={`adm-kpis ${refreshing ? 'adm-dim' : ''}`}>
            <KpiCard
              icon={<Bus size={28} />}
              tone="primary"
              label="Total Buses"
              value={value(d?.cards?.totalBuses?.value)}
              trend={d?.cards?.totalBuses?.trend}
              trendLabel={trendLabel}
              loading={loading}
              title="Trend compares buses added in this period with the previous one"
            />
            <KpiCard
              icon={<UserCheck size={28} />}
              tone="accent"
              label="Pending Approvals"
              value={value(d?.cards?.pendingApprovals?.value)}
              link={{ to: '/admin/bus-requests', label: 'View requests' }}
              loading={loading}
            />
            <KpiCard
              icon={<RouteIcon size={28} />}
              tone="success"
              label="Total Routes"
              value={value(d?.cards?.totalRoutes?.value)}
              trend={d?.cards?.totalRoutes?.trend}
              trendLabel={trendLabel}
              loading={loading}
            />
            <KpiCard
              icon={<Users size={28} />}
              tone="violet"
              label="Total Users"
              value={value(d?.cards?.totalUsers?.value)}
              trend={d?.cards?.totalUsers?.trend}
              trendLabel={trendLabel}
              loading={loading}
            />
          </div>

          <div className="adm-dash-grid">
            <div className="adm-col">
              <section className="adm-card adm-table-card compact">
                <div className="adm-card-head" style={{ paddingBottom: 14 }}>
                  <h2 className="adm-card-title">Bus Approval Requests</h2>
                  <Link to="/admin/bus-requests" className="adm-card-link">
                    View All <ArrowRight size={14} />
                  </Link>
                </div>
                <DataTable
                  columns={columns}
                  rows={d?.pendingRequests}
                  loading={loading}
                  error={q.error}
                  onRetry={q.reload}
                  onRowClick={setReview}
                  empty={{ title: 'All caught up', message: 'No bus requests are waiting for review.' }}
                />
              </section>

              <div className={`adm-charts-2 ${refreshing ? 'adm-dim' : ''}`}>
                <ChartCard
                  title="Buses Added"
                  actions={rangeChip}
                  loading={loading}
                  headline={{ value: value(d?.busesAdded?.value), label: 'New buses in this period', trend: d?.busesAdded?.trend, trendLabel }}
                >
                  <TimeSeriesChart data={charts} series={[{ key: 'buses', label: 'Buses added', color: CHART_COLORS.navy }]} />
                </ChartCard>
                <ChartCard
                  title="Bookings Overview"
                  actions={rangeChip}
                  loading={loading}
                  headline={{ value: value(d?.bookingsOverview?.value), label: 'Total bookings', trend: d?.bookingsOverview?.trend, trendLabel }}
                >
                  <TimeSeriesChart data={charts} series={[{ key: 'bookings', label: 'Bookings', color: CHART_COLORS.orange, type: 'area' }]} />
                </ChartCard>
              </div>

              <section className={`adm-card ${refreshing ? 'adm-dim' : ''}`}>
                <div className="adm-card-head">
                  <div>
                    <h2 className="adm-card-title">Top Routes</h2>
                    <div className="adm-card-sub">Seats booked in this period</div>
                  </div>
                  <Link to="/admin/reports" className="adm-card-link">
                    Reports <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="adm-card-body">
                  <TopRoutesList routes={d?.topRoutes} loading={loading} />
                </div>
              </section>
            </div>

            <div className="adm-col">
              <ChartCard title="Bus Status Overview" loading={loading} bodyHeight={180}>
                <DonutChart data={slices} total={d?.busStatusOverview?.total} centerLabel="Total Buses" size={156} thickness={24} />
              </ChartCard>

              <section className="adm-card">
                <div className="adm-card-head">
                  <h2 className="adm-card-title">Recent Activities</h2>
                  <Link to="/admin/notifications" className="adm-card-link">
                    View All <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="adm-card-body" style={{ paddingTop: 4 }}>
                  <ActivityList items={d?.recentActivities?.slice(0, 5)} loading={loading} error={q.error} onRetry={q.reload} />
                </div>
              </section>

            </div>
          </div>
        </>
      )}

      <BusReviewDrawer
        bus={review}
        onClose={() => setReview(null)}
        onChanged={() => {
          setReview(null)
          refresh()
        }}
      />
    </div>
  )
}
