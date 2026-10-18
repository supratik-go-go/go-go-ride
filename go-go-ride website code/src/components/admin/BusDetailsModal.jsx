import { CalendarX, Clock, Gauge, MapPin, Pencil, Star } from 'lucide-react'
import { Button } from '../ui/Button'
import { RouteBadge, StatusBadge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/LoadingSpinner'
import { ErrorState } from '../ui/States'
import { useAsync } from '../../hooks/useAsync'
import { busService } from '../../services'
import { busBadge, formatDate, to12h } from '../../utils/format'
import { ApprovalActions } from './ApprovalActions'
import { BusRequestDetails, DetailSection } from './BusRequestDetails'
import { routeLabel } from './adminUtils'
import './admin-ui.css'

/**
 * Read-only bus details for admins (GET /buses/{id}): route, journey,
 * today's availability, service days, timetable, documents and
 * non-operating dates. Pending / under-review buses get approve / reject.
 *
 *   <BusDetailsModal busId={viewId} onClose={() => setViewId(null)} onChanged={(bus) => list.patchRow(bus.id, bus)} />
 */
export function BusDetailsModal({ busId, onClose, onChanged }) {
  const q = useAsync(() => (busId ? busService.get(busId) : Promise.resolve(null)), [busId])
  const bus = q.data
  const reviewable = bus && (bus.status === 'PENDING' || bus.status === 'UNDER_REVIEW')

  const changed = (updated) => {
    q.reload({ silent: true })
    onChanged?.(updated)
  }

  return (
    <Modal
      open={Boolean(busId)}
      onClose={onClose}
      size="lg"
      title={bus ? bus.busNumber : 'Bus details'}
      subtitle={bus?.busName}
      footer={
        <div className="adm-footer-row">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {bus && (
            <Button variant="soft" icon={<Pencil size={16} />} to={`/admin/buses/${bus.id}/edit`}>
              Edit bus
            </Button>
          )}
          {reviewable && <ApprovalActions bus={bus} variant="buttons" showReview onChanged={changed} />}
        </div>
      }
    >
      {q.loading && !bus ? (
        <div className="stack">
          <Skeleton height={72} radius={14} />
          <Skeleton height={140} radius={14} />
          <Skeleton height={160} radius={14} />
        </div>
      ) : q.error && !bus ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : bus ? (
        <>
          <div className="adm-headline-strip" style={{ marginBottom: 18 }}>
            <RouteBadge size="lg" muted={!bus.route?.routeNumber}>
              {busBadge(bus)}
            </RouteBadge>
            <div className="grow">
              <div className="fw-700">{routeLabel(bus)}</div>
              <div className="text-xs text-muted row wrap" style={{ '--gap': '10px' }}>
                {bus.journey?.departureTime && (
                  <span className="row" style={{ '--gap': '4px' }}>
                    <Clock size={13} /> {to12h(bus.journey.departureTime)} - {to12h(bus.journey.arrivalTime)}
                    {bus.journey.durationLabel ? ` (${bus.journey.durationLabel})` : ''}
                  </span>
                )}
                {bus.journey?.totalDistanceKm != null && (
                  <span className="row" style={{ '--gap': '4px' }}>
                    <Gauge size={13} /> {bus.journey.totalDistanceKm} km
                  </span>
                )}
                <span className="row" style={{ '--gap': '4px' }}>
                  <Star size={13} /> {Number(bus.ratingAvg || 0).toFixed(1)} ({bus.ratingCount || 0} reviews)
                </span>
              </div>
            </div>
            <StatusBadge value={bus.status} group="busStatus" withDot />
          </div>

          {bus.availability && (
            <div className={`alert ${bus.availability.isRunning ? 'alert-success' : 'alert-warning'}`} style={{ marginBottom: 18 }}>
              <MapPin size={18} />
              <div>
                <span className="fw-600">{bus.availability.isRunning ? 'Running today' : 'Not running today'}</span>
                {bus.availability.reason ? ` - ${bus.availability.reason}` : ''}
              </div>
            </div>
          )}

          <BusRequestDetails bus={bus}>
            <DetailSection title={`Non-operating dates (${bus.exceptions?.length || 0})`}>
              {bus.exceptions?.length ? (
                <ul className="adm-mini-list">
                  {bus.exceptions.map((ex) => (
                    <li key={ex.id}>
                      <CalendarX size={16} className="text-danger" />
                      <span className="fw-600">{formatDate(ex.date)}</span>
                      <span className="text-muted truncate">{ex.reason || 'No reason given'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No non-operating dates scheduled.</p>
              )}
            </DetailSection>
          </BusRequestDetails>
        </>
      ) : null}
    </Modal>
  )
}

export default BusDetailsModal
