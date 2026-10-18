import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, CircleCheck, FileSearch, Hourglass, LifeBuoy, ShieldCheck, UserPlus, XCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { Button, useToast } from '../ui'
import { label } from '../../utils/format'
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

/** Shown to passengers / drivers who open the owner screens. */
export function OwnerGate() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const register = async () => {
    setBusy(true)
    await authService.logout()
    // React Router navigates inside a transition; clearing the user in the same
    // transition renders both together, so the auth guard never sees the
    // signed-out user on this (protected) page and bounces to /login.
    startTransition(() => {
      setUser(null)
      navigate('/register?role=BUS_OWNER', { replace: true })
    })
    toast.info('Signed out. Create your Bus Owner account to list buses.')
  }

  return (
    <div className="own-gate stack" style={{ '--gap': '16px' }}>
      <OwnerOnlyBanner>
        <p>
          Listing a bus needs a <strong>Bus Owner</strong> account. You&apos;re signed in as a{' '}
          <strong>{label('role', user?.role)}</strong>, which can search buses and set alarms but can&apos;t add buses.
        </p>
      </OwnerOnlyBanner>

      <div className="card card-pad stack" style={{ '--gap': '14px' }}>
        <h3 className="own-section-title">How to list your bus</h3>
        <ol className="own-gate-steps">
          <li>
            <span className="own-step-num">1</span>
            <div>
              <div className="fw-600">Create a Bus Owner account</div>
              <div className="text-sm text-muted">
                Account types can&apos;t be changed from the app, so register a separate Bus Owner account — ideally with the mobile number you use for your
                bus business.
              </div>
            </div>
          </li>
          <li>
            <span className="own-step-num">2</span>
            <div>
              <div className="fw-600">Add your bus and upload proof</div>
              <div className="text-sm text-muted">Bus details, route with stop timings, service days, and an RC book, permit or insurance document.</div>
            </div>
          </li>
          <li>
            <span className="own-step-num">3</span>
            <div>
              <div className="fw-600">We verify and publish it</div>
              <div className="text-sm text-muted">Our team checks your documents. Once approved, passengers can find your bus and call you for bookings.</div>
            </div>
          </li>
        </ol>
        <div className="own-gate-actions">
          <Button size="lg" icon={<UserPlus size={19} />} onClick={register} loading={busy}>
            Register as Bus Owner
          </Button>
          <Button size="lg" variant="outline" icon={<LifeBuoy size={18} />} to="/support">
            Contact support
          </Button>
        </div>
        <p className="text-xs text-muted">
          Registering signs you out of this account first. Want to keep using this number? Contact support and we&apos;ll help.
        </p>
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
