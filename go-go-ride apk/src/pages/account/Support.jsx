import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  CircleHelp,
  Headset,
  Inbox,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  Ticket,
  UserRound,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  SkeletonList,
  StatusBadge,
  Tabs,
  Textarea,
  optionsFrom,
  useToast,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { platformService, supportService } from '../../services'
import { LABELS, formatDateTime, label, statusTone, timeAgo } from '../../utils/format'
import { PhoneInput } from '../auth/PhoneInput'
import { cleanPhone, serverFieldErrors, validateTicket } from '../auth/formUtils'
import { AccountPage } from './accountShared'

const FAQS = [
  {
    q: 'How do I find a bus between two stops?',
    a: (
      <>
        On <Link to="/home">Home</Link>, enter where you are starting from and where you are going - pick stops from the suggestions for the most accurate results - and
        choose a date. You&apos;ll see every bus that runs between those stops in that direction, with the timings at your stops. You can also search by bus number or route
        number.
      </>
    ),
  },
  {
    q: 'Why does a bus say "Not running"?',
    a: 'Either the bus does not operate on that weekday, or its owner has declared that date as a non-operating day. Try another date from the date strip or look at the other buses on your route.',
  },
  {
    q: 'How do arrival alarms work?',
    a: (
      <>
        Open a bus, tap <strong>Set Alarm</strong>, then choose your boarding stop, destination, date and when to be reminded - 30, 15 or 5 minutes before, or as the bus
        arrives. The reminder time is worked out from the timetable at your boarding stop. Manage everything in <Link to="/alarms">My Alarms</Link>.
      </>
    ),
  },
  {
    q: 'Is the bus location on the map live GPS?',
    a: 'Not yet. GO-GO Ride shows an estimated position based on the published timetable, clearly marked as an estimate. Traffic can make a bus early or late, so use it as a guide and reach your stop a few minutes early.',
  },
  {
    q: 'How do I book or cancel a seat?',
    a: (
      <>
        Book from a bus or ride page and choose to pay cash on board or online. To cancel, open the booking in <Link to="/bookings">My Bookings</Link> and tap{' '}
        <strong>Cancel booking</strong>. Paid bookings are marked for a refund to the original payment method. Completed trips can&apos;t be cancelled.
      </>
    ),
  },
  {
    q: 'How can I list my bus on GO-GO Ride?',
    a: (
      <>
        <Link to="/register?role=BUS_OWNER">Register as a bus owner</Link>, then add your bus with its number, stops and timings, service days and documents (RC book, route
        permit, insurance). Our team reviews every submission - approved buses appear in search. Editing an approved bus sends it back for a quick review.
      </>
    ),
  },
  {
    q: 'How do local cars work?',
    a: (
      <>
        Browse <Link to="/local-cars">Local Cars</Link> to find drivers in your area with their availability and ratings, then call them directly to agree on your trip and
        fare. A <strong>Verified</strong> badge means our team has checked the driver&apos;s details.
      </>
    ),
  },
  {
    q: 'What is Running Car?',
    a: (
      <>
        <Link to="/running-car">Running Car</Link> lets you share a car, auto or bike that is already going your way and split the fare. Book a seat on a ride a driver
        has published for your route.
      </>
    ),
  },
  {
    q: "I didn't get my OTP",
    a: 'Check that the number is right, wait 30 seconds and tap Resend. Codes expire after 5 minutes. If you set a password, you can also sign in with the Password tab.',
  },
]

function TicketCard({ t }) {
  return (
    <article className="card acc-ticket">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ '--gap': '2px', minWidth: 0 }}>
          <span className="text-xs text-muted">
            <span className="acc-ref">{t.ticketRef}</span> · {timeAgo(t.createdAt)}
          </span>
          <strong>{t.subject}</strong>
        </div>
        <StatusBadge value={t.status} group="ticketStatus" />
      </div>
      <div className="row wrap" style={{ '--gap': '6px' }}>
        <Badge tone="neutral">{label('ticketCategory', t.category)}</Badge>
        {t.priority && t.priority !== 'NORMAL' && (
          <Badge tone={statusTone(t.priority) === 'danger' ? 'danger' : 'info'}>{label('ticketPriority', t.priority)} priority</Badge>
        )}
      </div>
      <p className="acc-ticket-msg" title={t.message}>
        {t.message}
      </p>
      {t.response ? (
        <div className="acc-reply">
          <Headset size={17} />
          <div>
            <strong>Reply from GO-GO Ride support</strong>
            <p>{t.response}</p>
          </div>
        </div>
      ) : (
        <span className="text-xs text-muted">
          {t.status === 'RESOLVED' || t.status === 'CLOSED' ? `Closed · raised ${formatDateTime(t.createdAt)}` : "We've got your ticket - our team will reply here and by phone."}
        </span>
      )}
    </article>
  )
}

