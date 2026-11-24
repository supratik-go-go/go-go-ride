import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Eye, PlusCircle } from 'lucide-react'
import { Badge, Button, DataTable, Modal, SectionHeader, TableToolbar, useToast } from '../../components/ui'
import { AdminTabs, DateTimeCell, useStatusCounts } from '../../components/admin'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService } from '../../services'
import { assetUrl } from '../../api/client'
import { formatPhone } from '../../utils/format'
import './admin.css'

const TABS = [
  { value: 'NEW', label: 'New' },
  { value: 'USED', label: 'Used' },
  { value: 'NOT_USEFUL', label: 'Not useful' },
]
const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.value, t.label]))

/** Read the ticket, add the bus (Bus Management > Add bus), then mark the ticket as used. */
function TicketModal({ ticket, onClose, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')

  const mark = async (status) => {
    setBusy(status)
    try {
      await adminService.reviewTicketPhoto(ticket.id, { status })
      toast.success(status === 'USED' ? 'Marked as used. The sender gets a thank-you.' : 'Marked as not useful')
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
      size="lg"
      title="Bus ticket"
      subtitle={`Sent by ${ticket.sentBy?.name || 'a user'}${ticket.sentBy?.phone ? ` · ${formatPhone(ticket.sentBy.phone)}` : ''}`}
      footer={
        <>
          {ticket.status !== 'NOT_USEFUL' && (
            <Button variant="outline" onClick={() => mark('NOT_USEFUL')} loading={busy === 'NOT_USEFUL'} disabled={Boolean(busy)}>
              Not useful
            </Button>
          )}
          {ticket.status !== 'USED' && (
            <Button onClick={() => mark('USED')} loading={busy === 'USED'} disabled={Boolean(busy)}>
              Mark as used
            </Button>
          )}
        </>
      }
    >
      <div className="stack" style={{ '--gap': '12px' }}>
        <a href={assetUrl(ticket.photoUrl)} target="_blank" rel="noreferrer" title="Open the full photo">
          <img src={assetUrl(ticket.photoUrl)} alt="Bus ticket" style={{ width: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 12, background: 'var(--surface-2)' }} />
        </a>
        {ticket.note && (
          <p className="text-sm">
            <strong>Note:</strong> {ticket.note}
          </p>
        )}
        {ticket.status !== 'USED' && (
          <Link to="/admin/buses/new" target="_blank" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }}>
            <PlusCircle size={15} /> Add this bus (opens a new tab)
          </Link>
        )}
        {ticket.bus && <p className="text-sm text-muted">Used for {ticket.bus.busName || ticket.bus.busNumber}.</p>}
      </div>
    </Modal>
  )
}

export default function TicketPhotos() {
  const list = usePagedQuery(adminService.ticketPhotos, { limit: 10, initialFilters: { status: 'NEW' } })
  const counts = useStatusCounts(adminService.ticketPhotos, 'status', TABS.map((t) => t.value))
  const [open, setOpen] = useState(null)

  const changed = () => {
    setOpen(null)
    list.reload()
    counts.reload()
  }

  const columns = [
    {
      key: 'photo',
      header: 'Ticket',
      render: (t) => (
        <img src={assetUrl(t.photoUrl)} alt="" loading="lazy" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
      ),
    },
    { key: 'note', header: 'Note', render: (t) => <span className="text-sm">{t.note || <span className="text-muted">-</span>}</span> },
    {
      key: 'by',
      header: 'Sent By',
      render: (t) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{t.sentBy?.name || '-'}</span>
          {t.sentBy?.phone && <span className="adm-cell-sub">{formatPhone(t.sentBy.phone)}</span>}
        </div>
      ),
    },
    { key: 'createdAt', header: 'Sent On', render: (t) => <DateTimeCell value={t.createdAt} /> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={t.status === 'NEW' ? 'warning' : t.status === 'USED' ? 'success' : 'neutral'}>{TAB_LABEL[t.status]}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => (
        <button
          type="button"
          className="adm-act"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(t)
          }}
          aria-label="Open ticket"
          title="Open"
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
      <SectionHeader title="Ticket Photos" subtitle="Bus tickets sent from Add Bus Info. Read the ticket, add the bus, then mark the ticket as used." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={tab} onChange={(v) => list.setFilter('status', v)} ariaLabel="Ticket status" />
        <TableToolbar search={list.search} onSearch={list.setSearch} placeholder="Search notes…" />
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          onRowClick={setOpen}
          noun="tickets"
          empty={
            tab === 'NEW' && !list.search
              ? { icon: <CheckCircle2 size={24} />, title: 'All caught up', message: 'There are no new ticket photos.' }
              : { title: 'No tickets found', message: list.search ? `Nothing matches "${list.search}".` : `No ${TAB_LABEL[tab]?.toLowerCase()} tickets.` }
          }
        />
      </section>

      {open && <TicketModal key={open.id} ticket={open} onClose={() => setOpen(null)} onChanged={changed} />}
    </div>
  )
}
