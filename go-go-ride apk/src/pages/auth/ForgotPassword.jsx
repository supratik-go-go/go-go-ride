import { startTransition, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, KeyRound, PencilLine } from 'lucide-react'
import { Button, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { formatPhone, isValidPhone } from '../../utils/format'
import { AuthShell } from './AuthShell'
import { PhoneInput } from './PhoneInput'
import { PhoneCheck } from './PhoneCheck'
import { serverFieldErrors } from './formUtils'

/**
 * Forgot password: the person proves the account's number by sending an SMS from it (PhoneCheck),
 * then sets a new password and is signed in. Until the server has number checks switched on, the
 * screen points to support instead.
 */
export default function ForgotPassword() {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState('phone') // phone | verify | password
  const [phone, setPhone] = useState('')
  const [check, setCheck] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const toVerify = (e) => {
    e.preventDefault()
    setFormError('')
    if (!isValidPhone(phone)) {
      setErrors({ phone: 'Enter your 10-digit mobile number' })
      return
    }
    setErrors({})
    setStep('verify')
  }

  const reset = async (e) => {
    e.preventDefault()
    const next = {}
    if (password.trim().length < 6) next.password = 'Use at least 6 characters'
    if (password !== confirm) next.confirm = "The passwords don't match"
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError('')
    try {
      const data = await authService.resetPassword({ phone, newPassword: password, ...check })
      toast.success('Password changed. You are signed in.')
      startTransition(() => {
        setUser(data.user)
        navigate('/home', { replace: true })
      })
    } catch (err) {
      setBusy(false)
      if (/^CHECK_/.test(err.code || '')) {
        setCheck(null)
        setStep('verify')
        setFormError(err.message)
        return
      }
      const fe = serverFieldErrors(err)
      if (fe.newPassword) fe.password = fe.newPassword
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err.message)
    }
  }

  if (notReady) {
    return (
      <AuthShell title="Reset by SMS is coming soon" subtitle="Checking your number by SMS isn't switched on yet.">
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

  const subtitle = {
    phone: "Enter your account's mobile number. You'll prove it's yours with one SMS.",
    verify: 'Send the SMS below from your phone.',
    password: 'Number verified. Choose a new password.',
  }[step]

  return (
    <AuthShell
      title="Forgot password"
      subtitle={subtitle}
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

      {step === 'phone' && (
        <form className="auth-form" onSubmit={toVerify} noValidate>
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
          <Button type="submit" size="lg" block iconRight={<ArrowRight size={18} />}>
            Next
          </Button>
        </form>
      )}

      {step !== 'phone' && (
        <div className="auth-sent-to">
          <span>
            Account <strong>{formatPhone(phone)}</strong>
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setStep('phone')
              setCheck(null)
              setErrors({})
              setFormError('')
            }}
          >
            <PencilLine size={14} /> Change
          </button>
        </div>
      )}

      {step === 'verify' && (
        <PhoneCheck
          purpose="RESET"
          phone={phone}
          onVerified={(c) => {
            setCheck(c)
            setFormError('')
            setStep('password')
          }}
          onUnavailable={() => setNotReady(true)}
          onError={(err) => {
            setStep('phone')
            setErrors({ phone: err.message })
          }}
        />
      )}

      {step === 'password' && (
        <form className="auth-form" onSubmit={reset} noValidate>
          <Input label="New password" type="password" required icon={<KeyRound size={18} />} placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" autoFocus />
          <Input label="Confirm new password" type="password" required icon={<KeyRound size={18} />} placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" size="lg" block loading={busy}>
            Change password and sign in
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