export default function Support() {
  const { user } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = ['help', 'new', 'tickets'].includes(params.get('tab')) ? params.get('tab') : 'help'
  const settings = useAsync(() => platformService.settings(), [])
  const tickets = usePagedQuery(supportService.list, { limit: 10 })

  const [form, setForm] = useState(() => ({
    name: user?.name || '',
    phone: cleanPhone(user?.phone),
    email: user?.email || '',
    category: 'GENERAL',
    subject: '',
    message: '',
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const setTab = (v) => setParams(v === 'help' ? {} : { tab: v }, { replace: true })
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
      toast.success(`We'll get back to you soon.`, `Ticket ${created.ticketRef} created`)
      setForm((f) => ({ ...f, category: 'GENERAL', subject: '', message: '' }))
      tickets.setPage(1)
      tickets.reload()
      setTab('tickets')
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const s = settings.data
  const phoneHref = s?.contactNumber ? `tel:${String(s.contactNumber).replace(/[^\d+]/g, '')}` : null

  return (
    <AccountPage title="Help & Support">
      <div className="acc-help-hero">
        <span className="icon-tile lg round">
          <Headset size={26} />
        </span>
        <div className="grow">
          <h2>How can we help, {user?.name?.split(' ')[0] || 'there'}?</h2>
          <p>Browse common answers or raise a ticket - we reply by phone or email.</p>
        </div>
      </div>

      {settings.error && !s ? (
        <div className="alert alert-warning">
          <span className="grow">Contact details couldn&apos;t be loaded.</span>
          <button type="button" className="link-btn" onClick={() => settings.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="acc-quick">
          <a href={phoneHref || undefined} aria-disabled={!phoneHref} onClick={(e) => !phoneHref && e.preventDefault()}>
            <span className="icon-tile sm">
              <Phone size={17} />
            </span>
            <span style={{ minWidth: 0 }}>
              Call us
              <small>{settings.loading && !s ? 'Loading…' : s?.contactNumber || 'Not available'}</small>
            </span>
          </a>
          <a href={s?.platformEmail ? `mailto:${s.platformEmail}` : undefined} onClick={(e) => !s?.platformEmail && e.preventDefault()}>
            <span className="icon-tile sm accent">
              <Mail size={17} />
            </span>
            <span style={{ minWidth: 0 }}>
              Email us
              <small>{settings.loading && !s ? 'Loading…' : s?.platformEmail || 'Not available'}</small>
            </span>
          </a>
        </div>
      )}

      <Tabs
        className="acc-tabs"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'help', label: 'FAQs' },
          { value: 'new', label: 'Raise a ticket' },
          { value: 'tickets', label: 'My tickets', count: tickets.meta?.total },
        ]}
      />

      {tab === 'help' && (
        <>
          <Card pad={false} className="acc-faq">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>
                  <CircleHelp size={18} />
                  <span>{f.q}</span>
                  <ChevronDown size={18} />
                </summary>
                <div className="acc-faq-body">{f.a}</div>
              </details>
            ))}
          </Card>
          <div className="soft-panel row-between wrap">
            <span className="text-sm">
              <strong>Still stuck?</strong> Our team is happy to help.
            </span>
            <Button size="sm" icon={<MessageSquareText size={16} />} onClick={() => setTab('new')}>
              Raise a ticket
            </Button>
          </div>
        </>
      )}

      {tab === 'new' && (
        <Card>
          <form className="stack" style={{ '--gap': '16px' }} onSubmit={submit} noValidate>
            <div className="grid grid-2" style={{ '--gap': '16px' }}>
              <Input label="Your name" icon={<UserRound size={18} />} autoComplete="name" maxLength={80} value={form.name} onChange={set('name')} error={errors.name} required />
              <PhoneInput value={form.phone} onChange={set('phone')} error={errors.phone} hint="We'll call you back on this number." required />
            </div>
            <Select label="Topic" options={optionsFrom(LABELS.ticketCategory)} value={form.category} onChange={set('category')} error={errors.category} required />
            <Input
              label="Subject"
              icon={<MessageSquareText size={18} />}
              placeholder="e.g. Booking GGR100028 not confirmed"
              maxLength={120}
              value={form.subject}
              onChange={set('subject')}
              error={errors.subject}
              required
            />
            <Textarea
              label="Describe the issue"
              placeholder="Include the bus number, booking reference, stop and time if relevant."
              rows={5}
              maxLength={2000}
              value={form.message}
              onChange={set('message')}
              error={errors.message}
              hint={`${form.message.length}/2000`}
              required
            />
            <div className="row-between wrap">
              <span className="text-xs text-muted row" style={{ '--gap': '6px' }}>
                <ShieldCheck size={14} /> Only our support team can see your ticket.
              </span>
              <Button type="submit" loading={busy} icon={<Send size={17} />}>
                Submit ticket
              </Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'tickets' &&
        (tickets.loading && !tickets.rows.length ? (
          <SkeletonList count={3} height={150} />
        ) : tickets.error && !tickets.rows.length ? (
          <ErrorState error={tickets.error} onRetry={tickets.reload} />
        ) : !tickets.rows.length ? (
          <EmptyState
            icon={<Inbox size={26} />}
            title="No tickets yet"
            message="When you raise a ticket, you can follow its status and our replies here."
            action={
              <Button icon={<Ticket size={17} />} onClick={() => setTab('new')}>
                Raise a ticket
              </Button>
            }
          />
        ) : (
          <div className="acc-list">
            {tickets.rows.map((t) => (
              <TicketCard key={t.id} t={t} />
            ))}
            <Pagination meta={tickets.meta} onChange={tickets.setPage} noun="tickets" />
          </div>
        ))}
    </AccountPage>
  )
}
