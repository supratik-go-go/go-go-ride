import { useEffect, useMemo, useState } from 'react'
import { Bell, CreditCard, DatabaseBackup, Info, Mail, MessageSquare, RotateCcw, Save, Settings, ShieldCheck, Smartphone } from 'lucide-react'
import { Button, ErrorState, Input, SectionHeader, Select, Skeleton, Textarea } from '../../components/ui'
import { Counter, EMAIL_RE, changedFields } from '../../components/admin-ops'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services'
// .adm-card / .adm-soon live in the shared admin widget stylesheet.
import '../../components/admin/admin-ui.css'
import './admin.css'
import './admin-ops.css'

const NAV = [
  { key: 'general', label: 'General Settings', icon: Settings },
  { key: 'app', label: 'App Settings', icon: Smartphone, soon: true },
  { key: 'payment', label: 'Payment Settings', icon: CreditCard, soon: true },
  { key: 'email', label: 'Email Settings', icon: Mail, soon: true },
  { key: 'sms', label: 'SMS Settings', icon: MessageSquare, soon: true },
  { key: 'notification', label: 'Notification Settings', icon: Bell, soon: true },
  { key: 'security', label: 'Security Settings', icon: ShieldCheck, soon: true },
  { key: 'backup', label: 'Backup & Restore', icon: DatabaseBackup, soon: true },
]

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (GMT +05:30)' },
  { value: 'Asia/Kathmandu', label: 'Asia/Kathmandu (GMT +05:45)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (GMT +06:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GMT +04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT +08:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT +00:00 / +01:00)' },
  { value: 'UTC', label: 'UTC (GMT +00:00)' },
]
const CURRENCIES = [
  { value: 'INR', label: 'INR (₹) - Indian Rupee' },
  { value: 'USD', label: 'USD ($) - US Dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British Pound' },
  { value: 'BDT', label: 'BDT (৳) - Bangladeshi Taka' },
  { value: 'NPR', label: 'NPR (रू) - Nepalese Rupee' },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
function dateExample(fmt, d = new Date()) {
  if (fmt === 'DD/MM/YYYY') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  if (fmt === 'YYYY-MM-DD') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((f) => ({ value: f, label: `${f}  (${dateExample(f)})` }))
const TIME_FORMATS = [
  { value: '12h', label: '12 Hour (09:30 PM)' },
  { value: '24h', label: '24 Hour (21:30)' },
]

/** Keep an unknown stored value selectable instead of silently replacing it. */
const withCurrent = (options, value) => (value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options)

const FIELDS = ['platformName', 'platformEmail', 'contactNumber', 'address', 'timezone', 'currency', 'dateFormat', 'timeFormat']
const pick = (s) => Object.fromEntries(FIELDS.map((k) => [k, s?.[k] ?? '']))
const clean = (f) => Object.fromEntries(FIELDS.map((k) => [k, typeof f[k] === 'string' ? f[k].trim() : f[k]]))

function validate(f) {
  const e = {}
  if (f.platformName.length < 2) e.platformName = 'Enter at least 2 characters'
  else if (f.platformName.length > 80) e.platformName = 'Use 80 characters or fewer'
  if (!f.platformEmail) e.platformEmail = 'Enter the support email'
  else if (!EMAIL_RE.test(f.platformEmail)) e.platformEmail = 'Enter a valid email address'
  if (!f.contactNumber) e.contactNumber = 'Enter a contact number'
  else if (f.contactNumber.length > 20) e.contactNumber = 'Use 20 characters or fewer'
  else if (!/^\+?[\d\s()-]+$/.test(f.contactNumber) || f.contactNumber.replace(/\D/g, '').length < 6) e.contactNumber = 'Use digits, spaces and an optional leading +'
  if (f.address.length > 200) e.address = 'Use 200 characters or fewer'
  return e
}

function SettingsSkeleton() {
  return (
    <div className="stack" style={{ '--gap': '16px' }} aria-busy="true">
      <div className="ops-form-grid three">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={70} radius={10} />
        ))}
      </div>
      <Skeleton height={130} radius={10} />
      <div className="ops-form-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={70} radius={10} />
        ))}
      </div>
    </div>
  )
}

