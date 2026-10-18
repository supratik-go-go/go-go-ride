import { Link } from 'react-router-dom'
import { AlarmClock, ArrowLeft, BusFront, CarTaxiFront, ShieldCheck } from 'lucide-react'
import { Logo } from '../../components/ui'
import heroBus from '../../assets/brand/hero-bus.jpg'
import './auth.css'

const POINTS = [
  { icon: BusFront, title: 'Bus timetables & search', text: 'Every stop, every timing - for routes across Kolkata.' },
  { icon: AlarmClock, title: 'Arrival alarms', text: 'Get reminded before your bus reaches your stop.' },
  { icon: CarTaxiFront, title: 'Rides & local cars', text: 'Shared Running Car rides and drivers you can call.' },
]

/**
 * Login / register screen frame.
 * Desktop: navy brand panel (left) + form (right). Phones: full-screen form with the logo on top.
 */
export function AuthShell({ title, subtitle, children, footer, wide, backTo = '/', backLabel = 'Back to home' }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-inner">
          <Link to="/" className="auth-brand-logo" tabIndex={-1}>
            <Logo height={54} />
          </Link>
          <h2 className="auth-brand-title">
            Your Journey,
            <br />
            Our <span>Responsibility</span>
          </h2>
          <p className="auth-brand-sub">Smart local transport for West Bengal - buses, alarms, shared rides and trusted local cars in one app.</p>
          <ul className="auth-brand-points">
            {POINTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t}>
                <span className="auth-brand-icon">
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{t}</strong>
                  <small>{text}</small>
                </span>
              </li>
            ))}
          </ul>
          <figure className="auth-brand-art">
            <img src={heroBus} alt="" />
          </figure>
          <p className="auth-brand-foot">
            <ShieldCheck size={15} /> Verified buses and drivers, reviewed by the GO-GO Ride team
          </p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-topbar">
          <Link to={backTo} className="auth-back">
            <ArrowLeft size={18} /> <span>{backLabel}</span>
          </Link>
        </div>
        <div className={`auth-panel ${wide ? 'wide' : ''}`}>
          <Link to="/" className="auth-mobile-logo" aria-label="GO-GO Ride home">
            <Logo height={74} />
          </Link>
          <header className="auth-head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
          {footer && <div className="auth-foot">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
