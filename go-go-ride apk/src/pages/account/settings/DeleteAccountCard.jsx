import { startTransition, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Button, Card, Input, Modal, useToast } from '../../../components/ui'
import { useAuth } from '../../../context/AuthContext'
import { alarmNotifications } from '../../../native/alarmNotifications'
import { authService, profileService } from '../../../services'

export function DeleteAccountCard() {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setOpen(false)
    setPassword('')
    setError('')
  }

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await profileService.deleteAccount(password || undefined)
    } catch (err) {
      setError(err.message)
      setBusy(false)
      return
    }
    await alarmNotifications.clearAll().catch(() => {})
    await authService.logout()
    // Same transition as the navigation, so the sign-in guard never sees this page signed out.
    startTransition(() => {
      setUser(null)
      navigate('/', { replace: true })
    })
    toast.success('Your account has been deleted')
  }

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile danger">
          <Trash2 size={20} />
        </span>
        <div className="grow">
          <h2>Delete account</h2>
          <p>Permanently remove your account and personal data</p>
        </div>
      </div>
      <Button variant="outline-danger" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Delete your account?"
        subtitle="This can't be undone."
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} loading={busy}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="stack" style={{ '--gap': '12px' }}>
          <p className="text-sm text-2">Your profile, alarms, favourites, searches, reviews and notifications will be removed.</p>
          <Input
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            hint="Leave blank if your account has no password."
          />
        </div>
      </Modal>
    </Card>
  )
}
