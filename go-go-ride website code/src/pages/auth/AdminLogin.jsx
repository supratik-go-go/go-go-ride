import { startTransition, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Info, KeyRound, Lock, LogIn, ShieldCheck } from 'lucide-react'
import { Button, Input, LoadingSpinner, Logo, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services'
import { isAdminRole, isValidPhone, label } from '../../utils/format'
import { PhoneInput } from './PhoneInput'
import { safeNext, serverFieldErrors } from './formUtils'
import './auth.css'

export default function AdminLogin() {
  const { ready, user, isAdmin, setUser, logout } = useAuth()
  const [params] = useSearchParams()
  const dest = safeNext(params.get('next'), '/admin')
  const navigate = useNavigate()
  const toast = useToast()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!ready) return <LoadingSpinner fullPage label="" />
  if (isAdmin) return <Navigate to={dest} replace />

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    const next = {}
    if (!isValidPhone(phone) || phone.length !== 10) next.phone = 'Enter a valid 10-digit mobile number'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      const data = await authService.login(phone, password)
      if (!isAdminRole(data.user?.role)) {
        // Signed in fine, but not an admin - end that session straight away.
        await logout()
        setPassword('')
        setFormError("This account doesn't have admin access. Use the passenger app to sign in instead.")
        setBusy(false)
        return
      }
      toast.success(`Welcome back, ${data.user.name.split(' ')[0]}`)
      startTransition(() => {
        setUser(data.user)
        navigate(dest, { replace: true })
      })
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else setFormError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-admin">
      <div className="auth-admin-wrap">
        <div className="auth-admin-card">
          <div className="auth-admin-head">
            <Link to="/" aria-label="GO-GO Ride website">
              <Logo height={64} />
            </Link>
            <span className="auth-admin-badge">
              <ShieldCheck size={14} /> Admin Panel
            </span>
            <h1>Sign in to the admin panel</h1>
            <p>Manage buses, approvals, routes, users and reports.</p>
          </div>

          {user && !isAdmin && (
            <div className="alert alert-info" role="status">
              <Info size={18} />
              <span>
                You&apos;re signed in as <strong>{user.name}</strong> ({label('role', user.role)}). Sign in with an admin account to open the admin panel.
              </span>
            </div>
          )}
          {formError && (
            <div className="alert alert-danger" role="alert">
              <AlertCircle size={18} />
              <span>{formError}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={submit} noValidate>
            <PhoneInput
              label="Admin mobile number"
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
            <Button type="submit" size="lg" block loading={busy} icon={<LogIn size={18} />}>
              Sign in
            </Button>
          </form>

          <div className="auth-admin-foot">
            <Link to="/">
              <ArrowLeft size={15} /> Back to website
            </Link>
            <Link to="/login">Passenger login</Link>
          </div>
        </div>
        <p className="auth-admin-note">
          <Lock size={13} /> Authorised personnel only. Admin actions are recorded in the audit log.
        </p>
      </div>
    </div>
  )
}
