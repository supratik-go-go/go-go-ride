import { useState } from 'react'
import { Archive, CheckCircle2, CircleDot, Download, Hourglass, Inbox, LifeBuoy, Mail, MessageSquareReply, Phone } from 'lucide-react'
import { Badge, Button, DataTable, SectionHeader, Select, StatusBadge, TableToolbar, optionsFrom } from '../../components/ui'
import { DetailSection, Drawer, useStatusCounts } from '../../components/admin'
import { Counter, plural, snippet, telHref } from '../../components/admin-ops'
import { useToast } from '../../context/ToastContext'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { supportService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatDateTime, formatNumber, formatPhone, label, LABELS, timeAgo, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const STATUS_CHIPS = [
  { value: '', label: 'All Tickets', icon: Inbox, tone: 'primary' },
  { value: 'OPEN', label: 'Open', icon: CircleDot, tone: 'warning' },
  { value: 'IN_PROGRESS', label: 'In Progress', icon: Hourglass, tone: 'info' },
  { value: 'RESOLVED', label: 'Resolved', icon: CheckCircle2, tone: 'success' },
  { value: 'CLOSED', label: 'Closed', icon: Archive, tone: 'neutral' },
]
const PRIORITY_TONE = { LOW: 'neutral', NORMAL: 'info', HIGH: 'danger' }
const RESPONSE_MAX = 2000

const CSV_COLUMNS = [
  { header: 'Ticket', value: 'ticketRef' },
  { header: 'Subject', value: 'subject' },
  { header: 'Message', value: 'message' },
  { header: 'Name', value: 'name' },
  { header: 'Phone', value: 'phone' },
  { header: 'Email', value: (t) => t.email || '' },
  { header: 'Registered User', value: (t) => (t.userId ? 'Yes' : 'No') },
  { header: 'Category', value: (t) => label('ticketCategory', t.category) },
  { header: 'Priority', value: (t) => label('ticketPriority', t.priority) },
  { header: 'Status', value: (t) => label('ticketStatus', t.status) },
  { header: 'Response', value: (t) => t.response || '' },
  { header: 'Created', value: (t) => formatDateTime(t.createdAt) },
]

function PriorityBadge({ value }) {
  return (
    <Badge tone={PRIORITY_TONE[value] || 'neutral'} square>
      {label('ticketPriority', value)}
    </Badge>
  )
}

// ---------------------------------------------------------------- drawer

function TicketDrawer({ ticket, onClose, onUpdated }) {
  const toast = useToast()
  // Remounted per ticket (key), so the reply box starts from that ticket.
  const [response, setResponse] = useState(ticket?.response || '')
  const [status, setStatus] = useState(ticket?.status || 'OPEN')
  const [priority, setPriority] = useState(ticket?.priority || 'NORMAL')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(null) // 'save' | 'resolve'

  if (!ticket) return null
  const reply = response.trim()
  const replyChanged = Boolean(reply) && reply !== (ticket.response || '').trim()
  const changes = {
    ...(status !== ticket.status ? { status } : {}),
    ...(priority !== ticket.priority ? { priority } : {}),
    ...(replyChanged ? { response: reply } : {}),
  }
  const dirty = Object.keys(changes).length > 0
  const closed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
  const tel = telHref(ticket.phone)

  const save = async (kind, body) => {
    if (reply.length > RESPONSE_MAX) {
      setErrors({ response: `Keep the reply to ${RESPONSE_MAX} characters` })
      return
    }
    setBusy(kind)
    setErrors({})
    try {
      const updated = await supportService.update(ticket.id, body)
      toast.success(
        body.response && ticket.userId
          ? `Reply sent to ${ticket.name} as an in-app notification`
          : body.status === 'RESOLVED'
            ? `Ticket ${ticket.ticketRef} marked resolved`
            : `Ticket ${ticket.ticketRef} updated`,
      )
      onUpdated(updated)
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer
      open
      onClose={busy ? () => {} : onClose}
      title={ticket.subject}
      subtitle={`${ticket.ticketRef} · ${formatDateTime(ticket.createdAt)}`}
      headerExtra={
        <div className="row wrap" style={{ '--gap': '6px', marginTop: 8 }}>
          <StatusBadge value={ticket.status} group="ticketStatus" withDot />
          <PriorityBadge value={ticket.priority} />
          <Badge tone="neutral" square>
            {label('ticketCategory', ticket.category)}
          </Badge>
        </div>
      }
      footer={
        <>
          {!closed && (
            <Button
              variant="success"
              icon={<CheckCircle2 size={16} />}
              loading={busy === 'resolve'}
              disabled={Boolean(busy)}
              onClick={() => save('resolve', { ...changes, status: 'RESOLVED' })}
              title={replyChanged ? 'Send the reply and mark the ticket resolved' : 'Mark the ticket resolved'}
            >
              {replyChanged ? 'Reply & resolve' : 'Mark resolved'}
            </Button>
          )}
          <Button icon={<MessageSquareReply size={16} />} loading={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={() => save('save', changes)}>
            {replyChanged ? 'Send reply' : 'Save changes'}
          </Button>
        </>
      }
    >
      <DetailSection title="From">
        <div className="adm-facts">
          <div>
            <div className="adm-fact-label">Name</div>
            <div className="adm-fact-value">{ticket.name}</div>
          </div>
          <div>
            <div className="adm-fact-label">Account</div>
            <div className="adm-fact-value">{ticket.userId ? 'Registered user' : 'Guest (contact form)'}</div>
          </div>
          <div>
            <div className="adm-fact-label">Phone</div>
            <div className="adm-fact-value">{tel ? <a href={tel}>{formatPhone(ticket.phone)}</a> : ticket.phone || '-'}</div>
          </div>
          <div>
            <div className="adm-fact-label">Email</div>
            <div className="adm-fact-value">{ticket.email ? <a href={`mailto:${ticket.email}?subject=${encodeURIComponent(`Re: ${ticket.subject} [${ticket.ticketRef}]`)}`}>{ticket.email}</a> : '-'}</div>
          </div>
        </div>
        <div className="ops-contact-row">
          {tel && (
            <Button size="sm" variant="outline" href={tel} icon={<Phone size={15} />}>
              Call
            </Button>
          )}
          {ticket.email && (
            <Button size="sm" variant="outline" href={`mailto:${ticket.email}?subject=${encodeURIComponent(`Re: ${ticket.subject} [${ticket.ticketRef}]`)}`} icon={<Mail size={15} />}>
              Email
            </Button>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Message">
        <div className="ops-bubble">{ticket.message}</div>
      </DetailSection>

      <DetailSection title="Reply">
        <div className="stack" style={{ '--gap': '14px' }}>
          {ticket.response ? (
            <div>
              <div className="ops-bubble-meta">
                <MessageSquareReply size={13} /> Current reply
              </div>
              <div className="ops-bubble reply">{ticket.response}</div>
            </div>
          ) : (
            <p className="text-sm text-muted">No reply yet.</p>
          )}
          <div className="field">
            <div className="ops-legend">
              <label className="field-label" htmlFor="ops-ticket-reply">
                {ticket.response ? 'Update the reply' : 'Reply to customer'}
              </label>
              <Counter value={response} max={RESPONSE_MAX} />
            </div>
            <textarea
              id="ops-ticket-reply"
              className={`textarea ${errors.response ? 'invalid' : ''}`}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Write a helpful answer…"
              disabled={Boolean(busy)}
            />
            {errors.response ? (
              <span className="field-error">{errors.response}</span>
            ) : (
              <span className="field-hint">
                {ticket.userId
                  ? 'Sending a new reply notifies them in the app.'
                  : "Guests don't have an account, so they won't see this in the app - call or email them too."}
              </span>
            )}
          </div>
          <div className="ops-form-grid">
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={optionsFrom(LABELS.ticketStatus)} error={errors.status} disabled={Boolean(busy)} />
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={optionsFrom(LABELS.ticketPriority)} error={errors.priority} disabled={Boolean(busy)} />
          </div>
        </div>
      </DetailSection>
    </Drawer>
  )
}

// ---------------------------------------------------------------- page

export default function SupportAdmin() {
  const toast = useToast()
  const list = usePagedQuery(supportService.list, { limit: 10, initialFilters: { status: '', category: '', priority: '' } })
  const counts = useStatusCounts(supportService.list, 'status', STATUS_CHIPS.map((c) => c.value))
  const [openId, setOpenId] = useState(null)
  const ticket = list.rows.find((t) => t.id === openId) || null

  const updated = (t) => {
    list.patchRow(t.id, t)
    counts.reload()
  }

  const exportRows = () => {
    exportCsv(`gogoride-support-tickets-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${plural(list.rows.length, 'ticket')} from this page`)
  }

  const columns = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (t) => (
        <div className="ops-ticket-cell">
          <span className="ops-ticket-ref">{t.ticketRef}</span>
          <span className="ops-ticket-subject" title={t.subject}>
            {t.subject}
          </span>
          <span className="ops-ticket-snippet">{snippet(t.message, 70)}</span>
        </div>
      ),
    },
    {
      key: 'from',
      header: 'From',
      render: (t) => (
        <div className="adm-cell">
          <span className="adm-cell-main" style={{ fontWeight: 500 }}>
            {t.name}
            {!t.userId && (
              <Badge tone="neutral" square style={{ marginLeft: 6 }}>
                Guest
              </Badge>
            )}
          </span>
          <span className="adm-cell-sub">{formatPhone(t.phone)}</span>
          {t.email && <span className="adm-cell-sub">{t.email}</span>}
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (t) => <span className="nowrap">{label('ticketCategory', t.category)}</span> },
    { key: 'priority', header: 'Priority', render: (t) => <PriorityBadge value={t.priority} /> },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <div className="adm-cell" style={{ gap: 3 }}>
          <span>
            <StatusBadge value={t.status} group="ticketStatus" withDot />
          </span>
          {t.response && <span className="adm-cell-sub">Replied</span>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (t) => (
        <span className="nowrap text-sm" title={formatDateTime(t.createdAt)}>
          {timeAgo(t.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => (
        <button
          type="button"
          className="adm-act review"
          onClick={(e) => {
            e.stopPropagation()
            setOpenId(t.id)
          }}
          aria-label={`Open ticket ${t.ticketRef}`}
          title="View & reply"
        >
          <MessageSquareReply size={15} />
        </button>
      ),
    },
  ]

  const filtered = list.filters.category || list.filters.priority

  return (
    <div className="adm-page">
      <SectionHeader title="Support & Queries" subtitle="Questions and complaints from the Help & Support screen and the website contact form." />

      <div className="ops-chips" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map((c) => {
          const n = counts.data?.[c.value]
          return (
            <button key={c.value || 'all'} type="button" className="ops-chip" aria-pressed={list.filters.status === c.value} onClick={() => list.setFilter('status', c.value)}>
              <span className={`ops-chip-icon tone-bg-${c.tone}`} aria-hidden="true">
                <c.icon size={18} />
              </span>
              <span className="stack" style={{ '--gap': '0px', minWidth: 0 }}>
                <span className="ops-chip-label">{c.label}</span>
                <span className="ops-chip-value">{n == null ? (counts.loading ? '…' : '-') : formatNumber(n)}</span>
              </span>
            </button>
          )
        })}
      </div>

      <section className="adm-card adm-table-card ops-dense">
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search subject, ticket ID or name…"
          actions={
            <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
              Export
            </Button>
          }
        >
          <Select aria-label="Category" placeholder="All categories" options={optionsFrom(LABELS.ticketCategory)} value={list.filters.category} onChange={(e) => list.setFilter('category', e.target.value)} />
          <Select aria-label="Priority" placeholder="All priorities" options={optionsFrom(LABELS.ticketPriority)} value={list.filters.priority} onChange={(e) => list.setFilter('priority', e.target.value)} />
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                list.setFilters((f) => ({ ...f, category: '', priority: '' }))
                list.setPage(1)
              }}
            >
              Clear filters
            </Button>
          )}
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="tickets"
          onRowClick={(t) => setOpenId(t.id)}
          empty={{
            icon: <LifeBuoy size={24} />,
            title: list.search || filtered || list.filters.status ? 'No tickets match' : 'No support tickets yet',
            message: list.search ? `Nothing found for "${list.search}".` : 'Tickets raised from the app or the contact page will appear here.',
          }}
        />
      </section>

      <TicketDrawer key={ticket?.id || 'none'} ticket={ticket} onClose={() => setOpenId(null)} onUpdated={updated} />
    </div>
  )
}
