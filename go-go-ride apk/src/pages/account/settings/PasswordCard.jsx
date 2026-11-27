import { useEffect, useState } from 'react'
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react'
import { Button, Card, Input, Spinner, useToast } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { authService } from '../../../services'
import { formatPhone } from '../../../utils/format'
import { PhoneCheck } from '../../auth/PhoneCheck'
import { serverFieldErrors } from '../../auth/formUtils'

export function PasswordCard() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // Once the server asks for it, one SMS from the account's number replaces the current password.
  const [checkNeeded, setCheckNeeded] = useState(null) // null while asking
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    authService.phoneCheckRequired().then(setCheckNeeded, () => setCheckNeeded(false))
  }, [])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const submit = (ev) => {
    ev.preventDefault()
    const e = {}
    if (form.next.length < 6) e.next = 'Use at least 6 characters'
    else if (form.next.length > 72) e.next = 'Use at most 72 characters'
    else if (!checkNeeded && form.current && form.next === form.current) e.next = 'Choose a password different from the current one'
    if (form.confirm !== form.next) e.confirm = 'Passwords do not match'
    setErrors(e)
    if (Object.keys(e).length) return
    if (checkNeeded) setVerifying(true)
    else save()
  }

  /** check: { checkId, checkToken } from PhoneCheck, when the server asks for one. */
  const save = async (check) => {
    setBusy(true)
    try {
      await authService.changePassword(checkNeeded ? undefined : form.current || undefined, form.next, check)
      toast.success('Sign in again with your new password.', 'Password updated')
      // The API revokes every session (this one included), so end it now - the auth guard sends us to /login.
      await logout()
    } catch (err) {
      setBusy(false)
      setVerifying(false)
      // Switched on since this page opened: prove the number first.
      if (err.code === 'PHONE_CHECK_REQUIRED') {
        setCheckNeeded(true)
        setVerifying(true)
        return
      }
      const fe = serverFieldErrors(err)
      if (fe.newPassword) fe.next = fe.newPassword
      if (fe.currentPassword) fe.current = fe.currentPassword
      if (/current password/i.test(err.message)) setErrors({ current: err.message })
      else if (Object.keys(fe).length) setErrors(fe)
      else toast.error(err)
    }
  }

  const head = (
    <div className="acc-setting-head">
      <span className="icon-tile">
        <KeyRound size={20} />
      </span>
      <div>
        <h2>Change password</h2>
        <p>{verifying ? 'Send the SMS below to prove the number is yours.' : 'Use it to sign in with your mobile number and password.'}</p>
      </div>
    </div>
  )

  // After a Google sign-in there is no number yet, and a password only works with the number.
  if (!user?.phone) {
    return (
      <Card>
        {head}
        <div className="alert alert-info">
          <ShieldCheck size={18} />
          <span>Add your mobile number first: you sign in with the number and this password.</span>
        </div>
        <Button to="/settings/phone" style={{ alignSelf: 'flex-start' }}>
          Add mobile number
        </Button>
      </Card>
    )
  }

  if (checkNeeded === null) {
    return (
      <Card>
        {head}
        <div className="auth-check-status" role="status">
          <Spinner size={18} /> Loading...
        </div>
      </Card>
    )
  }

  if (verifying) {
    return (
      <Card>
        {head}
        {busy ? (
          <div className="auth-check-status" role="status">
            <Spinner size={18} /> Saving your new password...
          </div>
        ) : (
          <div className="stack" style={{ '--gap': '14px' }}>
            <PhoneCheck
              purpose="CHANGE"
              phone={user?.phone}
              onVerified={save}
              onUnavailable={() => {
                setCheckNeeded(false)
                setVerifying(false)
              }}
            />
            <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => setVerifying(false)} style={{ alignSelf: 'center' }}>
              Back
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card>
      {head}
      <form className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        {!checkNeeded && (
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={set('current')}
            error={errors.current}
            hint="Signed up with OTP and never set one? Leave this blank."
          />
        )}
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
          <span>
            {checkNeeded && <>Next, you&apos;ll send one SMS from {formatPhone(user?.phone)} to prove it&apos;s you. </>}
            For your security, changing your password signs you out on every device - including this one. You&apos;ll sign in again with the new password.
          </span>
        </div>
        <Button type="submit" loading={busy} disabled={!form.next || !form.confirm} style={{ alignSelf: 'flex-end' }}>
          {checkNeeded ? 'Next' : 'Update password'}
        </Button>
      </form>
    </Card>
  )
}
