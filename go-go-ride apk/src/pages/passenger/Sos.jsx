import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Info, MapPinOff, MessageCircle, MessageSquareText, Phone, PhoneCall, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Avatar, Button, Card, ConfirmDialog, Input, PageHeader, Spinner, useToast } from '../../components/ui'
import { locationService } from '../../services'
import { formatPhone } from '../../utils/format'
import './passenger.css'
import './extras.css'

const STORAGE_KEY = 'gogo.sosContacts'
const MAX_CONTACTS = 5
// A position younger than this is good enough to send without asking GPS again.
const FRESH_MS = 2 * 60 * 1000

// Contacts never leave the phone, so every read and write is local and may fail
// (private mode, storage full); the screen keeps working either way.
function loadContacts() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!Array.isArray(list)) return []
    return list.filter((c) => c && typeof c.name === 'string' && /^[6-9]\d{9}$/.test(c.phone)).slice(0, MAX_CONTACTS)
  } catch {
    return []
  }
}

function saveContacts(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** A 10-digit Indian mobile number, or null. Accepts +91 / 0 prefixes and spaces. */
function normalisePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

const mapLink = (pos) => `https://maps.google.com/?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`

const sosMessage = (pos) =>
  pos ? `SOS! I need help. My location: ${mapLink(pos)} - sent from GO-GO Ride` : 'SOS! I need help. - sent from GO-GO Ride'

// Android SMS apps take several recipients separated by commas.
const smsUri = (contacts, text) => `sms:${contacts.map((c) => `+91${c.phone}`).join(',')}?body=${encodeURIComponent(text)}`

const whatsappUri = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`

// The Android app hands sms:, tel: and outside links to the matching phone app.
const openExternal = (url) => {
  window.location.href = url
}

export default function Sos() {
  const toast = useToast()
  const [contacts, setContacts] = useState(loadContacts)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)
  const [locating, setLocating] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [sent, setSent] = useState(null) // { sms, located }
  const [askAdd, setAskAdd] = useState(false)
  const fix = useRef(null) // { pos, at }
  const formRef = useRef(null)
  const nameRef = useRef(null)

  // Warm up the location while the person reads the screen, so SOS can go out
  // at once. Only when permission is already given: never prompt on arrival.
  useEffect(() => {
    let alive = true
    locationService.permissionState().then((state) => {
      if (!alive || state !== 'granted') return
      locationService
        .getCurrentPosition({ timeout: 15000 })
        .then((pos) => {
          fix.current = { pos, at: Date.now() }
        })
        .catch(() => {})
    })
    return () => {
      alive = false
    }
  }, [])

  /** Best position we can get quickly, or null. Never throws. */
  const getFix = async () => {
    if (fix.current && Date.now() - fix.current.at < FRESH_MS) return fix.current.pos
    try {
      const pos = await locationService.getCurrentPosition({ timeout: 6000 })
      fix.current = { pos, at: Date.now() }
      return pos
    } catch {
      return null
    }
  }

  /** Update the list; returns false (after warning) when the phone refused to save it. */
  const persist = (list) => {
    setContacts(list)
    if (saveContacts(list)) return true
    toast.warning('This phone would not let us save the list, so the change will be lost when you close the app.')
    return false
  }

  const showAddForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    nameRef.current?.focus({ preventScroll: true })
  }

  const pressSos = async () => {
    if (locating) return
    if (!contacts.length) {
      setAskAdd(true)
      return
    }
    setLocating(true)
    const pos = await getFix()
    setLocating(false)
    const sms = smsUri(contacts, sosMessage(pos))
    setSent({ sms, located: Boolean(pos) })
    openExternal(sms)
  }

  const shareWhatsApp = async () => {
    if (sharing) return
    setSharing(true)
    const pos = await getFix()
    setSharing(false)
    openExternal(whatsappUri(sosMessage(pos)))
  }

  const addContact = (e) => {
    e.preventDefault()
    const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 40)
    const digits = normalisePhone(phone)
    const next = {}
    if (!cleanName) next.name = 'Enter a name, for example Maa or Dada.'
    if (!digits) next.phone = 'Enter a 10-digit mobile number.'
    else if (contacts.some((c) => c.phone === digits)) next.phone = 'This number is already in your list.'
    setErrors(next)
    if (next.name || next.phone) return
    const saved = persist([...contacts, { name: cleanName, phone: digits }])
    setName('')
    setPhone('')
    setAskAdd(false)
    if (saved) toast.success(`${cleanName} will get your SOS messages`)
  }

  const removeContact = (contact) => {
    if (persist(contacts.filter((c) => c.phone !== contact.phone))) toast.success(`Removed ${contact.name}`)
  }

  const who = contacts.length === 1 ? contacts[0].name : `your ${contacts.length} contacts`
  const full = contacts.length >= MAX_CONTACTS

  return (
    <div className="px-page px-narrow">
      <PageHeader title="SOS 1 Click Help" subtitle="Text your location to people you trust" />

      <div className="stack" style={{ '--gap': '16px' }}>
        <section className="card px-x-sos" aria-labelledby="px-x-sos-title">
          <h2 id="px-x-sos-title" className="px-x-sos-title">
            Need help now?
          </h2>

          <div className="px-x-sos-wrap">
            <button type="button" className="btn btn-danger px-x-sos-btn" onClick={pressSos} aria-busy={locating} aria-describedby="px-x-sos-hint">
              {locating ? <Spinner size={40} /> : <span className="px-x-sos-word">SOS</span>}
              <span className="px-x-sos-small">{locating ? 'Getting your location…' : 'Tap for help'}</span>
            </button>
          </div>

          <p id="px-x-sos-hint" className="px-x-sos-hint">
            {contacts.length
              ? `Opens your SMS app with your location, ready to send to ${who}. Then tap Send.`
              : 'First add someone you trust below, so SOS knows who to text.'}
          </p>

          {askAdd && !contacts.length && (
            <div className="alert alert-warning px-x-alert" role="alert">
              <Info size={18} />
              <div className="grow">
                <div className="fw-600">No SOS contacts yet</div>
                <div>SOS texts your location to family or friends you choose. Add one below. If you are in danger right now, call 112.</div>
                <div className="px-x-alert-actions">
                  <Button href="tel:112" variant="danger" size="sm" icon={<Phone size={15} />}>
                    Call 112
                  </Button>
                  <Button variant="outline" size="sm" icon={<UserPlus size={15} />} onClick={showAddForm}>
                    Add a contact
                  </Button>
                </div>
              </div>
            </div>
          )}

          {sent && (
            <div className={`alert ${sent.located ? 'alert-success' : 'alert-warning'} px-x-alert`} role="status">
              {sent.located ? <MessageSquareText size={18} /> : <MapPinOff size={18} />}
              <div className="grow">
                <div className="fw-600">Your message is ready. Tap Send in your SMS app.</div>
                <div>
                  {sent.located
                    ? 'It has a map link to where you are now.'
                    : 'We could not find your location, so the message has no map link. Tell them where you are, or call 112.'}
                </div>
                <div className="px-x-alert-actions">
                  <Button href={sent.sms} variant="outline" size="sm" icon={<MessageSquareText size={15} />}>
                    Open SMS again
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="px-x-sos-actions">
            <Button href="tel:112" variant="outline-danger" size="lg" block icon={<PhoneCall size={20} />}>
              Call 112
            </Button>
            <Button variant="success" size="lg" block icon={<MessageCircle size={20} />} onClick={shareWhatsApp} loading={sharing}>
              Share on WhatsApp
            </Button>
          </div>
        </section>

        <Card pad={false} title="Your SOS contacts" subtitle={`${contacts.length} of ${MAX_CONTACTS} · kept on this phone only`}>
          {contacts.length > 0 && (
            <ul className="px-x-contacts">
              {contacts.map((c) => (
                <li key={c.phone} className="px-x-contact">
                  <Avatar name={c.name} size={42} />
                  <div className="grow">
                    <div className="fw-600 truncate">{c.name}</div>
                    <div className="text-sm text-muted tabular">{formatPhone(c.phone)}</div>
                  </div>
                  <a href={`tel:+91${c.phone}`} className="px-x-round call" aria-label={`Call ${c.name}`} title="Call">
                    <Phone size={18} />
                  </a>
                  <button type="button" className="px-x-round remove" onClick={() => setRemoving(c)} aria-label={`Remove ${c.name}`} title="Remove">
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {full ? (
            <p className="px-x-card-note">You have {MAX_CONTACTS} contacts, the most SOS can text at once. Remove one to add someone else.</p>
          ) : (
            <form ref={formRef} className="px-x-add" onSubmit={addContact} noValidate>
              <Input
                ref={nameRef}
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maa, Dada, Riya"
                error={errors.name}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="words"
              />
              <Input
                label="Mobile number"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                icon={<span className="px-x-cc">+91</span>}
                error={errors.phone}
                maxLength={16}
                autoComplete="off"
              />
              <Button type="submit" block icon={<UserPlus size={18} />}>
                Add contact
              </Button>
            </form>
          )}
        </Card>

        <Card title="How SOS works">
          <ol className="px-x-steps">
            <li>Add up to {MAX_CONTACTS} people you trust: family, friends or neighbours.</li>
            <li>When you are in trouble, tap the red SOS button.</li>
            <li>Your SMS app opens with “SOS! I need help” and a map link to where you are.</li>
            <li>Tap Send. Normal SMS charges may apply.</li>
          </ol>
        </Card>

        <p className="px-x-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            Your SOS contacts stay on this phone only. They are never uploaded to GO-GO Ride, so add them again if you change phones or clear the
            app&apos;s data.
          </span>
        </p>

        <Link to="/emergency" className="card px-x-link">
          <span className="icon-tile danger" aria-hidden="true">
            <Phone size={22} />
          </span>
          <span className="px-x-call-text">
            <span className="px-x-call-title">Emergency Call List</span>
            <span className="px-x-call-sub">Police, fire, ambulance and helplines, one tap to call.</span>
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => removeContact(removing)}
        title="Remove this contact?"
        message={removing ? `${removing.name} will no longer get your SOS messages.` : ''}
        confirmLabel="Remove"
      />
    </div>
  )
}
