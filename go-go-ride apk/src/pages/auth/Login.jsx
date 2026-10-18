import { ServerLink } from '../../native/AppSettings'
import { startTransition, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, KeyRound, MessageSquareText, PartyPopper, PencilLine, ShieldCheck, UserRound } from 'lucide-react'
import { Button, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService, profileService } from '../../services'
import { formatPhone, isValidPhone } from '../../utils/format'
import { AuthShell } from './AuthShell'
import { PhoneInput } from './PhoneInput'
import { OtpInput } from './OtpInput'
import { safeNext, serverFieldErrors } from './formUtils'

const RESEND_SECONDS = 30
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there'

// OTP sign-in needs an SMS gateway on the server. Builds for a live server without
// one set VITE_ENABLE_OTP=false, which makes password sign-in the only option.
const OTP_ENABLED = import.meta.env.VITE_ENABLE_OTP !== 'false'

export default function Login() {
  const [params] = useSearchParams()
  const nextParam = params.get('next')
  const dest = safeNext(nextParam, '/home')
  const navigate = useNavigate()
  const toast = useToast()
  const { setUser } = useAuth()

  const [mode, setMode] = useState(OTP_ENABLED ? 'otp' : 'password') // otp | password
  const [step, setStep] = useState('phone') // phone | code | name  (OTP flow)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [newUser, setNewUser] = useState(null)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState('') // sending | verifying | password | name
  const [attempt, setAttempt] = useState(0) // remounts the OTP boxes (refocus) after a wrong code
  const verifyingRef = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const signupHref = `/register${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`

  /** Commit the signed-in user and the navigation in one render, so the GuestOnly guard never redirects mid-way. */
  const finish = (user, message) => {
    toast.success(message || `Welcome back, ${firstName(user?.name)}!`)
    startTransition(() => {
      setUser(user)
      navigate(dest, { replace: true })
    })
  }

  const switchMode = (m) => {
    setMode(m)
    setErrors({})
    setFormError('')
  }

  // ------------------------------------------------------------ OTP flow

  const sendCode = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!isValidPhone(phone) || phone.length !== 10) {
      setErrors({ phone: 'Enter a valid 10-digit mobile number' })
      return
    }
    setErrors({})
    setBusy('sending')
    try {
      const data = await authService.requestOtp(phone)
      setDevCode(import.meta.env.DEV ? data?.devCode || '' : '')
      setCode('')
      setStep('code')
      setCooldown(RESEND_SECONDS)
      toast.success(`We sent a 6-digit code to ${formatPhone(phone)}`)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (fe.phone) setErrors({ phone: fe.phone })
      else toast.error(err)
    } finally {
      setBusy('')
    }
  }

  const verify = async (value = code) => {
    if (verifyingRef.current) return
    if (value.length !== 6) {
      setErrors({ code: 'Enter the 6-digit code' })
      return
    }
    verifyingRef.current = true
    setErrors({})
    setBusy('verifying')
    try {
      const data = await authService.verifyOtp({ phone, code: value })
      if (data.isNewUser) {
        setNewUser(data.user)
        setName('')
        setStep('name')
      } else {
        finish(data.user)
      }
    } catch (err) {
      setErrors({ code: err.message })
      setCode('')
      setAttempt((a) => a + 1)
    } finally {
      verifyingRef.current = false
      setBusy('')
    }
  }

  const saveName = async (e) => {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 2) {
      setErrors({ name: 'Enter at least 2 characters' })
      return
    }
    setErrors({})
    setBusy('name')
    try {
      const updated = await profileService.update({ name: n })
      finish(updated, `Welcome to GO-GO Ride, ${firstName(n)}!`)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (fe.name) setErrors({ name: fe.name })
      else toast.error(err)
      setBusy('')
    }
  }

  // ------------------------------------------------------------ password flow

  const passwordLogin = async (e) => {
    e.preventDefault()
    setFormError('')
    const next = {}
    if (!isValidPhone(phone) || phone.length !== 10) next.phone = 'Enter a valid 10-digit mobile number'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy('password')
    try {
      const data = await authService.login(phone, password)
      finish(data.user)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err.message)
      setBusy('')
    }
  }

  // ------------------------------------------------------------ render

  if (step === 'name') {
    return (
      <AuthShell title="One last thing" subtitle="Your number is verified. What should we call you?">
        <form className="auth-form" onSubmit={saveName} noValidate>
          <div className="auth-welcome">
            <span className="icon-tile lg round accent">
              <PartyPopper size={26} />
            </span>
            <p className="text-sm text-muted">Account created for {formatPhone(newUser?.phone || phone)}</p>
          </div>
          <Input
            label="Your name"
            icon={<UserRound size={18} />}
            placeholder="e.g. Ritaban Guchait"
            autoComplete="name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            required
          />
          <Button type="submit" size="lg" block loading={busy === 'name'} iconRight={<ArrowRight size={18} />}>
            Continue
          </Button>
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => finish(newUser, 'Welcome to GO-GO Ride!')} disabled={busy === 'name'}>
            Skip for now
          </button>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to set bus alarms, save favourites and manage your bookings."
      footer={
        <>
          <span>
            New to GO-GO Ride? <Link to={signupHref}>Create an account</Link>
          </span>
          <Link to={`/admin/login${nextParam?.startsWith('/admin') ? `?next=${encodeURIComponent(nextParam)}` : ''}`} className="auth-admin-link">
            <ShieldCheck size={13} /> Admin login
          </Link>
          <ServerLink />
        </>
      }
    >
      {OTP_ENABLED && (
        <div className="segmented auth-tabs" role="tablist" aria-label="Sign-in method">
          <button type="button" role="tab" aria-selected={mode === 'otp'} className={mode === 'otp' ? 'active' : ''} onClick={() => switchMode('otp')}>
            <MessageSquareText size={16} /> OTP
          </button>
          <button type="button" role="tab" aria-selected={mode === 'password'} className={mode === 'password' ? 'active' : ''} onClick={() => switchMode('password')}>
            <KeyRound size={16} /> Password
          </button>
        </div>
      )}

      {mode === 'otp' && step === 'phone' && (
        <form className="auth-form" onSubmit={sendCode} noValidate>
          <PhoneInput
            value={phone}
            onChange={(v) => {
              setPhone(v)
              if (errors.phone) setErrors({})
            }}
            error={errors.phone}
            hint="We'll text you a 6-digit code. New here? Your account is created automatically."
            autoFocus
            required
          />
          <Button type="submit" size="lg" block loading={busy === 'sending'} iconRight={<ArrowRight size={18} />}>
            Send OTP
          </Button>
        </form>
      )}

      {mode === 'otp' && step === 'code' && (
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault()
            verify()
          }}
          noValidate
        >
          <div className="auth-sent-to">
            <span>
              Code sent to <strong>{formatPhone(phone)}</strong>
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setStep('phone')
                setCode('')
                setErrors({})
              }}
            >
              <PencilLine size={14} /> Change
            </button>
          </div>
          <div className="field">
            <span className="field-label">Enter the 6-digit code</span>
            <OtpInput
              key={attempt}
              value={code}
              onChange={(v) => {
                setCode(v)
                if (errors.code) setErrors({})
              }}
              onComplete={verify}
              disabled={busy === 'verifying'}
              invalid={Boolean(errors.code)}
            />
            {errors.code ? <span className="field-error">{errors.code}</span> : <span className="field-hint">The code is valid for 5 minutes.</span>}
          </div>
          {import.meta.env.DEV && devCode && (
            <span className="auth-dev-hint" title="Shown in development builds only">
              Dev code: <code>{devCode}</code>
            </span>
          )}
          <Button type="submit" size="lg" block loading={busy === 'verifying'} disabled={code.length !== 6}>
            Verify &amp; continue
          </Button>
          <div className="auth-resend">
            {cooldown > 0 ? (
              <span>
                Didn&apos;t get it? Resend in <strong className="tabular">0:{String(cooldown).padStart(2, '0')}</strong>
              </span>
            ) : (
              <button type="button" className="link-btn" onClick={sendCode} disabled={busy === 'sending'}>
                {busy === 'sending' ? 'Sending…' : 'Resend code'}
              </button>
            )}
          </div>
        </form>
      )}

      {mode === 'password' && (
        <form className="auth-form" onSubmit={passwordLogin} noValidate>
          {formError && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} />
              <span>
                {formError}
                {/blocked|inactive/i.test(formError) && (
                  <>
                    {' '}
                    <Link to="/contact">Contact support</Link>
                  </>
                )}
              </span>
            </div>
          )}
          <PhoneInput
            value={phone}
            onChange={(v) => {
              setPhone(v)
              if (errors.phone) setErrors((x) => ({ ...x, phone: undefined }))
            }}
            error={errors.phone}
            autoFocus
            required
          />
          <Input
            label="Password"
            type="password"
            icon={<KeyRound size={18} />}
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errors.password) setErrors((x) => ({ ...x, password: undefined }))
            }}
            error={errors.password}
            required
          />
          <div className="auth-row-between">
            <span />
            {OTP_ENABLED ? (
              <button type="button" className="link-btn" onClick={() => switchMode('otp')}>
                Forgot password? Sign in with OTP
              </button>
            ) : (
              <Link to="/contact" className="link-btn">
                Forgot password? Contact support
              </Link>
            )}
          </div>
          <Button type="submit" size="lg" block loading={busy === 'password'} iconRight={<ArrowRight size={18} />}>
            Sign in
          </Button>
        </form>
      )}

      <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
        By continuing you agree to GO-GO Ride&apos;s terms of use and privacy policy.
      </p>
    </AuthShell>
  )
}
