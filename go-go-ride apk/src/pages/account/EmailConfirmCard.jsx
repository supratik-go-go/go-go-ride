import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { Button, Card, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { profileService } from '../../services'
import { OtpInput } from '../auth/OtpInput'
import { serverFieldErrors } from '../auth/formUtils'

/**
 * Confirm the account's email: a 6-digit code goes there and is typed back. Forgot password sends
 * its code only to a confirmed email. The password is asked for, so someone holding the phone can't
 * put in and confirm their own email.
 */
export function EmailConfirmCard({ email, askPassword }) {
  const { refreshUser } = useAuth()
  const toast = useToast()
  const [step, setStep] = useState('start') // start | code
  // A Google account has no password; the server says so if one is needed after all.
  const [needPassword, setNeedPassword] = useState(askPassword)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const send = async (e) => {
    e?.preventDefault()
    if (needPassword && !password.trim()) {
      setErrors({ password: 'Enter your password' })
      return
    }
    setBusy(true)
    try {
      const data = await profileService.sendEmailCode({ email, password: needPassword ? password : undefined })
      setDevCode(import.meta.env.DEV ? data?.devCode || '' : '')
      setCode('')
      setErrors({})
      setStep('code')
      toast.success(`Code sent to ${data?.sentTo || email}`)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (fe.password) {
        setNeedPassword(true)
        setStep('start')
      }
      if (Object.keys(fe).length) setErrors(fe)
      else toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (value = code) => {
    if (value.length !== 6) {
      setErrors({ code: 'Enter the 6-digit code' })
      return
    }
    setBusy(true)
    try {
      await profileService.confirmEmail(value)
      toast.success('Forgot password can now send you a code there.', 'Email confirmed')
      // The card goes once the account says the email is confirmed.
      await refreshUser()
    } catch (err) {
      setErrors({ code: err.message })
      setBusy(false)
    }
  }

  return (
    <Card title="Confirm your email">
      {step === 'start' ? (
        <form className="stack" style={{ '--gap': '14px' }} onSubmit={send} noValidate>
          <div className="alert alert-info">
            <MailCheck size={18} />
            <span>
              Confirm <strong>{email}</strong> so that Forgot password can send you a code there.
            </span>
          </div>
          {needPassword && (
            <Input
              label="Your password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors({})
              }}
              error={errors.password}
              hint="So that nobody else holding your phone can do this."
              required
            />
          )}
          {errors.email && <span className="field-error">{errors.email}</span>}
          <Button type="submit" loading={busy} style={{ alignSelf: 'flex-end' }}>
            Send code
          </Button>
        </form>
      ) : (
        <div className="stack" style={{ '--gap': '14px' }}>
          <p>
            Type the 6-digit code we sent to <strong>{email}</strong>.
          </p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v)
              setErrors({})
            }}
            onComplete={confirm}
            disabled={busy}
            invalid={Boolean(errors.code)}
          />
          {errors.code && <span className="field-error">{errors.code}</span>}
          {import.meta.env.DEV && devCode && (
            <p className="field-hint">
              Dev code: <code>{devCode}</code>
            </p>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={send} disabled={busy}>
              Send again
            </Button>
            <Button onClick={() => confirm()} loading={busy}>
              Confirm
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
