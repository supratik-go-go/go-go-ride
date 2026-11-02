import { BadgeCheck, CircleCheck, FileSearch, Hourglass, ShieldCheck, XCircle } from 'lucide-react'
import busSide from '../../assets/brand/bus-side.jpg'
import '../../pages/owner/owner.css'

const cx = (...c) => c.filter(Boolean).join(' ')

/** Design 08 hero: "For Bus Owners Only" with the verified-listing promise. */
export function OwnerOnlyBanner({ title = 'For Bus Owners Only', children, compact }) {
  return (
    <div className={cx('own-banner', compact && 'compact')}>
      <div className="own-banner-art" aria-hidden="true">
        <img src={busSide} alt="" draggable="false" />
        <span className="own-banner-shield">
          <ShieldCheck size={26} />
        </span>
      </div>
      <div className="own-banner-text">
        <h2>{title}</h2>
        {children || (
          <p>Only authorized bus owners can add their bus. We verify your details to keep our platform safe and reliable.</p>
        )}
        <div className="own-banner-pill">
          <CircleCheck size={18} />
          <span>All buses are verified before being listed on GO-GO Ride</span>
        </div>
      </div>
    </div>
  )
}

const STEPS = [
  { key: 'PENDING', icon: Hourglass, title: 'Pending', text: 'Submitted and waiting in the queue' },
  { key: 'UNDER_REVIEW', icon: FileSearch, title: 'Under review', text: 'Our team is checking your documents' },
  { key: 'APPROVED', icon: BadgeCheck, title: 'Approved', text: 'Live — passengers can find your bus' },
]

/** Pending → Under review → Approved explainer; highlights `status` when given. */
export function VerificationSteps({ status, compact }) {
  const rejected = status === 'REJECTED'
  const current = STEPS.findIndex((s) => s.key === status)
  return (
    <ol className={cx('own-steps', compact && 'compact')}>
      {STEPS.map((s, i) => {
        const Icon = rejected && i === 2 ? XCircle : s.icon
        const state = current < 0 ? '' : i < current ? 'done' : i === current ? 'current' : ''
        return (
          <li key={s.key} className={cx('own-step', state, rejected && i === 2 && 'rejected')}>
            <span className="own-step-icon">
              <Icon size={18} />
            </span>
            <span className="own-step-text">
              <span className="fw-600">{rejected && i === 2 ? 'Rejected' : s.title}</span>
              {!compact && <span className="text-xs text-muted">{rejected && i === 2 ? 'Fix the issue and contact support' : s.text}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
