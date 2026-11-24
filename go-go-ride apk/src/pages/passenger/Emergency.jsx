import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ambulance,
  Baby,
  BadgePlus,
  ChevronRight,
  Flame,
  HeartHandshake,
  Headset,
  MapPin,
  Phone,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  Smile,
  TrainFront,
  Users,
  X,
} from 'lucide-react'
import { Button, Input, Modal, PageHeader, useToast } from '../../components/ui'
import { useRequireLogin } from '../../components/passenger'
import { communityService, platformService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import './passenger.css'
import './extras.css'

// National numbers work anywhere in India, West Bengal included. Local police stations are sent in
// by users and only listed once an admin has checked them.
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

const matches = (search, ...texts) => !search || texts.some((t) => String(t || '').toLowerCase().includes(search))

function CallRow({ number, title, text, icon: Icon, tone }) {
  return (
    <a href={`tel:${number.replace(/[^\d+]/g, '')}`} className="px-x-call" aria-label={`Call ${number}, ${title}. ${text}`}>
      <span className={`icon-tile ${tone}`} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="px-x-call-text">
        <span className="px-x-call-title">{title}</span>
        <span className="px-x-call-sub">{text}</span>
      </span>
      <span className="px-x-call-no">
        <Phone size={15} aria-hidden="true" />
        {number.length > 6 ? 'Call' : number}
      </span>
    </a>
  )
}

function AddPoliceModal({ open, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ stationName: '', area: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.stationName.trim().length < 2) errs.stationName = 'Enter the police station name'
    if (form.area.trim().length < 2) errs.area = 'Enter the area or town'
    if (form.phone.replace(/\D/g, '').length < 3) errs.phone = 'Enter the phone number'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await communityService.sendPoliceNumber(form)
      toast.success('Thank you! It will show here once our team checks it.')
      setForm({ stationName: '', area: '', phone: '' })
      onClose()
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add your local police station"
      subtitle="Our team checks every number before it is shown, because a wrong number is dangerous in an emergency."
      footer={
        <Button type="submit" form="px-police-form" block loading={busy} icon={<BadgePlus size={18} />}>
          Send for checking
        </Button>
      }
    >
      <form id="px-police-form" className="stack" style={{ '--gap': '12px' }} onSubmit={submit} noValidate>
        <Input label="Police station" required icon={<ShieldCheck size={18} />} placeholder="Howrah Police Station" value={form.stationName} onChange={set('stationName')} error={errors.stationName} maxLength={120} />
        <Input label="Area or town" required icon={<MapPin size={18} />} placeholder="Howrah" value={form.area} onChange={set('area')} error={errors.area} maxLength={120} />
        <Input label="Phone number" required type="tel" icon={<Phone size={18} />} placeholder="033 2638 4500" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
      </form>
    </Modal>
  )
}

export default function Emergency() {
  const settings = useAsync(() => platformService.settings(), [])
  const police = useAsync(() => communityService.policeNumbers(), [])
  const requireLogin = useRequireLogin()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const support = String(settings.data?.contactNumber || '').trim()
  const search = query.trim().toLowerCase()

  const services = SERVICES.filter((s) => matches(search, s.title, s.text, s.number, 'emergency'))
  const helplines = HELPLINES.filter((s) => matches(search, s.title, s.text, s.number, 'helpline'))
  const localPolice = useMemo(
    () => (police.data || []).filter((p) => matches(search, p.stationName, p.area, p.phone, 'police', 'local')),
    [police.data, search],
  )
  const showHero = matches(search, '112', 'national emergency', 'police fire ambulance')
  const showSupport = support && matches(search, 'go-go ride helpline', support)
  const nothing = !showHero && !services.length && !helplines.length && !localPolice.length && !showSupport

  return (
    <div className="px-page px-narrow">
      <PageHeader title="Emergency Call List" subtitle="Tap a number to call" />

      <div className="stack" style={{ '--gap': '18px' }}>
        <div className="px-x-search">
          <Input
            icon={<Search size={18} />}
            placeholder="Search: police, ambulance, women, your area…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search emergency numbers"
            enterKeyHint="search"
            suffix={
              query ? (
                <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={16} />
                </button>
              ) : null
            }
          />
        </div>

        {showHero && (
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
        )}

        {services.length > 0 && (
          <section className="px-x-group" aria-labelledby="px-x-services">
            <h2 id="px-x-services" className="px-x-h2">
              Emergency services
            </h2>
            {services.map((s) => (
              <CallRow key={s.number} {...s} />
            ))}
          </section>
        )}

        {(localPolice.length > 0 || !search) && (
          <section className="px-x-group" aria-labelledby="px-x-police">
            <div className="row-between">
              <h2 id="px-x-police" className="px-x-h2">
                Local police
              </h2>
              <button type="button" className="link-btn" onClick={() => requireLogin() && setAdding(true)}>
                <BadgePlus size={16} /> Add yours
              </button>
            </div>
            {localPolice.map((p) => (
              <CallRow key={p.id} number={p.phone} title={p.stationName} text={`${p.area} · ${p.phone}`} icon={Shield} tone="" />
            ))}
            {!localPolice.length && !police.loading && (
              <p className="text-sm text-muted">No local police numbers yet. Know your police station&apos;s number? Tap “Add yours”.</p>
            )}
          </section>
        )}

        {helplines.length > 0 && (
          <section className="px-x-group" aria-labelledby="px-x-helplines">
            <h2 id="px-x-helplines" className="px-x-h2">
              Helplines
            </h2>
            {helplines.map((s) => (
              <CallRow key={s.number} {...s} />
            ))}
          </section>
        )}

        {showSupport && (
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

        {nothing && (
          <p className="text-sm text-muted">
            Nothing matches “{query.trim()}”. In any emergency, call <a href="tel:112">112</a>.
          </p>
        )}

        {!search && (
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
        )}
      </div>

      <AddPoliceModal open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
