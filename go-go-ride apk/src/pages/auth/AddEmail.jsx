import { useState } from 'react'
import { ArrowRight, Mail } from 'lucide-react'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { profileService } from '../../services'
import { isValidEmail } from './formUtils'
import './phone-check.css'

/**
 * Every account needs an email since v1.13: Forgot password sends its code there (no SMS).
 * onSaved(updatedUser) runs once it is stored.
 */
export function AddEmailForm({ onSaved }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const value = email.trim()
    if (!isValidEmail(value)) {
      setError(value ? 'Enter a valid email address' : 'Enter your email address')
      return
    }
    setBusy(true)
    try {
      onSaved(await profileService.update({ email: value }))
    } catch (err) {
      setError(err.status === 409 ? 'This email is already on another GO-GO Ride account.' : err.message)
      setBusy(false)
    }
  }

  return (
    <form className="auth-check" onSubmit={submit} noValidate>
      <Input
        label="Email"
        type="email"
        icon={<Mail size={18} />}
        placeholder="you@example.com"
        autoComplete="email"
        autoCapitalize="none"
        autoFocus
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (error) setError('')
        }}
        error={error}
        hint="If you forget your password, we'll email you a code here."
        required
      />
      <Button type="submit" size="lg" block loading={busy} iconRight={<ArrowRight size={18} />}>
        Continue
      </Button>
    </form>
  )
}

/** Shown instead of the app to someone signed in without an email (accounts made before v1.13). */
export function AddEmailGate() {
  const { user, setUser } = useAuth()
  return (
    <div className="auth-email-gate">
      <div className="card auth-email-gate-card">
        <span className="icon-tile lg round accent">
          <Mail size={26} />
        </span>
        <h1>Add your email</h1>
        <p className="text-sm text-muted">
          Hi {user?.name?.split(' ')[0] || 'there'}, GO-GO Ride now needs an email on every account, so you can reset your password if you forget it.
        </p>
        <AddEmailForm onSaved={setUser} />
      </div>
    </div>
  )
}
