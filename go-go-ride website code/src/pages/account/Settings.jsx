import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  BellOff,
  BellRing,
  ChevronRight,
  CircleHelp,
  FileText,
  Globe,
  Info,
  KeyRound,
  Mail,
  Monitor,
  ShieldCheck,
  Smartphone,
  Terminal,
} from 'lucide-react'
import { Badge, Button, Card, ErrorState, Input, Modal, Skeleton, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService, profileService } from '../../services'
import { formatDateTime, parseTimestamp, timeAgo } from '../../utils/format'
import { serverFieldErrors } from '../auth/formUtils'
import { AccountPage, LoadMore } from './accountShared'

const APP_VERSION = '1.0.0'
const WEEK_MS = 7 * 86400000
const isThisWeek = (ts) => Date.now() - parseTimestamp(ts).getTime() < WEEK_MS

function describeDevice(ua) {
  if (!ua) return { name: 'Unknown device', icon: Globe }
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /CrOS/i.test(ua)
            ? 'ChromeOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /wv\)|; wv/.test(ua)
          ? 'GO-GO Ride app'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : null
  if (!os && !browser) return { name: ua.split(/[\s/]/)[0] || 'API client', icon: Terminal }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua)
  return { name: [browser, os].filter(Boolean).join(' on '), icon: mobile ? Smartphone : Monitor }
}

// ------------------------------------------------------------------ password

function PasswordCard() {
  const { logout } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (form.next.length < 6) e.next = 'Use at least 6 characters'
    else if (form.next.length > 72) e.next = 'Use at most 72 characters'
    else if (form.current && form.next === form.current) e.next = 'Choose a password different from the current one'
    if (form.confirm !== form.next) e.confirm = 'Passwords do not match'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await authService.changePassword(form.current || undefined, form.next)
      toast.success('Sign in again with your new password.', 'Password updated')
      // The API revokes every session (this one included), so end it now - the auth guard sends us to /login.
      await logout()
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (fe.newPassword) fe.next = fe.newPassword
      if (fe.currentPassword) fe.current = fe.currentPassword
      if (/current password/i.test(err.message)) setErrors({ current: err.message })
      else if (Object.keys(fe).length) setErrors(fe)
      else toast.error(err)
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile">
          <KeyRound size={20} />
        </span>
        <div>
          <h2>Change password</h2>
          <p>Use it to sign in with your mobile number and password.</p>
        </div>
      </div>
      <form className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.current}
          onChange={set('current')}
          error={errors.current}
          hint="Signed up with OTP and never set one? Leave this blank."
        />
        <div className="grid grid-2" style={{ '--gap': '14px' }}>
          <Input label="New password" type="password" autoComplete="new-password" maxLength={72} value={form.next} onChange={set('next')} error={errors.next} required />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            required
          />
        </div>
        <div className="alert alert-info">
          <ShieldCheck size={18} />
          <span>For your security, changing your password signs you out on every device - including this one. You&apos;ll sign in again with the new password.</span>
        </div>
        <Button type="submit" loading={busy} disabled={!form.next || !form.confirm} style={{ alignSelf: 'flex-end' }}>
          Update password
        </Button>
      </form>
    </Card>
  )
}

// ------------------------------------------------------------------ browser notifications

function readPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

