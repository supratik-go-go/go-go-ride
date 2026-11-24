import { startTransition, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, KeyRound, PencilLine } from 'lucide-react'
import { Button, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { formatPhone, isValidPhone } from '../../utils/format'
import { AuthShell } from './AuthShell'
import { PhoneInput } from './PhoneInput'
import { OtpInput } from './OtpInput'
import { serverFieldErrors } from './formUtils'

/**
 * Forgot password: a 6-digit code goes by SMS to the account's own number, then a new password is
 * set and the user is signed in. Until the SMS phone is set up, the server answers SMS_NOT_READY
 * and the screen points to support instead.
 */
export default function ForgotPassword() {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState('phone') // phone | reset
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [busy, setBusy] = useState('')

  const sendCode = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!isValidPhone(phone)) {
      setErrors({ phone: 'Enter your 10-digit mobile number' })
      return
    }
    setBusy('sending')
    try {
      const data = await authService.requestOtp(phone, 'RESET')
      setDevCode(import.meta.env.DEV ? data?.devCode || '' : '')
      setStep('reset')
      setErrors({})
    } catch (err) {
      if (err.code === 'SMS_NOT_READY') setNotReady(true)
      else setFormError(err.message)
    } finally {
      setBusy('')
    }
  }

  const reset = async (e) => {
    e.preventDefault()
    const next = {}
    if (code.length !== 6) next.code = 'Enter the 6-digit code'
    if (password.trim().length < 6) next.password = 'Use at least 6 characters'
    if (password !== confirm) next.confirm = "The passwords don't match"
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy('saving')
    try {
      const data = await authService.resetPassword({ phone, code, newPassword: password })
      toast.success('Password changed. You are signed in.')
      startTransition(() => {
        setUser(data.user)
        navigate('/home', { replace: true })
      })
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err.message)
      setBusy('')
    }
  }

  if (notReady) {
    return (
      <AuthShell title="Reset by SMS is coming soon" subtitle="Sending codes by SMS isn't switched on yet.">
        <div className="auth-form">
          <div className="alert alert-info" role="status">
            <AlertCircle size={18} />
            <span>Contact GO-GO Ride support and we&apos;ll reset your password for you.</span>
          </div>
          <Button to="/contact" size="lg" block>
            Contact support
          </Button>
          <Link to="/login" className="link-btn" style={{ alignSelf: 'center' }}>
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle={step === 'phone' ? "We'll text a 6-digit code to your account's mobile number." : 'Enter the code and choose a new password.'}
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

      {step === 'phone' ? (
        <form className="auth-form" onSubmit={sendCode} noValidate>
          <PhoneInput
            value={phone}
            onChange={(v) => {
              setPhone(v)
              if (errors.phone) setErrors({})
            }}
            error={errors.phone}
            autoFocus
            required
          />
          <Button type="submit" size="lg" block loading={busy === 'sending'} iconRight={<ArrowRight size={18} />}>
            Send code
          </Button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={reset} noValidate>
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
            <OtpInput value={code} onChange={setCode} invalid={Boolean(errors.code)} />
            {errors.code ? <span className="field-error">{errors.code}</span> : <span className="field-hint">The code is valid for 5 minutes.</span>}
          </div>
          {import.meta.env.DEV && devCode && (
            <span className="auth-dev-hint" title="Shown in development builds only">
              Dev code: <code>{devCode}</code>
            </span>
          )}
          <Input label="New password" type="password" required icon={<KeyRound size={18} />} placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password || errors.newPassword} autoComplete="new-password" />
          <Input label="Confirm new password" type="password" required icon={<KeyRound size={18} />} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" size="lg" block loading={busy === 'saving'}>
            Change password and sign in
          </Button>
          <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={sendCode} disabled={busy === 'sending'}>
            Send the code again
          </button>
        </form>
      )}
    </AuthShell>
  )
}
