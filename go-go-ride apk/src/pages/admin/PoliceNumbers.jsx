import { useState } from 'react'
import { CheckCircle2, Eye, Phone, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, DataTable, Input, Modal, SectionHeader, StatusBadge, TableToolbar, useToast } from '../../components/ui'
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

/** Check the details (call the number if unsure), correct them, then approve or reject. */
function ReviewModal({ entry, onClose, onChanged }) {
  const toast = useToast()
  const [form, setForm] = useState({ stationName: entry.stationName, area: entry.area, phone: entry.phone })
  const [busy, setBusy] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const send = async (status) => {
    setBusy(status)
    try {
      await adminService.reviewPoliceNumber(entry.id, status === 'APPROVED' ? { status, ...form } : { status })
      toast.success(status === 'APPROVED' ? 'Approved: it now shows on the Emergency Call List' : 'Rejected')
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
      title="Check a police number"
      subtitle={`Sent by ${entry.sentBy?.name || 'a user'}${entry.sentBy?.phone ? ` · ${formatPhone(entry.sentBy.phone)}` : ''}`}
      footer={
        <>
          {entry.status !== 'REJECTED' && (
            <Button variant="outline" onClick={() => send('REJECTED')} loading={busy === 'REJECTED'} disabled={Boolean(busy)}>
              Reject
            </Button>
          )}
          <Button onClick={() => send('APPROVED')} loading={busy === 'APPROVED'} disabled={Boolean(busy)}>
            {entry.status === 'APPROVED' ? 'Save' : 'Approve'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '12px' }}>
        <p className="text-sm text-muted">A wrong number is dangerous in an emergency. If unsure, call it first to check it really is that police station.</p>
        <Input label="Police station" value={form.stationName} onChange={set('stationName')} maxLength={120} />
        <Input label="Area or town" value={form.area} onChange={set('area')} maxLength={120} />
        <Input label="Phone number" type="tel" value={form.phone} onChange={set('phone')} maxLength={20} />
        <a href={`tel:${form.phone.replace(/[^\d+]/g, '')}`} className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }}>
          <Phone size={15} /> Call to check
        </a>
      </div>
    </Modal>
  )
}

export default function PoliceNumbers() {
  const toast = useToast()
  const list = usePagedQuery(adminService.policeNumbers, { limit: 10, initialFilters: { status: 'PENDING' } })
  const counts = useStatusCounts(adminService.policeNumbers, 'status', TABS.map((t) => t.value))
  const [review, setReview] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  const changed = () => {
    setReview(null)
    list.reload()
    counts.reload()
  }

  const remove = async () => {
    try {
      await adminService.deletePoliceNumber(toDelete.id)
      toast.success('Deleted')
      changed()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const columns = [
    {
      key: 'station',
      header: 'Police station',
      render: (r) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{r.stationName}</span>
          <span className="adm-cell-sub">
            {r.area} · {r.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'by',
      header: 'Sent By',
      render: (r) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{r.sentBy?.name || '-'}</span>
          {r.sentBy?.phone && <span className="adm-cell-sub">{formatPhone(r.sentBy.phone)}</span>}
        </div>
      ),
    },
    { key: 'createdAt', header: 'Sent On', render: (r) => <DateTimeCell value={r.createdAt} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} group="busStatus" /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <span className="row" style={{ '--gap': '4px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="adm-act"
            onClick={(e) => {
              e.stopPropagation()
              setReview(r)
            }}
            aria-label={`Check ${r.stationName}`}
            title="Check"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            className="adm-act danger"
            onClick={(e) => {
              e.stopPropagation()
              setToDelete(r)
            }}
            aria-label={`Delete ${r.stationName}`}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))
  const tab = list.filters.status

  return (
    <div className="adm-page">
      <SectionHeader title="Police Numbers" subtitle="Local police stations sent in from the Emergency Call List. Approved numbers show in the app." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={tab} onChange={(v) => list.setFilter('status', v)} ariaLabel="Number status" />
        <TableToolbar search={list.search} onSearch={list.setSearch} placeholder="Search station, area or number…" />
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          onRowClick={setReview}
          noun="numbers"
          empty={
            tab === 'PENDING' && !list.search
              ? { icon: <CheckCircle2 size={24} />, title: 'All caught up', message: 'There are no police numbers waiting for review.' }
              : { title: 'No numbers found', message: list.search ? `Nothing matches "${list.search}".` : `No ${label('busStatus', tab).toLowerCase()} numbers.` }
          }
        />
      </section>

      {review && <ReviewModal key={review.id} entry={review} onClose={() => setReview(null)} onChanged={changed} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this police number?"
        message={toDelete ? `${toDelete.stationName} (${toDelete.phone}) will no longer show in the app.` : ''}
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  )
}