function NotificationsCard() {
  const toast = useToast()
  const [perm, setPerm] = useState(readPermission)
  const [asking, setAsking] = useState(false)

  // Pick up changes made in the browser's site settings while the page is open.
  useEffect(() => {
    const sync = () => setPerm(readPermission())
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  const showTest = () => {
    try {
      // eslint-disable-next-line no-new
      new window.Notification('GO-GO Ride', { body: "Alerts are on. We'll remind you before your bus arrives.", icon: '/app-icon-192.png' })
    } catch {
      toast.info('Alerts are allowed. Your next alarm reminder will appear here.')
    }
  }

  const enable = async () => {
    setAsking(true)
    try {
      const result = await window.Notification.requestPermission()
      setPerm(result)
      if (result === 'granted') {
        toast.success('Browser alerts turned on')
        showTest()
      } else if (result === 'denied') toast.warning('Alerts are blocked. You can allow them from your browser settings.')
    } catch (err) {
      toast.error(err)
    } finally {
      setAsking(false)
    }
  }

  const status = {
    granted: { tone: 'success', text: 'Allowed', icon: BellRing },
    denied: { tone: 'danger', text: 'Blocked', icon: BellOff },
    default: { tone: 'warning', text: 'Not enabled', icon: Bell },
    unsupported: { tone: 'neutral', text: 'Not supported', icon: BellOff },
  }[perm] || { tone: 'neutral', text: perm, icon: Bell }

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile accent">
          <status.icon size={20} />
        </span>
        <div className="grow">
          <h2>Notifications</h2>
          <p>Pop-up alerts for alarm reminders and booking updates.</p>
        </div>
        <Badge tone={status.tone} square>
          {status.text}
        </Badge>
      </div>
      <div className="stack" style={{ '--gap': '12px' }}>
        {perm === 'default' && (
          <div className="row-between wrap">
            <span className="text-sm text-2">Allow alerts on this device so you don&apos;t miss your bus.</span>
            <Button size="sm" icon={<BellRing size={16} />} onClick={enable} loading={asking}>
              Enable
            </Button>
          </div>
        )}
        {perm === 'granted' && (
          <div className="row-between wrap">
            <span className="text-sm text-2">Alerts are on for this browser.</span>
            <Button size="sm" variant="outline" onClick={showTest}>
              Send a test alert
            </Button>
          </div>
        )}
        {perm === 'denied' && (
          <p className="text-sm text-2">
            Alerts are blocked for this site. Open your browser&apos;s site settings (the lock icon next to the address) and allow notifications, then come back here.
          </p>
        )}
        {perm === 'unsupported' && <p className="text-sm text-2">This browser can&apos;t show pop-up alerts. Reminders still appear inside the app.</p>}
        <div className="soft-panel acc-muted-note">
          <Info size={17} />
          <span>
            Every alarm reminder and booking update is also saved in your <Link to="/notifications">in-app notifications</Link>, so you can check them any time.
          </span>
        </div>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ login activity

function ActivityCard() {
  const [state, setState] = useState({ items: [], meta: null, loading: true, loadingMore: false, error: null })

  const load = useCallback(async (page) => {
    setState((s) => ({ ...s, loading: page === 1, loadingMore: page > 1, error: null }))
    try {
      const { data, meta } = await profileService.loginActivity({ page, limit: 8 })
      setState((s) => ({ items: page === 1 ? data : [...s.items, ...data], meta, loading: false, loadingMore: false, error: null }))
    } catch (error) {
      setState((s) => ({ ...s, loading: false, loadingMore: false, error }))
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  const { items, meta } = state
  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile success">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2>Login activity</h2>
          <p>Recent sign-ins to your account. Don&apos;t recognise one? Change your password.</p>
        </div>
      </div>
      {state.loading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row">
              <Skeleton width={34} height={34} radius={10} />
              <div className="grow stack" style={{ '--gap': '6px' }}>
                <Skeleton width="45%" height={13} />
                <Skeleton width="65%" height={11} />
              </div>
            </div>
          ))}
        </div>
      ) : state.error && !items.length ? (
        <ErrorState error={state.error} onRetry={() => load(1)} compact />
      ) : !items.length ? (
        <p className="text-sm text-muted">No sign-ins recorded yet.</p>
      ) : (
        <>
          <div>
            {items.map((a, i) => {
              const d = describeDevice(a.device)
              const ok = a.status === 'SUCCESS'
              return (
                <div key={a.id} className="acc-activity">
                  <span className={`icon-tile sm ${ok ? '' : 'danger'}`}>
                    <d.icon size={17} />
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ '--gap': '6px' }}>
                      <strong className="text-sm truncate">{d.name}</strong>
                      {i === 0 && ok && (
                        <Badge tone="primary" square>
                          Latest
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted" title={formatDateTime(a.createdAt)}>
                      {isThisWeek(a.createdAt) ? `${timeAgo(a.createdAt)} · ` : ''}
                      {formatDateTime(a.createdAt)}
                      {a.ipAddress ? ` · IP ${a.ipAddress}` : ''}
                      {a.location ? ` · ${a.location}` : ''}
                    </span>
                  </div>
                  <Badge tone={ok ? 'success' : 'danger'} square>
                    {ok ? 'Signed in' : 'Failed'}
                  </Badge>
                </div>
              )
            })}
          </div>
          {state.error && <ErrorState error={state.error} onRetry={() => load((meta?.page || 1) + 1)} compact />}
          <LoadMore
            hasMore={meta && meta.page < meta.totalPages}
            loading={state.loadingMore}
            onClick={() => load(meta.page + 1)}
            shown={items.length}
            total={meta?.total}
            noun="sign-ins"
          />
        </>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ about / legal

const LEGAL = {
  terms: {
    title: 'Terms of use',
    body: [
      'GO-GO Ride helps you find local buses, set arrival reminders, book seats and contact local drivers in West Bengal.',
      'Timetables come from bus operators and are reviewed by our team, but traffic and operator changes mean buses can run early or late. Estimated positions are not live GPS.',
      'Local car fares are agreed directly between you and the driver. Shared ride and bus fares shown at booking are calculated by GO-GO Ride.',
      'Please use the service lawfully and do not post false listings or reviews. We may suspend accounts that misuse the platform.',
      'The full terms of service will be published here before the public launch of the Android app.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    body: [
      'To run your account GO-GO Ride stores your name, mobile number and, if you add them, your email and profile photo.',
      'To provide the service it also stores your bookings, alarms, favourites, recent searches and support tickets.',
      'Sign-in history (device and IP address) is kept so you can spot unfamiliar access on this screen.',
      'You can clear your search history any time from Recent Searches, and contact support about your account data.',
      'The full privacy policy will be published here before the public launch of the Android app.',
    ],
  },
}

export default function Settings() {
  const [legal, setLegal] = useState(null)
  const doc = legal ? LEGAL[legal] : null

  return (
    <AccountPage title="Settings">
      <PasswordCard />
      <NotificationsCard />
      <ActivityCard />

      <Card>
        <div className="acc-setting-head">
          <span className="icon-tile violet">
            <Info size={20} />
          </span>
          <div className="grow">
            <h2>About GO-GO Ride</h2>
            <p>Smart local transport for West Bengal</p>
          </div>
          <Badge tone="neutral" square>
            v{APP_VERSION}
          </Badge>
        </div>
        <nav className="acc-links" aria-label="About and legal">
          <Link to="/about">
            <Info size={18} /> About us <ChevronRight size={18} className="acc-menu-chevron" />
          </Link>
          <Link to="/contact">
            <Mail size={18} /> Contact us <ChevronRight size={18} className="acc-menu-chevron" />
          </Link>
          <Link to="/support">
            <CircleHelp size={18} /> Help &amp; Support <ChevronRight size={18} className="acc-menu-chevron" />
          </Link>
          <button type="button" onClick={() => setLegal('terms')}>
            <FileText size={18} /> Terms of use <ChevronRight size={18} className="acc-menu-chevron" />
          </button>
          <button type="button" onClick={() => setLegal('privacy')}>
            <ShieldCheck size={18} /> Privacy policy <ChevronRight size={18} className="acc-menu-chevron" />
          </button>
        </nav>
      </Card>
      <p className="acc-version">
        GO-GO Ride v{APP_VERSION} · Made for West Bengal
      </p>

      <Modal
        open={Boolean(doc)}
        onClose={() => setLegal(null)}
        title={doc?.title}
        subtitle="Summary - full document coming before launch"
        footer={<Button onClick={() => setLegal(null)}>Got it</Button>}
      >
        <div className="stack" style={{ '--gap': '10px' }}>
          {doc?.body.map((p) => (
            <p key={p} className="text-sm text-2">
              {p}
            </p>
          ))}
        </div>
      </Modal>
    </AccountPage>
  )
}
