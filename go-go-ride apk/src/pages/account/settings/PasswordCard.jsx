import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Button, Card, Input, useToast } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { authService } from '../../../services'
import { serverFieldErrors } from '../../auth/formUtils'

export function PasswordCard() {
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
