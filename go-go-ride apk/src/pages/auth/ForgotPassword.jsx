import { startTransition, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, AtSign, KeyRound, PencilLine } from 'lucide-react'
import { Button, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { AuthShell } from './AuthShell'
import { OtpInput } from './OtpInput'
import { serverFieldErrors } from './formUtils'

// Answers that mean "this account can't be reset by email": shown with a way forward instead.
const DEAD_ENDS = {
  NO_EMAIL: { action: 'Contact support', to: '/contact' },
  EMAIL_NOT_CONFIRMED: { action: 'Contact support', to: '/contact' },
  MAIL_NOT_READY: { action: 'Contact support', to: '/contact' },
  GOOGLE_ACCOUNT: { action: 'Back to sign in', to: '/login' },
}

/**
 * Forgot password: the person types their mobile number or email, a 6-digit code goes to the
 * email on the account (free, no SMS), and they choose a new password and are signed in.
 */
export default function ForgotPassword() {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState('login') // login | code
  const [login, setLogin] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [deadEnd, setDeadEnd] = useState(null) // { message, action, to }
  const [busy, setBusy] = useState('')

  const sendCode = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (login.trim().length < 3) {
      setErrors({ login: 'Enter your mobile number or email' })
      return
    }
    setBusy('sending')
    try {
      const data = await authService.requestResetEmail(login.trim())
      setSentTo(data.sentTo)
      setDevCode(import.meta.env.DEV ? data?.devCode || '' : '')
      setStep('code')
      setErrors({})
      if (e === undefined) toast.success(`A new code is on its way to ${data.sentTo}`)
    } catch (err) {
      if (DEAD_ENDS[err.code]) setDeadEnd({ message: err.message, ...DEAD_ENDS[err.code] })
      else if (err.status === 404) setErrors({ login: err.message })
      else setFormError(err.message)
    } finally {
      setBusy('')
    }
  }

  const reset = async (e) => {
    e.preventDefault()
    const next = {}
    if (code.length !== 6) next.code = 'Enter the 6-digit code from the email'
    if (password.trim().length < 6) next.password = 'Use at least 6 characters'
    if (password !== confirm) next.confirm = "The passwords don't match"
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy('saving')
    setFormError('')
    try {
      const data = await authService.resetByEmail({ login: login.trim(), code, newPassword: password })
      toast.success('Password changed. You are signed in.')
      startTransition(() => {
        setUser(data.user)
        navigate('/home', { replace: true })
      })
    } catch (err) {
      setBusy('')
      const fe = serverFieldErrors(err)
      if (fe.newPassword) fe.password = fe.newPassword
      if (Object.keys(fe).length) setErrors(fe)
      else if (/code/i.test(err.message)) setErrors({ code: err.message })
      else setFormError(err.message)
    }
  }

  if (deadEnd) {
    return (
      <AuthShell title="Forgot password" subtitle="This account can't be reset by email.">
        <div className="auth-form">
          <div className="alert alert-info" role="status">
            <AlertCircle size={18} />
            <span>{deadEnd.message}</span>
          </div>
          <Button to={deadEnd.to} size="lg" block>
            {deadEnd.action}
          </Button>
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setDeadEnd(null)}>
            Try another number or email
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle={step === 'login' ? "Enter your mobile number or email. We'll email you a 6-digit code." : 'Enter the code from the email and choose a new password.'}
      footer={
        <span>
          Remembered it? <Link to="/login">Sign in</Link>
        </span>
      }
    >
      {formError && (
        <div className="alert alert-danger" role="alert">
          <AlertCircle size={18} />
          <span>{formError}</span>
        </div>
      )}

      {step === 'login' ? (
        <form className="auth-form" onSubmit={sendCode} noValidate>
          <Input
            label="Mobile number or email"
            icon={<AtSign size={18} />}
            placeholder="98765 43210 or you@example.com"
            autoComplete="username"
            autoCapitalize="none"
            value={login}
            onChange={(e) => {
              setLogin(e.target.value)
              if (errors.login) setErrors({})
            }}
            error={errors.login}
            autoFocus
            required
          />
          <Button type="submit" size="lg" block loading={busy === 'sending'} iconRight={<ArrowRight size={18} />}>
            Email me a code
          </Button>
          <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
            No email on your account? Contact GO-GO Ride support and we&apos;ll reset it for you.
          </p>
        </form>
      ) : (
        <form className="auth-form" onSubmit={reset} noValidate>
          <div className="auth-sent-to">
            <span>
              Code sent to <strong>{sentTo}</strong>
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setStep('login')
                setCode('')
                setErrors({})
                setFormError('')
              }}
            >
              <PencilLine size={14} /> Change
            </button>
          </div>
          <div className="field">
            <span className="field-label">Enter the 6-digit code</span>
            <OtpInput value={code} onChange={setCode} invalid={Boolean(errors.code)} />
            {errors.code ? <span className="field-error">{errors.code}</span> : <span className="field-hint">Check your inbox (and spam folder). The code works for 10 minutes.</span>}
          </div>
          {import.meta.env.DEV && devCode && (
            <span className="auth-dev-hint" title="Shown in development builds only">
              Dev code: <code>{devCode}</code>
            </span>
          )}
          <Input label="New password" type="password" required icon={<KeyRound size={18} />} placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" />
          <Input label="Confirm new password" type="password" required icon={<KeyRound size={18} />} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" size="lg" block loading={busy === 'saving'}>
            Change password and sign in
          </Button>
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => sendCode()} disabled={busy === 'sending'}>
            Send the code again
          </button>
        </form>
      )}
    </AuthShell>
  )
}
