import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2, MapPin, Phone } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { rideService } from '../../services'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { formatPhone, isValidPhone } from '../../utils/format'
import './passenger-ui.css'

/**
 * Running Car waitlist form (POST /rides/notify-me, works signed out).
 * `onDone(entry)` runs after a successful sign-up.
 */
export function NotifyMeForm({ onDone, submitLabel = 'Notify Me', compact, autoFocus }) {
  const { user } = useAuth()
  const toast = useToast()
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [area, setArea] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (user?.phone) setPhone((p) => p || user.phone)
  }, [user?.phone])

  const submit = async (e) => {
    e.preventDefault()
    const local = {}
    if (!isValidPhone(phone)) local.phone = 'Enter a valid 10-digit mobile number'
    if (area.length > 80) local.area = 'Keep the area under 80 characters'
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    setBusy(true)
    setErrors({})
    try {
      const entry = await rideService.notifyMe(phone.replace(/\D/g, '').slice(-10), area.trim() || undefined)
      setDone(entry || { phone })
      toast.success('We will notify you as soon as Running Car is available near you.', "You're on the list")
      onDone?.(entry)
    } catch (err) {
      setErrors(err?.fieldErrors || {})
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="stack" style={{ '--gap': '8px', alignItems: 'center', textAlign: 'center', padding: compact ? '4px 0' : '12px 0' }} role="status">
        <span className="icon-tile lg round success">
          <CheckCircle2 size={28} />
        </span>
        <h4>You&apos;re on the list</h4>
        <p className="text-sm text-muted">
          We&apos;ll alert {formatPhone(done.phone || phone)} as soon as shared rides open{done.area ? ` around ${done.area}` : ''}.
        </p>
      </div>
    )
  }

  return (
    <form className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
      <Input
        label="Mobile number"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        required
        placeholder="10-digit mobile number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        icon={<Phone size={18} />}
        autoFocus={autoFocus}
        maxLength={16}
      />
      <Input
        label="Your area"
        placeholder="e.g. Salt Lake, Howrah"
        value={area}
        onChange={(e) => setArea(e.target.value)}
        error={errors.area}
        icon={<MapPin size={18} />}
        hint="Optional - helps us launch where people are waiting"
        maxLength={80}
      />
      <Button type="submit" variant="accent" block loading={busy} icon={<BellRing size={18} />}>
        {submitLabel}
      </Button>
    </form>
  )
}

/** Modal wrapper around NotifyMeForm. */
export function NotifyMeModal({ open, onClose, onDone }) {
  return (
    <Modal open={open} onClose={onClose} title="Get notified" subtitle="Be the first to know when Running Car shared rides reach your area." size="sm">
      {open && <NotifyMeForm onDone={onDone} />}
    </Modal>
  )
}

export default NotifyMeModal
