import { startTransition, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, BusFront, CarTaxiFront, Check, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { Button, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { isValidPhone } from '../../utils/format'
import { AuthShell } from './AuthShell'
import { PhoneInput } from './PhoneInput'
import { isValidEmail, safeNext, serverFieldErrors } from './formUtils'

const ROLES = [
  { value: 'PASSENGER', name: 'Passenger', desc: 'Search buses, set alarms & book rides', icon: UserRound },
  { value: 'BUS_OWNER', name: 'Bus Owner', desc: 'List your buses & manage timetables', icon: BusFront },
  { value: 'DRIVER', name: 'Driver', desc: 'List your car for local trips & rides', icon: CarTaxiFront },
]

const SUBTITLES = {
  PASSENGER: 'Save favourite routes, set arrival alarms and keep your bookings in one place.',
  BUS_OWNER: 'Create your owner account, then add your first bus with its timetable and documents.',
  DRIVER: 'Create your driver account, then list your car so passengers nearby can call you.',
}

function strength(pw) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 6) s += 1
  if (pw.length >= 10) s += 1
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1
  return Math.max(1, s)
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong']

export default function Register() {
  const [params] = useSearchParams()
  const initialRole = ROLES.some((r) => r.value === params.get('role')) ? params.get('role') : 'PASSENGER'
  const nextParam = params.get('next')
  const navigate = useNavigate()
  const toast = useToast()
  const { setUser } = useAuth()

  const [role, setRole] = useState(initialRole)
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '' })
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [phoneTaken, setPhoneTaken] = useState(false)
  const [busy, setBusy] = useState(false)

  const level = useMemo(() => strength(form.password), [form.password])
  const loginHref = `/login${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`

  const set = (key) => (e) => {
    const value = typeof e === 'string' ? e : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
    if (key === 'phone') setPhoneTaken(false)
  }

  const validate = () => {
    const e = {}
    const name = form.name.trim()
    if (name.length < 2) e.name = 'Enter your full name (at least 2 characters)'
    else if (name.length > 80) e.name = 'Name is too long'
    if (!isValidPhone(form.phone) || form.phone.length !== 10) e.phone = 'Enter a valid 10-digit mobile number'
    if (form.email.trim() && !isValidEmail(form.email)) e.email = 'Enter a valid email address'
    if (form.password.length < 6) e.password = 'Use at least 6 characters'
    else if (form.password.length > 72) e.password = 'Use at most 72 characters'
    if (!form.confirm) e.confirm = 'Re-enter your password'
    else if (form.confirm !== form.password) e.confirm = 'Passwords do not match'
    if (!agree) e.agree = 'Please accept the terms to continue'
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    setFormError('')
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const data = await authService.register({
        name: form.name.trim(),
        phone: form.phone,
        email: form.email.trim() || undefined,
        password: form.password,
        role,
      })
      const target = role === 'BUS_OWNER' ? '/owner/buses/new' : role === 'DRIVER' ? '/driver/cars' : safeNext(nextParam, '/home')
      toast.success(
        role === 'BUS_OWNER'
          ? 'Account created. Now add your first bus.'
          : role === 'DRIVER'
            ? 'Account created. Now list your car.'
            : `Welcome to GO-GO Ride, ${data.user.name.split(' ')[0]}!`,
      )
      // Set the user and navigate in one render so the GuestOnly guard does not redirect to /home first.
      startTransition(() => {
        setUser(data.user)
        navigate(target, { replace: true })
      })
    } catch (err) {
      setBusy(false)
      if (err.status === 409) {
        if (/email/i.test(err.message)) setErrors({ email: err.message })
        else {
          setErrors({ phone: err.message })
          setPhoneTaken(true)
        }
        return
      }
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err.message)
    }
  }

  return (
    <AuthShell
      wide
      title="Create your account"
      subtitle={SUBTITLES[role]}
      footer={
        <span>
          Already have an account? <Link to={loginHref}>Sign in</Link>
        </span>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <fieldset className="auth-roles" aria-label="Account type">
          <legend>I am a</legend>
          {ROLES.map(({ value, name, desc, icon: Icon }) => (
            <label key={value} className={`auth-role ${role === value ? 'active' : ''}`}>
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} />
              <span className="auth-role-check" aria-hidden="true">
                {role === value && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="icon-tile">
                <Icon size={21} />
              </span>
              <span className="auth-role-name">{name}</span>
              <span className="auth-role-desc">{desc}</span>
            </label>
          ))}
        </fieldset>

        {formError && (
          <div className="alert alert-danger" role="alert">
            <AlertCircle size={18} />
            <span>{formError}</span>
          </div>
        )}
        {phoneTaken && (
          <div className="alert alert-info" role="status">
            <AlertCircle size={18} />
            <span>
              This number already has a GO-GO Ride account. <Link to={loginHref}>Sign in instead</Link> - you can use a one-time code if you forgot the password.
            </span>
          </div>
        )}

        <Input
          label={role === 'BUS_OWNER' ? 'Owner full name' : 'Full name'}
          icon={<UserRound size={18} />}
          placeholder="e.g. Ritaban Guchait"
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
          hint="For booking receipts and account recovery."
        />
        <div className="auth-grid-2">
          <div className="stack" style={{ '--gap': '6px' }}>
            <Input
              label="Password"
              type="password"
              icon={<KeyRound size={18} />}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              maxLength={72}
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              required
            />
            {form.password && !errors.password && (
              <div className="row" style={{ '--gap': '8px' }} aria-live="polite">
                <div className="auth-strength grow" data-level={level} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <span className="text-xs text-muted">{STRENGTH_LABEL[level]}</span>
              </div>
            )}
          </div>
          <Input
            label="Confirm password"
            type="password"
            icon={<KeyRound size={18} />}
            placeholder="Re-enter password"
            autoComplete="new-password"
            maxLength={72}
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            required
          />
        </div>

        <div className="field">
          <label className="checkbox auth-terms">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => {
                setAgree(e.target.checked)
                if (errors.agree) setErrors((x) => ({ ...x, agree: undefined }))
              }}
            />
            <span>
              I agree to GO-GO Ride&apos;s terms of use and privacy policy
              {role !== 'PASSENGER' && ', and confirm the details I list are accurate and mine to share'}.
            </span>
          </label>
          {errors.agree && <span className="field-error">{errors.agree}</span>}
        </div>

        <Button type="submit" size="lg" block loading={busy} iconRight={<ArrowRight size={18} />}>
          {role === 'BUS_OWNER' ? 'Create account & add bus' : role === 'DRIVER' ? 'Create account & list car' : 'Create account'}
        </Button>
        {role !== 'PASSENGER' && (
          <p className="text-xs text-muted row" style={{ '--gap': '6px', justifyContent: 'center' }}>
            <ShieldCheck size={14} />
            {role === 'BUS_OWNER' ? 'Buses go live after our team reviews the documents.' : 'Our team checks listings and adds a Verified badge.'}
          </p>
        )}
      </form>
    </AuthShell>
  )
}
