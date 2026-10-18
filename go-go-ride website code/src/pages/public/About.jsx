import { Link } from 'react-router-dom'
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  BusFront,
  CarFront,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Heart,
  MapPinned,
  Navigation,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { Button } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import busSide from '../../assets/brand/bus-side.jpg'
import { PlatformStats } from './publicShared'
import './public.css'

const OFFERS = [
  {
    icon: Search,
    tone: '',
    title: 'Bus timetables & search',
    text: 'Search by stops, route or bus number and see every bus that runs between them - with stop-by-stop timings, fares and service days.',
  },
  {
    icon: AlarmClock,
    tone: 'accent',
    title: 'Arrival alarms',
    text: 'Pick your bus, boarding and destination stops, and we remind you 30, 15 or 5 minutes before it reaches you - or right as it arrives.',
  },
  {
    icon: Navigation,
    tone: 'success',
    title: 'Estimated tracking',
    text: 'See where a bus should be right now, worked out from its published timetable. Honest estimates, clearly labelled - no fake GPS dots.',
  },
  {
    icon: CarFront,
    tone: 'violet',
    title: 'Running Car (shared rides)',
    text: 'Share a car, auto or bike going your way and split the fare. Book seats on rides that drivers publish for your route.',
  },
  {
    icon: Phone,
    tone: 'warning',
    title: 'Local cars - call & book',
    text: 'Find drivers in your area with their availability and ratings, and call them directly. No middleman, no surge.',
  },
  {
    icon: BusFront,
    tone: '',
    title: 'For bus owners',
    text: 'List your bus with its route, timetable and documents. Once approved, riders across the city can find it - and you can mark non-operating days.',
  },
]

const STEPS = [
  { icon: Upload, title: 'Owner submits', text: 'Bus number, route, timetable and service days - with RC book, route permit and insurance documents.' },
  { icon: FileCheck2, title: 'Documents checked', text: 'Our admin team reviews the documents and the timetable before anything goes public.' },
  { icon: BadgeCheck, title: 'Approved & listed', text: 'Only approved buses appear in search. Rejections always come with a reason the owner can fix.' },
  { icon: RefreshCw, title: 'Re-reviewed on change', text: 'When an owner edits an approved bus, it goes back to review - so timings stay trustworthy.' },
]

const PROMISES = [
  { icon: Clock3, title: 'Accurate timetables', text: 'Every timing comes from the operator and is reviewed before it goes live.' },
  { icon: ShieldCheck, title: 'Verified listings', text: 'Buses are approved by our team; local drivers earn a Verified badge.' },
  { icon: Heart, title: 'Built for locals', text: 'Designed around how Kolkata actually commutes - buses, autos, totos and cars.' },
]

export default function About() {
  const { user } = useAuth()
  const listBusHref = user ? (user.role === 'BUS_OWNER' ? '/owner/buses/new' : '/owner/buses') : '/register?role=BUS_OWNER'

  return (
    <div className="pub-page">
      <section className="pub-banner-hero">
        <div className="container pub-banner-hero-grid">
          <div>
            <span className="pub-eyebrow light">
              <MapPinned size={14} /> About GO-GO Ride
            </span>
            <h1>
              Local travel in West Bengal, made <span>simple and predictable</span>
            </h1>
            <p>
              GO-GO Ride brings bus timetables, arrival alarms, shared rides and trusted local drivers together in one app - so you spend less time waiting at the stop and more time
              getting where you need to be.
            </p>
            <div className="row wrap" style={{ marginTop: 22 }}>
              <Button to="/search" variant="accent" size="lg" icon={<Search size={18} />}>
                Search buses
              </Button>
              <Button to="/contact" variant="white" size="lg">
                Talk to us
              </Button>
            </div>
          </div>
          <div className="pub-banner-hero-art" aria-hidden="true">
            <img src={busSide} alt="" />
          </div>
        </div>
      </section>

      <section className="container pub-section">
        <div className="pub-mission">
          <div>
            <span className="pub-kicker">Our mission</span>
            <h2 className="pub-h2">Your journey, our responsibility</h2>
            <p className="text-2" style={{ marginTop: 12 }}>
              Lakhs of people in Kolkata and across West Bengal ride local buses every day, yet finding out which bus goes where - and when - still means asking around at
              the stop. We are building the dependable, local-first transport companion we always wanted: accurate timings, timely reminders and honest information.
            </p>
            <p className="text-2" style={{ marginTop: 10 }}>
              We work with bus owners and drivers directly, review every listing, and only show what we can stand behind.
            </p>
          </div>
          <div className="pub-promises">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="pub-promise">
                <span className="icon-tile">
                  <Icon size={20} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-section pub-tinted">
        <div className="container">
          <div className="pub-section-head">
            <span className="pub-kicker">What we offer</span>
            <h2 className="pub-h2">Everything for the daily commute</h2>
          </div>
          <div className="pub-offers">
            {OFFERS.map(({ icon: Icon, tone, title, text }) => (
              <article key={title} className="card card-pad card-hover pub-offer">
                <span className={`icon-tile lg ${tone}`}>
                  <Icon size={24} />
                </span>
                <h3>{title}</h3>
                <p className="text-sm text-muted">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container pub-section">
        <div className="pub-section-head">
          <span className="pub-kicker">Trust &amp; safety</span>
          <h2 className="pub-h2">How verification works</h2>
          <p className="text-muted">Every bus you see on GO-GO Ride has been checked by a person, not just a form.</p>
        </div>
        <ol className="pub-steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="pub-step">
              <span className="pub-step-num">{i + 1}</span>
              <span className="icon-tile">
                <Icon size={20} />
              </span>
              <strong>{title}</strong>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
        <div className="soft-panel row" style={{ marginTop: 18, alignItems: 'flex-start' }}>
          <ClipboardCheck size={20} className="text-primary" style={{ flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm text-2">
            <strong>Local car drivers</strong> can list themselves straight away, and earn a <strong>Verified</strong> badge once our team has checked their details. Ratings
            and reviews come from riders who have used them.
          </p>
        </div>
      </section>

      <section className="container pub-section-tight">
        <div className="pub-stats-wrap">
          <div>
            <span className="pub-kicker">GO-GO Ride today</span>
            <h2 className="pub-h2">Growing with every new route</h2>
          </div>
          <PlatformStats />
        </div>
      </section>

      <section className="container pub-section">
        <div className="pub-cta">
          <div>
            <h2>Ready for a smarter commute?</h2>
            <p>Find your bus in seconds, or list yours and reach riders across the city.</p>
          </div>
          <div className="row wrap">
            <Button to="/search" variant="accent" size="lg" iconRight={<ArrowRight size={18} />}>
              Find a bus
            </Button>
            <Button to={listBusHref} variant="white" size="lg" icon={<BusFront size={18} />}>
              List your bus
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
          Questions? <Link to="/contact">Contact our team</Link>
        </p>
      </section>
    </div>
  )
}
