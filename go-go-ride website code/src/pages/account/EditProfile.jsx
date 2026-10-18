import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Camera, ImagePlus, Lock, Mail, Phone, Save, UserRound, X } from 'lucide-react'
import { Avatar, Button, Card, Input, useToast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { profileService } from '../../services'
import { formatPhone, label } from '../../utils/format'
import { isValidEmail, serverFieldErrors } from '../auth/formUtils'
import { AccountPage } from './accountShared'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function EditProfile() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef(null)

  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  if (!user) return null

  // Return to where the user came from (normally /profile) without stacking duplicate entries.
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/profile', { replace: true }))

  const nameChanged = form.name.trim() !== (user.name || '')
  const emailChanged = form.email.trim() !== (user.email || '')
  const dirty = nameChanged || emailChanged || Boolean(file)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!TYPES.includes(f.type)) {
      setErrors((x) => ({ ...x, avatar: 'Choose a JPG, PNG or WEBP image' }))
      return
    }
    if (f.size > MAX_BYTES) {
      setErrors((x) => ({ ...x, avatar: `That photo is ${(f.size / 1048576).toFixed(1)} MB - the limit is 5 MB` }))
      return
    }
    setErrors((x) => ({ ...x, avatar: undefined }))
    setFile(f)
  }

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    const name = form.name.trim()
    const email = form.email.trim()
    if (name.length < 2) next.name = 'Enter your full name (at least 2 characters)'
    else if (name.length > 80) next.name = 'Name is too long'
    if (email && !isValidEmail(email)) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length || !dirty) return

    setBusy(true)
    try {
      if (file) {
        await profileService.uploadAvatar(file)
        setFile(null)
      }
      if (nameChanged || emailChanged) {
        const body = {}
        if (nameChanged) body.name = name
        if (emailChanged) body.email = email || null
        await profileService.update(body)
      }
      await refreshUser()
      toast.success('Profile updated')
      goBack()
    } catch (err) {
      if (err.status === 409 && /email/i.test(err.message)) setErrors({ email: err.message })
      else {
        const fe = serverFieldErrors(err)
        if (fe.file) fe.avatar = fe.file
        if (Object.keys(fe).length) setErrors(fe)
        else if (/file|photo|image|extension|large/i.test(err.message)) setErrors({ avatar: err.message })
        else toast.error(err)
      }
      // a photo may have been saved even if the details failed
      refreshUser().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccountPage title="Edit Profile">
      <form className="stack" style={{ '--gap': '16px' }} onSubmit={submit} noValidate>
        <Card>
          <div className="acc-avatar-edit">
            <div className="acc-avatar-wrap">
              <Avatar src={preview || user.avatarUrl} name={form.name || user.name} size={112} />
              <button type="button" className="acc-avatar-btn" onClick={() => fileRef.current?.click()} aria-label="Change profile photo" disabled={busy}>
                <Camera size={17} />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="acc-file-input" onChange={pickFile} tabIndex={-1} aria-hidden="true" />
            </div>
            {file ? (
              <div className="row wrap" style={{ justifyContent: 'center', '--gap': '8px' }}>
                <span className="badge badge-info">
                  <ImagePlus size={13} /> New photo - saved when you tap Save
                </span>
                <button type="button" className="link-btn" onClick={() => setFile(null)} disabled={busy}>
                  <X size={14} /> Undo
                </button>
              </div>
            ) : (
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Camera size={15} /> {user.avatarUrl ? 'Change photo' : 'Add a photo'}
              </button>
            )}
            {errors.avatar ? <span className="field-error">{errors.avatar}</span> : <span className="field-hint">JPG, PNG or WEBP, up to 5 MB</span>}
          </div>
        </Card>

        <Card title="Personal details">
          <div className="stack" style={{ '--gap': '16px' }}>
            <Input
              label="Full name"
              icon={<UserRound size={18} />}
              autoComplete="name"
              maxLength={80}
              value={form.name}
              onChange={set('name')}
              error={errors.name}
              required
            />
            <Input
              label="Email"
              type="email"
              icon={<Mail size={18} />}
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              error={errors.email}
              hint="Optional - used for receipts and account recovery."
            />
            <Input
              label="Mobile number"
              icon={<Phone size={18} />}
              value={formatPhone(user.phone)}
              disabled
              readOnly
              suffix={user.phoneVerified ? <BadgeCheck size={18} className="text-success" aria-label="Verified" style={{ marginRight: 6 }} /> : null}
              hint="Your mobile number is your login and can't be changed here. Contact support to update it."
            />
            <Input label="Account type" icon={<Lock size={18} />} value={label('role', user.role)} disabled readOnly />
          </div>
        </Card>

        <div className="acc-form-actions">
          <Button variant="outline" onClick={goBack} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" icon={<Save size={18} />} loading={busy} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </AccountPage>
  )
}
