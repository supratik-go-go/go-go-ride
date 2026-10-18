import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BusFront,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  Eye,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Route,
  Trash2,
  XCircle,
} from 'lucide-react'
import { busService } from '../../services'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { useAuth } from '../../context/AuthContext'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Pagination,
  RouteBadge,
  Skeleton,
  StatusBadge,
  useToast,
} from '../../components/ui'
import { OwnerGate, VerificationSteps } from '../../components/owner/OwnerParts'
import { DocumentsModal, ExceptionsModal } from '../../components/owner/BusModals'
import { formatServiceDays } from '../../components/owner/ownerUtils'
import { busBadge, formatDate } from '../../utils/format'
import './owner.css'

const cx = (...c) => c.filter(Boolean).join(' ')

function routeLabel(bus) {
  if (bus.route?.name) return bus.route.name
  const list = bus.stopages || []
  if (list.length >= 2) return `${list[0].stop?.name} → ${list[list.length - 1].stop?.name}`
  return 'Route not set'
}

function BusActions({ bus, onDates, onDocs, onDelete, compact }) {
  return (
    <div className={cx('own-bus-actions', compact && 'compact')}>
      <Button size="sm" variant="soft" icon={<Pencil size={15} />} to={`/owner/buses/${bus.id}/edit`}>
        Edit
      </Button>
      <Button size="sm" variant="outline" icon={<CalendarX2 size={15} />} onClick={onDates}>
        {compact ? 'Dates' : 'Non-operating dates'}
      </Button>
      <Button size="sm" variant="outline" icon={<FileText size={15} />} onClick={onDocs}>
        Docs
        <span className="own-count">{bus.documents?.length || 0}</span>
      </Button>
      {bus.status === 'APPROVED' && (
        <Link to={`/bus/${bus.id}`} className="own-icon-btn" aria-label={`View ${bus.busNumber} as passengers see it`} title="View as passengers see it">
          <Eye size={16} />
        </Link>
      )}
      <button type="button" className="own-icon-btn danger" onClick={onDelete} aria-label={`Delete ${bus.busNumber}`} title="Delete bus">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={150} radius={16} />
      ))}
    </div>
  )
}

export default function MyBuses() {
  const { isOwner, isAdmin } = useAuth()
  if (!isOwner) {
    return (
      <div className="own-page">
        <PageHeader title="My Buses" />
        <OwnerGate />
      </div>
    )
  }
  return <MyBusesList isAdmin={isAdmin} />
}

