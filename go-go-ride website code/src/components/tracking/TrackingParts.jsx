import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { BusFront, Info, Satellite } from 'lucide-react'
import { useNow } from '../../hooks/useInterval'
import { formatDistance } from '../../services/locationService'
import { secondsAgo, stopState } from './trackingUtils'
import './tracking.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/** Mandatory notice: positions are computed from the timetable, not GPS. */
export function TrackingDisclaimer({ variant = 'banner', className }) {
  if (variant === 'strip') {
    return (
      <div className={cx('trk-strip', className)} role="note">
        <Satellite size={14} />
        <span>Estimated from timetable — live GPS not available yet</span>
      </div>
    )
  }
  return (
    <div className={cx('trk-disclaimer', className)} role="note">
      <Info size={18} />
      <div>
        <strong>Estimated position.</strong> GO-GO Ride doesn&apos;t receive live GPS from buses yet. Positions and arrival times are
        calculated from the published timetable, so real traffic and delays are not reflected.
      </div>
    </div>
  )
}

/** Horizontal trip progress bar (0..1). */
export function TripProgress({ value = 0, label, right }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className="trk-progress">
      {(label || right) && (
        <div className="trk-progress-top">
          <span>{label}</span>
          <span className="tabular">{right ?? `${pct}%`}</span>
        </div>
      )}
      <div className="trk-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Trip progress">
        <div className="trk-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** "Updated 4 s ago" - re-renders itself every second without touching the parent. */
export function UpdatedAgo({ at, prefix = 'Updated' }) {
  const now = useNow(1000)
  return (
    <span className="trk-updated" aria-live="off">
      <span className="trk-live-dot" aria-hidden="true" />
      {prefix} {secondsAgo(at, now)}
    </span>
  )
}

/**
 * Vertical stop timeline with passed / current / next / upcoming styling.
 * `fromId` / `toId` tag the passenger's boarding and drop stops.
 */
export function StopTimeline({ estimate, fromId, toId, compact }) {
  if (!estimate?.stops?.length) return null
  const { stops, status, currentIndex, segmentProgress } = estimate
  const last = stops.length - 1
  return (
    <ol className={cx('trk-timeline', compact && 'compact')}>
      {stops.map((s, i) => {
        const state = stopState(estimate, i)
        const time = i === 0 ? s.departureTime12h || s.arrivalTime12h : s.arrivalTime12h
        const showDep = i > 0 && i < last && s.departureTime12h && s.departureTime12h !== s.arrivalTime12h
        return (
          <li key={`${s.id}-${i}`} className={cx('trk-tl-item', `is-${state}`, i === last && 'is-last')}>
            <span className="trk-tl-rail" aria-hidden="true">
              <span className="trk-tl-dot" />
            </span>
            <div className="trk-tl-body">
              <div className="trk-tl-name">
                <span className="truncate">{s.name}</span>
                {fromId && s.id === fromId && <span className="trk-tag board">Your stop</span>}
                {toId && s.id === toId && <span className="trk-tag alight">Drop</span>}
                {state === 'current' && <span className="trk-tag here">Bus here</span>}
                {state === 'next' && status !== 'NOT_STARTED' && <span className="trk-tag next">Next</span>}
              </div>
              <div className="trk-tl-sub">
                {i === 0 ? 'Start point' : i === last ? 'End point' : showDep ? `Leaves ${s.departureTime12h}` : ' '}
                {s.distanceKm > 0 && <span> · {formatDistance(s.distanceKm)}</span>}
              </div>
            </div>
            <div className="trk-tl-time tabular">
              {time || '--'}
              {state === 'passed' && <span className="trk-tl-done">Passed</span>}
            </div>
            {status === 'MOVING' && i === currentIndex && (
              <div className="trk-tl-bus" style={{ '--seg': segmentProgress }}>
                <span className="trk-tl-bus-icon">
                  <BusFront size={13} />
                </span>
                <span>Bus between stops (estimated)</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Fit the map to points whenever `trigger` changes (not on every point update). */
export function FitOnTrigger({ points, trigger, padding = 48, maxZoom = 15 }) {
  const map = useMap()
  const pointsRef = useRef(points)
  pointsRef.current = points
  useEffect(() => {
    if (!trigger) return
    const pts = (pointsRef.current || []).filter(Boolean).map((p) => [p.lat, p.lng])
    if (!pts.length) return
    if (pts.length === 1) map.setView(pts[0], maxZoom, { animate: true })
    else map.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom, animate: true })
  }, [trigger, map, padding, maxZoom])
  return null
}
