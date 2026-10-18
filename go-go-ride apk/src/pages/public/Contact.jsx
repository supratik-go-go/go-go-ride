import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock3, Copy, Headset, Mail, MessageSquareText, Send, UserRound } from 'lucide-react'
import { Button, Input, Select, Textarea, optionsFrom, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { platformService, supportService } from '../../services'
import { LABELS } from '../../utils/format'
import { PhoneInput } from '../auth/PhoneInput'
import { cleanPhone, serverFieldErrors, validateTicket } from '../auth/formUtils'
import { ContactDetails } from './publicShared'
import './public.css'

const EMPTY = { name: '', phone: '', email: '', category: 'GENERAL', subject: '', message: '' }

export default function Contact() {
  const { user } = useAuth()
  const toast = useToast()
  const settings = useAsync(() => platformService.settings(), [])
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [ticket, setTicket] = useState(null)

  // Prefill from the signed-in account (without overwriting anything typed).
  useEffect(() => {
    if (!user) return
    setForm((f) => ({
      ...f,
      name: f.name || user.name || '',
      phone: f.phone || cleanPhone(user.phone),
      email: f.email || user.email || '',
    }))
  }, [user])

  const set = (key) => (e) => {
    const value = typeof e === 'string' ? e : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = validateTicket(form)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const created = await supportService.create({
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim() || undefined,
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
      })
      setTicket(created)
      toast.success(`Ticket ${created.ticketRef} created`)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setTicket(null)
    setErrors({})
    setForm({ ...EMPTY, name: user?.name || '', phone: cleanPhone(user?.phone), email: user?.email || '' })
  }

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(ticket.ticketRef)
      toast.success('Ticket reference copied')
    } catch {
      toast.info(`Your ticket reference is ${ticket.ticketRef}`)
    }
  }

  return (
    <div className="pub-page">
      <section className="pub-banner-hero compact">
        <div className="container">
          <span className="pub-eyebrow light">
            <Headset size={14} /> Help &amp; contact
          </span>
          <h1>
            We&apos;re here to <span>help</span>
          </h1>
          <p>Questions about a bus, a booking or listing your vehicle? Send us a message and our Kolkata team will get back to you.</p>
        </div>
      </section>

      <section className="container pub-section-tight">
        <div className="pub-contact-grid">
          <aside className="stack" style={{ '--gap': '16px' }}>
            <div className="card card-pad-lg">
              <h2 className="section-title" style={{ marginBottom: 14 }}>
                Reach us directly
              </h2>
              <ContactDetails state={settings} />
            </div>
            <div className="card card-pad-lg stack" style={{ '--gap': '12px' }}>
              <div className="row" style={{ '--gap': '10px' }}>
                <span className="icon-tile sm accent">
                  <Clock3 size={17} />
                </span>
                <strong>What happens next</strong>
              </div>
              <ol className="pub-next-steps">
                <li>You get a ticket reference straight away.</li>
                <li>Our support team reviews it and replies by phone or email.</li>
                <li>
                  Signed-in riders can follow replies under <Link to="/support">Help &amp; Support</Link>.
                </li>
              </ol>
            </div>
          </aside>

          <div className="card card-pad-lg pub-contact-form">
            {ticket ? (
              <div className="pub-success" role="status">
                <span className="icon-tile lg round success">
                  <CheckCircle2 size={28} />
                </span>
                <h2>Message received</h2>
                <p className="text-muted">Thanks, {ticket.name.split(' ')[0]}. We&apos;ve created a support ticket and will reach you on {ticket.phone}.</p>
                <button type="button" className="pub-ticket-ref" onClick={copyRef} title="Copy reference">
                  <span className="text-xs text-muted">Ticket reference</span>
                  <strong>{ticket.ticketRef}</strong>
                  <Copy size={15} />
                </button>
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  <Button variant="outline" onClick={reset}>
                    Send another message
                  </Button>
                  {user ? (
                    <Button to="/support">View my tickets</Button>
                  ) : (
                    <Button to="/login?next=/support">Sign in to track it</Button>
                  )}
                </div>
              </div>
            ) : (
              <form className="stack" style={{ '--gap': '16px' }} onSubmit={submit} noValidate>
                <div>
                  <h2 className="section-title">Send us a message</h2>
                  <p className="text-sm text-muted">Fields marked * are required.</p>
                </div>
                <div className="pub-form-grid">
                  <Input
                    label="Your name"
                    icon={<UserRound size={18} />}
                    placeholder="Full name"
                    autoComplete="name"
                    maxLength={80}
                    value={form.name}
                    onChange={set('name')}
                    error={errors.name}
                    required
                  />
                  <PhoneInput value={form.phone} onChange={set('phone')} error={errors.phone} required />
                  <Input
                    label="Email (optional)"
                    type="email"
                    icon={<Mail size={18} />}
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={form.email}
                    onChange={set('email')}
                    error={errors.email}
                  />
                  <Select label="Topic" options={optionsFrom(LABELS.ticketCategory)} value={form.category} onChange={set('category')} error={errors.category} required />
                </div>
                <Input
                  label="Subject"
                  icon={<MessageSquareText size={18} />}
                  placeholder="e.g. S12 timing seems wrong"
                  maxLength={120}
                  value={form.subject}
                  onChange={set('subject')}
                  error={errors.subject}
                  required
                />
                <Textarea
                  label="Message"
                  placeholder="Tell us what happened - bus number, stop, date and time help us sort it out faster."
                  rows={5}
                  maxLength={2000}
                  value={form.message}
                  onChange={set('message')}
                  error={errors.message}
                  hint={`${form.message.length}/2000`}
                  required
                />
                <Button type="submit" size="lg" loading={busy} icon={<Send size={18} />} className="pub-submit">
                  Send message
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