function MyBusesList({ isAdmin }) {
  const toast = useToast()
  const list = usePagedQuery(busService.mine, { limit: 20 })
  const [datesFor, setDatesFor] = useState(null)
  const [docsFor, setDocsFor] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [showHow, setShowHow] = useState(false)

  const stats = useMemo(() => {
    const s = { total: list.meta?.total ?? list.rows.length, APPROVED: 0, review: 0, REJECTED: 0 }
    for (const b of list.rows) {
      if (b.status === 'APPROVED') s.APPROVED += 1
      else if (b.status === 'REJECTED') s.REJECTED += 1
      else s.review += 1
    }
    return s
  }, [list.rows, list.meta])
  const partial = (list.meta?.totalPages || 1) > 1

  const remove = async () => {
    try {
      await busService.remove(deleting.id)
      list.removeRow(deleting.id)
      toast.success(`${deleting.busNumber} removed`)
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const docsBus = docsFor ? list.rows.find((b) => b.id === docsFor) : null

  return (
    <div className="own-page">
      <PageHeader title="My Buses" subtitle="Buses you've listed on GO-GO Ride" />

      <div className="own-summary card">
        <div className="own-summary-stats">
          <div>
            <span className="own-stat-value tabular">{list.loading && !list.rows.length ? '–' : stats.total}</span>
            <span className="own-stat-label">Total</span>
          </div>
          <div>
            <span className="own-stat-value tabular text-success">{list.loading && !list.rows.length ? '–' : stats.APPROVED}</span>
            <span className="own-stat-label">Approved</span>
          </div>
          <div>
            <span className="own-stat-value tabular text-warning">{list.loading && !list.rows.length ? '–' : stats.review}</span>
            <span className="own-stat-label">In review</span>
          </div>
          <div>
            <span className="own-stat-value tabular text-danger">{list.loading && !list.rows.length ? '–' : stats.REJECTED}</span>
            <span className="own-stat-label">Rejected</span>
          </div>
        </div>
        <Button icon={<Plus size={18} />} to="/owner/buses/new" className="own-summary-add">
          Add Bus
        </Button>
        {partial && <p className="text-xs text-muted own-summary-note">Counts are for this page.</p>}
      </div>

      <div className="own-how card">
        <button type="button" className="own-how-toggle" onClick={() => setShowHow((s) => !s)} aria-expanded={showHow}>
          <span className="fw-600">How verification works</span>
          <ChevronDown size={18} className={cx('own-chev', showHow && 'open')} />
        </button>
        {showHow && (
          <div className="own-how-body">
            <VerificationSteps />
            <p className="text-xs text-muted">
              Editing an approved bus sends it back to Under Review. Report days your bus won&apos;t run at least 5 days in advance with “Non-operating dates”.
            </p>
          </div>
        )}
      </div>

      {list.loading && !list.rows.length ? (
        <ListSkeleton />
      ) : list.error && !list.rows.length ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.rows.length ? (
        <div className="card">
          <EmptyState
            icon={<BusFront size={26} />}
            title="No buses listed yet"
            message="Add your bus with its route and timings. Our team verifies it before passengers can see it."
            action={
              <Button icon={<Plus size={18} />} to="/owner/buses/new">
                Add your first bus
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* phones + tablets: cards */}
          <div className="own-bus-cards" style={{ opacity: list.loading ? 0.6 : 1 }}>
            {list.rows.map((bus) => (
              <article key={bus.id} className="own-bus-card card">
                <div className="own-bus-top">
                  <span className="icon-tile">
                    <BusFront size={20} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="fw-700 truncate">{bus.busNumber}</div>
                    <div className="text-sm text-muted truncate">{bus.busName || bus.operator || 'No bus name'}</div>
                  </div>
                  <StatusBadge value={bus.status} group="busStatus" />
                </div>
                <div className="own-bus-route">
                  {bus.route?.routeNumber ? <RouteBadge size="sm">{busBadge(bus)}</RouteBadge> : <MapPin size={15} className="text-accent" />}
                  <span className="truncate">{routeLabel(bus)}</span>
                </div>
                <div className="own-bus-meta">
                  <span>
                    <Route size={13} /> {bus.stopages?.length || 0} stops
                  </span>
                  <span>
                    <CalendarDays size={13} /> {formatServiceDays(bus.serviceDays)}
                  </span>
                  <span>
                    <FileText size={13} /> {bus.documents?.length || 0} {bus.documents?.length === 1 ? 'doc' : 'docs'}
                  </span>
                  <span>Submitted {formatDate(bus.submittedAt || bus.createdAt)}</span>
                </div>
                {bus.status === 'REJECTED' && (
                  <div className="alert alert-danger own-reject">
                    <XCircle size={16} />
                    <span>
                      <strong>Reason:</strong> {bus.rejectionReason || 'No reason given. Contact support for details.'}
                    </span>
                  </div>
                )}
                <BusActions
                  bus={bus}
                  compact
                  onDates={() => setDatesFor(bus)}
                  onDocs={() => setDocsFor(bus.id)}
                  onDelete={() => setDeleting(bus)}
                />
              </article>
            ))}
          </div>

          {/* desktop: table */}
          <div className="own-bus-table card" style={{ opacity: list.loading ? 0.6 : 1 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bus</th>
                    <th>Route</th>
                    <th>Service days</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((bus) => (
                    <tr key={bus.id}>
                      <td>
                        <div className="fw-700">{bus.busNumber}</div>
                        <div className="text-xs text-muted">{bus.busName || bus.operator || '—'}</div>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <div className="row" style={{ '--gap': '8px' }}>
                          {bus.route?.routeNumber && <RouteBadge size="sm">{busBadge(bus)}</RouteBadge>}
                          <span className="truncate">{routeLabel(bus)}</span>
                        </div>
                        <div className="text-xs text-muted">{bus.stopages?.length || 0} stops</div>
                      </td>
                      <td>{formatServiceDays(bus.serviceDays)}</td>
                      <td>
                        <StatusBadge value={bus.status} group="busStatus" />
                        {bus.status === 'REJECTED' && (
                          <div className="text-xs text-danger own-reject-inline" title={bus.rejectionReason || ''}>
                            {bus.rejectionReason || 'No reason given'}
                          </div>
                        )}
                      </td>
                      <td className="nowrap">{formatDate(bus.submittedAt || bus.createdAt)}</td>
                      <td>
                        <div className="own-table-actions">
                          <Link to={`/owner/buses/${bus.id}/edit`} className="icon-btn" aria-label={`Edit ${bus.busNumber}`} title="Edit">
                            <Pencil size={17} />
                          </Link>
                          <IconButton label="Non-operating dates" onClick={() => setDatesFor(bus)}>
                            <CalendarX2 size={17} />
                          </IconButton>
                          <IconButton label={`Documents (${bus.documents?.length || 0})`} onClick={() => setDocsFor(bus.id)} badge={bus.documents?.length || 0}>
                            <FileText size={17} />
                          </IconButton>
                          {bus.status === 'APPROVED' && (
                            <Link to={`/bus/${bus.id}`} className="icon-btn" aria-label="View as passengers see it" title="View as passengers see it">
                              <Eye size={17} />
                            </Link>
                          )}
                          <IconButton label="Delete" onClick={() => setDeleting(bus)} className="own-danger-icon">
                            <Trash2 size={17} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {list.meta?.totalPages > 1 && <Pagination meta={list.meta} onChange={list.setPage} noun="buses" />}
        </>
      )}

      <ExceptionsModal bus={datesFor} open={Boolean(datesFor)} onClose={() => setDatesFor(null)} isAdmin={isAdmin} />
      <DocumentsModal
        bus={docsBus}
        open={Boolean(docsBus)}
        onClose={() => setDocsFor(null)}
        onUploaded={(doc) => list.patchRow(docsFor, (r) => ({ documents: [...(r.documents || []), doc] }))}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this bus?"
        message={
          deleting
            ? `${deleting.busNumber}${deleting.busName ? ` (${deleting.busName})` : ''} and its timetable, documents and non-operating dates will be removed permanently. Passengers will no longer see it.`
            : ''
        }
        confirmLabel="Delete bus"
      />
    </div>
  )
}
