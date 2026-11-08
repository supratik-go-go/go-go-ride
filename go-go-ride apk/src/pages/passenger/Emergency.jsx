import { Link } from 'react-router-dom'
import { Ambulance, Baby, ChevronRight, Flame, HeartHandshake, Headset, Phone, Shield, Siren, Smile, TrainFront, Users } from 'lucide-react'
import { PageHeader } from '../../components/ui'
import { platformService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import './passenger.css'
import './extras.css'

// National numbers only: they work anywhere in India, West Bengal included.
// Local police station and hospital numbers change too often to list safely.
const SERVICES = [
  { number: '100', title: 'Police', text: 'Crime, threats or someone in danger', icon: Shield, tone: '' },
  { number: '101', title: 'Fire', text: 'Fire, smoke or someone trapped', icon: Flame, tone: 'accent' },
  { number: '108', title: 'Ambulance', text: 'Accidents and medical emergencies', icon: Ambulance, tone: 'danger' },
  { number: '102', title: 'Ambulance', text: 'For pregnant women and infants', icon: Baby, tone: 'success' },
]

const HELPLINES = [
  { number: '1091', title: 'Women Helpline', text: 'A woman in distress or being harassed', icon: HeartHandshake, tone: 'accent' },
  { number: '1098', title: 'Child Helpline', text: 'A child who is lost, hurt or in danger', icon: Smile, tone: 'warning' },
  { number: '139', title: 'Railway Help', text: 'Safety or medical help on a train or at a station', icon: TrainFront, tone: '' },
]

function CallRow({ number, title, text, icon: Icon, tone }) {
  return (
    <a href={`tel:${number}`} className="px-x-call" aria-label={`Call ${number}, ${title}. ${text}`}>
      <span className={`icon-tile ${tone}`} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="px-x-call-text">
        <span className="px-x-call-title">{title}</span>
        <span className="px-x-call-sub">{text}</span>
      </span>
      <span className="px-x-call-no">
        <Phone size={15} aria-hidden="true" />
        {number}
      </span>
    </a>
  )
}

export default function Emergency() {
  const settings = useAsync(() => platformService.settings(), [])
  const support = String(settings.data?.contactNumber || '').trim()

  return (
    <div className="px-page px-narrow">
      <PageHeader title="Emergency Call List" subtitle="Tap a number to call" />

      <div className="stack" style={{ '--gap': '18px' }}>
        <a href="tel:112" className="px-x-hero" aria-label="Call 112, National Emergency Number. Police, fire and ambulance.">
          <span className="px-x-hero-top">
            <span className="px-x-hero-icon" aria-hidden="true">
              <Siren size={28} />
            </span>
            <span className="px-x-hero-head">
              <span className="px-x-hero-label">National Emergency Number</span>
              <span className="px-x-hero-no">112</span>
            </span>
          </span>
          <span className="px-x-hero-text">Police, fire and ambulance in one call. Works anywhere in India.</span>
          <span className="btn btn-danger btn-lg btn-block" aria-hidden="true">
            <Phone size={20} /> Call 112
          </span>
        </a>

        <section className="px-x-group" aria-labelledby="px-x-services">
          <h2 id="px-x-services" className="px-x-h2">
            Emergency services
          </h2>
          {SERVICES.map((s) => (
            <CallRow key={s.number} {...s} />
          ))}
        </section>

        <section className="px-x-group" aria-labelledby="px-x-helplines">
          <h2 id="px-x-helplines" className="px-x-h2">
            Helplines
          </h2>
          {HELPLINES.map((s) => (
            <CallRow key={s.number} {...s} />
          ))}
        </section>

        {support && (
          <section className="px-x-group" aria-labelledby="px-x-support">
            <h2 id="px-x-support" className="px-x-h2">
              GO-GO Ride
            </h2>
            <a href={`tel:${support.replace(/\s/g, '')}`} className="px-x-call" aria-label={`Call GO-GO Ride helpline, ${support}`}>
              <span className="icon-tile" aria-hidden="true">
                <Headset size={22} />
              </span>
              <span className="px-x-call-text">
                <span className="px-x-call-title">GO-GO Ride Helpline</span>
                <span className="px-x-call-sub">{support} · questions about the app, buses or routes. Not for emergencies.</span>
              </span>
              <span className="px-x-call-no">
                <Phone size={15} aria-hidden="true" />
                Call
              </span>
            </a>
          </section>
        )}

        <Link to="/sos" className="card px-x-link">
          <span className="icon-tile danger" aria-hidden="true">
            <Users size={22} />
          </span>
          <span className="px-x-call-text">
            <span className="px-x-call-title">Set up SOS 1 Click Help</span>
            <span className="px-x-call-sub">Save up to 5 family members or friends. One tap texts them where you are.</span>
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
