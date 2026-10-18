import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, FileText } from 'lucide-react'
import { Badge, DataTable, SectionHeader, StatusBadge, TableToolbar } from '../../components/ui'
import { AdminTabs, ApprovalActions, BusReviewDrawer, DateTimeCell, routeLabel, useStatusCounts } from '../../components/admin'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService } from '../../services'
import { formatPhone, label } from '../../utils/format'
import './admin.css'

// '' = the review queue (the API's default: PENDING + UNDER_REVIEW).
const TABS = [
  { value: '', label: 'All Requests' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

export default function BusRequests() {
  const list = usePagedQuery(adminService.busRequests, { limit: 10, initialFilters: { status: '' } })
  const counts = useStatusCounts(adminService.busRequests, 'status', TABS.map((t) => t.value))
  const [review, setReview] = useState(null)

  const changed = () => {
    setReview(null)
    list.reload()
    counts.reload()
  }

  const columns = [
    {
      key: 'owner',
      header: 'Owner Details',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{b.owner?.name || '-'}</span>
          {b.owner?.phone && <span className="adm-cell-sub">{formatPhone(b.owner.phone)}</span>}
          {b.owner?.email && <span className="adm-cell-sub">{b.owner.email}</span>}
        </div>
      ),
    },
    {
      key: 'bus',
      header: 'Bus Details',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{b.busNumber}</span>
          <span className="adm-cell-sub" style={{ color: 'var(--text-2)' }}>
            {routeLabel(b)}
          </span>
          <span className="adm-cell-sub">
            {label('busType', b.type)} · {b.totalSeats} seats
          </span>
        </div>
      ),
    },
    {
      key: 'docs',
      header: 'Documents',
      render: (b) =>
        b.documents?.length ? (
          <Badge tone="primary" square icon={<FileText size={13} />}>
            {b.documents.length} file{b.documents.length > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge tone="warning" square icon={<AlertTriangle size={13} />}>
            None
          </Badge>
        ),
    },
    { key: 'submittedAt', header: 'Submitted On', render: (b) => <DateTimeCell value={b.submittedAt || b.createdAt} /> },
    {
      key: 'status',
      header: 'Status',
      render: (b) => (
        <span title={b.status === 'REJECTED' && b.rejectionReason ? `Reason: ${b.rejectionReason}` : undefined}>
          <StatusBadge value={b.status} group="busStatus" />
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (b) => (
        <span className="adm-actions">
          <button
            type="button"
            className="adm-act"
            onClick={(e) => {
              e.stopPropagation()
              setReview(b)
            }}
            aria-label={`Review ${b.busNumber}`}
            title="Review details"
          >
            <Eye size={16} />
          </button>
          <ApprovalActions bus={b} onChanged={changed} />
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))
  const tab = list.filters.status

  return (
    <div className="adm-page">
      <SectionHeader title="Bus Owner Requests" subtitle="Review documents and stopages, then approve or reject new and edited buses." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={tab} onChange={(v) => list.setFilter('status', v)} ariaLabel="Request status" />
        {tab === '' && <div className="card-note">Requests waiting for a decision - Pending and Under Review, newest first. Click a row to review it.</div>}
        <TableToolbar search={list.search} onSearch={list.setSearch} placeholder="Search bus number or owner name…" />
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
            tab === '' && !list.search
              ? { icon: <CheckCircle2 size={24} />, title: 'All caught up', message: 'There are no bus requests waiting for review.' }
              : { title: 'No requests found', message: list.search ? `Nothing matches "${list.search}".` : `No ${label('busStatus', tab).toLowerCase()} requests.` }
          }
        />
      </section>

      <BusReviewDrawer bus={review} onClose={() => setReview(null)} onChanged={changed} />
    </div>
  )
}
