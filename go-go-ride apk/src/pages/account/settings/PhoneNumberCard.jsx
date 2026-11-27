import { useEffect, useState } from 'react'
import { ArrowLeft, Smartphone } from 'lucide-react'
import { Button, Card, Spinner, useToast } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { authService } from '../../../services'
import { formatPhone, isValidPhone } from '../../../utils/format'
import { PhoneCheck } from '../../auth/PhoneCheck'
import { PhoneInput } from '../../auth/PhoneInput'

/**
 * The account's mobile number. After a Google sign-in there is none yet: it is added here, proved
 * with one SMS once the server asks for that (like a sign-up).
 */
export function PhoneNumberCard() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [checkNeeded, setCheckNeeded] = useState(null) // null while asking
  const [verifying, setVerifying] = useState(false)
  const [busy, setBusy] = useState(false)
  const hasNumber = Boolean(user?.phone)

  useEffect(() => {
    if (!hasNumber) authService.phoneCheckRequired().then(setCheckNeeded, () => setCheckNeeded(false))
  }, [hasNumber])

  const head = (
    <div className="acc-setting-head">
      <span className="icon-tile">
        <Smartphone size={20} />
      </span>
      <div>
        <h2>Mobile number</h2>
        <p>{hasNumber ? 'You sign in with this number and your password.' : 'Add your number to sign in with it too and to reset your password.'}</p>
      </div>
    </div>
  )

  if (hasNumber) {
    return (
      <Card>
        {head}
        <p>
          <strong>{formatPhone(user.phone)}</strong>
          {user.phoneVerified ? ' (verified)' : ''}
        </p>
        <p className="text-sm text-muted">To change it, contact GO-GO Ride support.</p>
      </Card>
    )
  }

  /** check: { checkId, checkToken } from PhoneCheck, when the server asks for one. */
  const save = async (check) => {
    setBusy(true)
    try {
      setUser(await authService.addPhone({ phone, ...check }))
      toast.success('Mobile number added')
    } catch (err) {
      setBusy(false)
      setVerifying(false)
      if (err.code === 'PHONE_CHECK_REQUIRED') {
        setCheckNeeded(true)
        setVerifying(true)
        return
      }
      setError(err.message)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (!isValidPhone(phone) || phone.length !== 10) {
      setError('Enter your 10-digit mobile number')
      return
    }
    setError('')
    if (checkNeeded) setVerifying(true)
    else save()
  }

  if (checkNeeded === null || busy) {
    return (
      <Card>
        {head}
        <div className="auth-check-status" role="status">
          <Spinner size={18} /> {busy ? 'Saving your number...' : 'Loading...'}
        </div>
      </Card>
    )
  }

  if (verifying) {
    return (
      <Card>
        {head}
        <div className="stack" style={{ '--gap': '14px' }}>
          <PhoneCheck
            purpose="REGISTER"
            phone={phone}
            onVerified={save}
            onUnavailable={() => {
              setCheckNeeded(false)
              setVerifying(false)
              save()
            }}
            onError={(err) => {
              setVerifying(false)
              setError(err.message)
            }}
          />
          <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={() => setVerifying(false)} style={{ alignSelf: 'center' }}>
            Back
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      {head}
      <form className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        <PhoneInput
          value={phone}
          onChange={(v) => {
            setPhone(v)
            if (error) setError('')
          }}
          error={error}
          required
        />
        {checkNeeded && <p className="text-sm text-muted">Next, you&apos;ll send one SMS from this number to prove it&apos;s yours.</p>}
        <Button type="submit" disabled={phone.length !== 10} style={{ alignSelf: 'flex-end' }}>
          {checkNeeded ? 'Next' : 'Add number'}
        </Button>
      </form>
    </Card>
  )
}