/** The General form. Mounted once the settings have loaded, so state starts from them. */
function GeneralSettingsForm({ settings }) {
  const toast = useToast()
  const [base, setBase] = useState(() => pick(settings))
  const [form, setForm] = useState(() => pick(settings))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const changes = useMemo(() => changedFields(base, clean(form)), [base, form])
  const dirty = Object.keys(changes).length > 0

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }))
  }

  const save = async (ev) => {
    ev.preventDefault()
    const e = validate(clean(form))
    setErrors(e)
    if (Object.keys(e).length || !dirty) return
    setSaving(true)
    try {
      const saved = await adminService.updateSettings(changes)
      const v = pick(saved)
      setBase(v)
      setForm(v)
      toast.success('Settings saved')
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setForm(base)
    setErrors({})
  }

  return (
    <form onSubmit={save} noValidate>
      <div className="ops-settings-group">
        <div>
          <div className="ops-section-title">Platform details</div>
          <div className="text-xs text-muted">Contact number, email and address are shown to passengers on the Contact page and in Help &amp; Support.</div>
        </div>
        <div className="ops-form-grid three">
          <Input label="Platform Name" required value={form.platformName} onChange={set('platformName')} error={errors.platformName} maxLength={80} autoComplete="off" />
          <Input label="Platform Email" required type="email" value={form.platformEmail} onChange={set('platformEmail')} error={errors.platformEmail} autoComplete="off" />
          <Input label="Contact Number" required type="tel" value={form.contactNumber} onChange={set('contactNumber')} error={errors.contactNumber} maxLength={20} autoComplete="off" />
        </div>
        <div className="field">
          <div className="ops-legend">
            <label className="field-label" htmlFor="ops-settings-address">
              Address
            </label>
            <Counter value={form.address} max={200} />
          </div>
          <Textarea id="ops-settings-address" value={form.address} onChange={set('address')} error={errors.address} maxLength={220} style={{ minHeight: 88 }} />
        </div>
      </div>

      <div className="ops-settings-group">
        <div>
          <div className="ops-section-title">Regional</div>
          <div className="text-xs text-muted">Time zone, currency and formats for the platform.</div>
        </div>
        <div className="ops-form-grid">
          <Select label="Time Zone" value={form.timezone} onChange={set('timezone')} options={withCurrent(TIMEZONES, form.timezone)} error={errors.timezone} />
          <Select label="Currency" value={form.currency} onChange={set('currency')} options={withCurrent(CURRENCIES, form.currency)} error={errors.currency} />
          <Select label="Date Format" value={form.dateFormat} onChange={set('dateFormat')} options={withCurrent(DATE_FORMATS, form.dateFormat)} error={errors.dateFormat} />
          <Select label="Time Format" value={form.timeFormat} onChange={set('timeFormat')} options={withCurrent(TIME_FORMATS, form.timeFormat)} error={errors.timeFormat} />
        </div>
        <div className="alert alert-info">
          <Info size={18} />
          <div>These are saved with the platform settings, but the apps don't read them yet - fares, dates and times are always shown in ₹, Indian time and the DD MMM YYYY / 12-hour style.</div>
        </div>
      </div>

      <div className="ops-settings-foot">
        {dirty && (
          <span className="ops-dirty">
            <span className="dot" /> Unsaved changes
          </span>
        )}
        <Button variant="outline" icon={<RotateCcw size={16} />} onClick={reset} disabled={!dirty || saving}>
          Reset
        </Button>
        <Button type="submit" variant="accent" icon={<Save size={16} />} loading={saving} disabled={!dirty}>
          Save Changes
        </Button>
      </div>
    </form>
  )
}

export default function SettingsAdmin() {
  const q = useAsync(() => adminService.settings(), [])

  return (
    <div className="adm-page">
      <SectionHeader title="Settings" subtitle="Platform details passengers see, and regional preferences." />

      <div className="ops-settings">
        <nav className="adm-card ops-settings-nav" aria-label="Settings sections">
          <div className="ops-settings-nav-title">Settings</div>
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={n.key === 'general' ? 'active' : ''}
              aria-current={n.key === 'general' ? 'page' : undefined}
              disabled={n.soon}
              title={n.soon ? 'Coming soon - only General settings are stored by the server today' : undefined}
            >
              <n.icon size={17} />
              {n.label}
              {n.soon && <span className="adm-soon">Soon</span>}
            </button>
          ))}
        </nav>

        <section className="adm-card ops-settings-card">
          <div className="ops-settings-head">
            <div>
              <h2 className="section-title" style={{ fontSize: 'var(--fs-lg)' }}>
                General Settings
              </h2>
              <p className="text-sm text-muted">Your platform name, contact details and formats.</p>
            </div>
          </div>

          {q.error && !q.data ? (
            <ErrorState error={q.error} onRetry={q.reload} title="Couldn't load the settings" />
          ) : !q.data ? (
            <SettingsSkeleton />
          ) : (
            <GeneralSettingsForm settings={q.data} />
          )}
        </section>
      </div>
    </div>
  )
}
