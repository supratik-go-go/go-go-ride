import { AlertTriangle, ExternalLink, FileText, Info, XCircle } from 'lucide-react'
import { assetUrl } from '../../api/client'
import { RouteBadge } from '../ui/Badge'
import { busBadge, formatContact, formatCurrency, formatDateTime, formatPhone, label, LABELS, splitDays, to12h } from '../../utils/format'
import { isImageFile, routeLabel } from './adminUtils'
import './admin-ui.css'

const REQUIRED_DOCS = ['RC_BOOK', 'ROUTE_PERMIT', 'INSURANCE']
const DAYS = Object.keys(LABELS.day)

/** Section heading used inside drawers / modals. */
export function DetailSection({ title, children, aside }) {
  return (
    <section style={{ marginTop: 22 }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div className="adm-section-label" style={{ margin: 0 }}>
          {title}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Mon..Sun chips, active days highlighted. `value` is "MON,TUE" or an array. */
export function ServiceDays({ value }) {
  const on = new Set(splitDays(value))
  return (
    <div className="adm-days" aria-label="Service days">
      {DAYS.map((d) => (
        <span key={d} className={`adm-day ${on.has(d) ? 'on' : ''}`} title={on.has(d) ? 'Runs' : 'Does not run'}>
          {LABELS.day[d]}
        </span>
      ))}
    </div>
  )
}

/**
 * Uploaded bus documents: images as thumbnails, PDFs as file tiles; each
 * opens in a new tab. Warns when nothing (or a required type) is missing.
 */
export function DocumentGrid({ documents = [] }) {
  const have = new Set(documents.map((d) => d.docType))
  const missing = REQUIRED_DOCS.filter((t) => !have.has(t))
  if (!documents.length) {
    return (
      <div className="alert alert-warning">
        <AlertTriangle size={18} />
        <div>
          <div className="fw-600">No documents uploaded</div>
          Ask the owner for the RC book, route permit and insurance before approving.
        </div>
      </div>
    )
  }
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="adm-docs">
        {documents.map((doc) => {
          const url = assetUrl(doc.fileUrl)
          const image = isImageFile(doc.fileUrl) || isImageFile(doc.originalName)
          return (
            <a key={doc.id} className="adm-doc" href={url} target="_blank" rel="noopener noreferrer" title={`Open ${doc.originalName || label('docType', doc.docType)}`}>
              <div className={`adm-doc-thumb ${image ? '' : 'pdf'}`}>
                {image ? <img src={url} alt={label('docType', doc.docType)} loading="lazy" /> : <FileText size={34} />}
              </div>
              <div className="adm-doc-info">
                <span className="adm-doc-type">
                  {label('docType', doc.docType)} <ExternalLink size={12} className="text-muted" />
                </span>
                <span className="adm-doc-name">{doc.originalName || 'Document'}</span>
                {doc.uploadedAt && <span className="adm-doc-name">{formatDateTime(doc.uploadedAt)}</span>}
              </div>
            </a>
          )
        })}
      </div>
      {missing.length > 0 && (
        <div className="alert alert-info">
          <Info size={18} />
          <div>Not uploaded: {missing.map((t) => label('docType', t)).join(', ')}.</div>
        </div>
      )}
    </div>
  )
}

/** Vertical stop list with arrival / departure (12h) and distance. */
export function StopageTimeline({ stopages = [] }) {
  if (!stopages.length) return <p className="text-sm text-muted">No stopages added.</p>
  const last = stopages.length - 1
  return (
    <ol className="adm-timeline">
      {stopages.map((s, i) => {
        const same = s.arrivalTime === s.departureTime
        return (
          <li key={s.id || i} className={i === 0 ? 'is-start' : i === last ? 'is-end' : ''}>
            <span className="adm-tl-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="adm-tl-stop">{s.stop?.name || s.stopName}</div>
              <div className="adm-tl-sub">
                {[s.stop?.area, `${Number(s.distanceKm || 0).toFixed(1)} km`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="adm-tl-time">
              {same || i === 0 || i === last ? (
                <b>{i === 0 ? s.departureTime12h || to12h(s.departureTime) : s.arrivalTime12h || to12h(s.arrivalTime)}</b>
              ) : (
                <>
                  <div>
                    Arr <b>{s.arrivalTime12h || to12h(s.arrivalTime)}</b>
                  </div>
                  <div>
                    Dep <b>{s.departureTime12h || to12h(s.departureTime)}</b>
                  </div>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Fact({ label: text, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="adm-fact-label">{text}</div>
      <div className="adm-fact-value">{children ?? '-'}</div>
    </div>
  )
}

/**
 * Everything an admin needs to review a bus request: owner, vehicle facts,
 * rejection reason, service days, stopages and documents. Works with a
 * /admin/bus-requests row or a GET /buses/{id} detail (uses `timetable` when present).
 * `children` render after the facts (e.g. extra sections from the caller).
 */
export function BusRequestDetails({ bus, children, showOwner = true }) {
  if (!bus) return null
  const stops = bus.timetable?.length ? bus.timetable : bus.stopages || []
  return (
    <div>
      {bus.status === 'REJECTED' && bus.rejectionReason && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <XCircle size={18} />
          <div>
            <div className="fw-600">Rejected</div>
            {bus.rejectionReason}
          </div>
        </div>
      )}

      <div className="adm-facts">
        {showOwner && (
          <Fact label="Owner">
            {bus.owner?.name || '-'}
            {bus.owner?.phone && (
              <div className="text-xs fw-500">
                <a href={`tel:${bus.owner.phone}`}>{formatPhone(bus.owner.phone)}</a>
              </div>
            )}
            {bus.owner?.email && (
              <div className="text-xs fw-500">
                <a href={`mailto:${bus.owner.email}`}>{bus.owner.email}</a>
              </div>
            )}
          </Fact>
        )}
        <Fact label="Route">
          <span className="row" style={{ '--gap': '6px', display: 'inline-flex', flexWrap: 'wrap' }}>
            {bus.route?.routeNumber && <RouteBadge size="sm">{busBadge(bus)}</RouteBadge>}
            {routeLabel(bus)}
          </span>
          {!bus.route && <div className="text-xs text-muted fw-500">Not linked to a route yet</div>}
        </Fact>
        <Fact label="Bus name">{bus.busName}</Fact>
        <Fact label="Operator">{bus.operator}</Fact>
        <Fact label="Type · Category">
          {label('busType', bus.type)} · {label('busCategory', bus.category)}
        </Fact>
        <Fact label="Seats">{bus.totalSeats}</Fact>
        <Fact label="Fare">{formatCurrency(bus.fare, true)}</Fact>
        <Fact label="Contact">
          {bus.contactNumber ? <a href={`tel:${bus.contactNumber}`}>{formatContact(bus.contactNumber)}</a> : '-'}
          {bus.contactStart && bus.contactEnd && (
            <div className="text-xs text-muted fw-500">
              {to12h(bus.contactStart)} - {to12h(bus.contactEnd)}
            </div>
          )}
        </Fact>
        <Fact label="Submitted">{formatDateTime(bus.submittedAt || bus.createdAt)}</Fact>
        {bus.reviewedAt && <Fact label="Last reviewed">{formatDateTime(bus.reviewedAt)}</Fact>}
      </div>

      <DetailSection title="Service days">
        <ServiceDays value={bus.serviceDays} />
      </DetailSection>

      {children}

      <DetailSection title={`Stopages (${stops.length})`}>
        <StopageTimeline stopages={stops} />
      </DetailSection>

      <DetailSection title={`Documents (${bus.documents?.length || 0})`}>
        <DocumentGrid documents={bus.documents} />
      </DetailSection>
    </div>
  )
}

export default BusRequestDetails
