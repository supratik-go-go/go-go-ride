import { useState } from 'react'
import { CheckCircle2, Eye } from 'lucide-react'
import { Button, DataTable, Input, Modal, SectionHeader, StatusBadge, TableToolbar, Textarea, useToast } from '../../components/ui'
import { AdminTabs, DateTimeCell, useStatusCounts } from '../../components/admin'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService } from '../../services'
import { formatPhone, label } from '../../utils/format'
import './admin.css'

const TABS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

function ReviewModal({ request, onClose, onChanged }) {
  const toast = useToast()
  const [name, setName] = useState(request.name)
  const [routeNumber, setRouteNumber] = useState(request.routeNumber || '')
  const [distanceKm, setDistanceKm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const pending = request.status === 'PENDING'

  const send = async (status) => {
    if (status === 'APPROVED' && !routeNumber.trim()) {
      toast.warning('Enter the route number before approving.')
      return
    }
    if (status === 'REJECTED' && !reason.trim()) {
      toast.warning('Give a reason for the rejection.')
      return
    }
    setBusy(status)
    try {
      await adminService.reviewRouteRequest(
        request.id,
        status === 'APPROVED'
          ? { status, name: name.trim(), routeNumber: routeNumber.trim().toUpperCase(), distanceKm: Number(distanceKm) || 0 }
          : { status, reason: reason.trim() },
      )
      toast.success(status === 'APPROVED' ? 'Route approved and live' : 'Route rejected')
      window.dispatchEvent(new Event('gogo:bus-requests-changed'))
      onChanged()
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Review route information"
      subtitle={`Sent by ${request.submittedBy?.name || 'a user'}${request.submittedBy?.phone ? ` · ${formatPhone(request.submittedBy.phone)}` : ''}`}
      footer={
        pending ? (
          <>
            <Button variant="outline" onClick={() => send('REJECTED')} loading={busy === 'REJECTED'} disabled={Boolean(busy)}>
              Reject
            </Button>
            <Button onClick={() => send('APPROVED')} loading={busy === 'APPROVED'} disabled={Boolean(busy)}>
              Approve
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="stack" style={{ '--gap': '14px' }}>
        <ol className="adm-route-stops">
          {request.stops.map((s, i) => (
            <li key={`${s.stopName}-${i}`}>
              {s.stopName}
              {!s.stopId && <span className="text-xs text-warning"> · new stop</span>}
            </li>
          ))}
        </ol>
        {request.notes && <p className="text-sm text-2">{request.notes}</p>}
        {pending ? (
          <>
            <Input label="Route name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Input
              label="Route number"
              required
              placeholder="e.g. S12"
              value={routeNumber}
              onChange={(e) => setRouteNumber(e.target.value.toUpperCase())}
              maxLength={20}
              hint="Needed to approve. Must be unique."
            />
            <Input
              label="Distance (km)"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              hint="Stops are spaced evenly. Fine-tune them later in Route Management."
            />
            <Textarea label="Reason (only if rejecting)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
          </>
        ) : (
          request.rejectionReason && <p className="text-sm text-danger">Rejected: {request.rejectionReason}</p>
        )}
      </div>
    </Modal>
  )
}

export default function RouteRequests() {
  const list = usePagedQuery(adminService.routeRequests, { limit: 10, initialFilters: { status: 'PENDING' } })
  const counts = useStatusCounts(adminService.routeRequests, 'status', TABS.map((t) => t.value))
  const [review, setReview] = useState(null)

  const changed = () => {
    setReview(null)
    list.reload()
    counts.reload()
  }

  const columns = [
    {
      key: 'route',
      header: 'Route',
      render: (r) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{r.name}</span>
          <span className="adm-cell-sub">
            {r.routeNumber ? `${r.routeNumber} · ` : ''}
            {r.stops.length} stops
          </span>
        </div>
      ),
    },
    {
      key: 'by',
      header: 'Submitted By',
      render: (r) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{r.submittedBy?.name || '-'}</span>
          {r.submittedBy?.phone && <span className="adm-cell-sub">{formatPhone(r.submittedBy.phone)}</span>}
        </div>
      ),
    },
    { key: 'submittedAt', header: 'Submitted On', render: (r) => <DateTimeCell value={r.submittedAt} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} group="busStatus" /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <button
          type="button"
          className="adm-act"
          onClick={(e) => {
            e.stopPropagation()
            setReview(r)
          }}
          aria-label={`Review ${r.name}`}
          title="Review"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))
  const tab = list.filters.status

  return (
    <div className="adm-page">
      <SectionHeader title="Route Requests" subtitle="Route information sent in from the app. Approving publishes the route." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={tab} onChange={(v) => list.setFilter('status', v)} ariaLabel="Request status" />
        <TableToolbar search={list.search} onSearch={list.setSearch} placeholder="Search route name or number…" />
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          onRowClick={setReview}
          noun="requests"
          empty={
            tab === 'PENDING' && !list.search
              ? { icon: <CheckCircle2 size={24} />, title: 'All caught up', message: 'There are no routes waiting for review.' }
              : { title: 'No requests found', message: list.search ? `Nothing matches "${list.search}".` : `No ${label('busStatus', tab).toLowerCase()} requests.` }
          }
        />
      </section>

      {review && <ReviewModal key={review.id} request={review} onClose={() => setReview(null)} onChanged={changed} />}
    </div>
  )
}
