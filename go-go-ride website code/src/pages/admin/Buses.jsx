import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bus, Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, DataTable, RouteBadge, SectionHeader, Select, StatusBadge, TableToolbar, optionsFrom } from '../../components/ui'
import { AdminTabs, ApprovalActions, BusDetailsModal, routeLabel, useStatusCounts } from '../../components/admin'
import { useToast } from '../../context/ToastContext'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { busService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatDate, formatPhone, label, LABELS, todayISO } from '../../utils/format'
import './admin.css'

const TABS = [
  { value: '', label: 'All Buses' },
  { value: 'PENDING', label: 'Pending Approval' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const CSV_COLUMNS = [
  { header: 'Bus Number', value: 'busNumber' },
  { header: 'Bus Name', value: 'busName' },
  { header: 'Route Number', value: (b) => b.route?.routeNumber || '' },
  { header: 'Route', value: (b) => routeLabel(b) },
  { header: 'Owner', value: (b) => b.owner?.name || '' },
  { header: 'Owner Phone', value: (b) => b.owner?.phone || '' },
  { header: 'Type', value: (b) => label('busType', b.type) },
  { header: 'Category', value: (b) => label('busCategory', b.category) },
  { header: 'Seats', value: 'totalSeats' },
  { header: 'Fare (INR)', value: 'fare' },
  { header: 'Status', value: (b) => label('busStatus', b.status) },
  { header: 'Added On', value: (b) => formatDate(b.createdAt) },
]

export default function Buses() {
  const toast = useToast()
  const [params] = useSearchParams()
  const urlSearch = params.get('search') || ''
  const list = usePagedQuery(busService.list, { limit: 10, initialSearch: urlSearch, initialFilters: { status: '', type: '', category: '' } })
  const counts = useStatusCounts(busService.list, 'status', TABS.map((t) => t.value))
  const [viewId, setViewId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const { setSearch } = list

  // The admin top-bar search lands here as /admin/buses?search=...
  useEffect(() => {
    setSearch(urlSearch)
  }, [urlSearch, setSearch])

  const afterStatusChange = () => {
    list.reload()
    counts.reload()
  }

  const remove = async () => {
    try {
      await busService.remove(toDelete.id)
      toast.success(`${toDelete.busNumber} deleted`)
      list.removeRow(toDelete.id)
      counts.reload()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-buses-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${list.rows.length} bus${list.rows.length === 1 ? '' : 'es'} from this page`)
  }

  const columns = [
    {
      key: 'busNumber',
      header: 'Bus Number',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{b.busNumber}</span>
          {b.busName && <span className="adm-cell-sub">{b.busName}</span>}
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (b) => (
        <span className="adm-route-cell">
          {b.route?.routeNumber && <RouteBadge size="sm">{b.route.routeNumber}</RouteBadge>}
          <span className={b.route || b.stopages?.length ? '' : 'text-muted'}>{routeLabel(b)}</span>
        </span>
      ),
    },
    {
      key: 'owner',
      header: 'Owner Name',
      render: (b) => (
        <div className="adm-cell">
          <span className="adm-cell-main" style={{ fontWeight: 500 }}>
            {b.owner?.name || '-'}
          </span>
          {b.owner?.phone && <span className="adm-cell-sub">{formatPhone(b.owner.phone)}</span>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge value={b.status} group="busStatus" /> },
    { key: 'createdAt', header: 'Added On', render: (b) => <span className="nowrap">{formatDate(b.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (b) => (
        <span className="adm-actions">
          {(b.status === 'PENDING' || b.status === 'UNDER_REVIEW') && <ApprovalActions bus={b} showReview={false} onChanged={afterStatusChange} />}
          <Link className="adm-act" to={`/admin/buses/${b.id}/edit`} aria-label={`Edit ${b.busNumber}`} title="Edit">
            <Pencil size={15} />
          </Link>
          <button type="button" className="adm-act" onClick={() => setViewId(b.id)} aria-label={`View ${b.busNumber}`} title="View details">
            <Eye size={16} />
          </button>
          <button type="button" className="adm-act danger" onClick={() => setToDelete(b)} aria-label={`Delete ${b.busNumber}`} title="Delete">
            <Trash2 size={15} />
          </button>
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))

  return (
    <div className="adm-page">
      <SectionHeader title="Bus Management" subtitle="Every bus on GO-GO Ride - approve, edit or remove listings." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={list.filters.status} onChange={(v) => list.setFilter('status', v)} ariaLabel="Bus status" />
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search bus number or name…"
          actions={
            <>
              <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
                Export
              </Button>
              <Button size="sm" icon={<Plus size={16} />} to="/admin/buses/new">
                Add New Bus
              </Button>
            </>
          }
        >
          <Select
            aria-label="Bus type"
            placeholder="All types"
            options={optionsFrom(LABELS.busType)}
            value={list.filters.type}
            onChange={(e) => list.setFilter('type', e.target.value)}
          />
          <Select
            aria-label="Bus category"
            placeholder="All categories"
            options={optionsFrom(LABELS.busCategory)}
            value={list.filters.category}
            onChange={(e) => list.setFilter('category', e.target.value)}
          />
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="buses"
          empty={{
            title: list.search ? 'No buses match your search' : 'No buses here',
            message: list.search ? `Nothing found for "${list.search}". Try a bus number like WB 01.` : 'Buses in this status will appear here.',
            action: !list.search && !list.filters.status ? (
              <Button size="sm" icon={<Bus size={16} />} to="/admin/buses/new">
                Add the first bus
              </Button>
            ) : null,
          }}
        />
      </section>

      <BusDetailsModal
        busId={viewId}
        onClose={() => setViewId(null)}
        onChanged={() => {
          setViewId(null)
          afterStatusChange()
        }}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete this bus?"
        confirmLabel="Delete bus"
        message={
          toDelete && (
            <>
              <b>{toDelete.busNumber}</b>
              {toDelete.busName ? ` (${toDelete.busName})` : ''} and its timetable, documents and reviews will be permanently removed. This cannot be undone.
            </>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
