import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, KeyRound, Mail, Monitor, Save, ShieldCheck, Smartphone, Tablet, User } from 'lucide-react'
import { Avatar, Button, DataTable, Input, SectionHeader } from '../../components/ui'
import { LoginStatus, RoleBadge, deviceLabel } from '../../components/admin'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { authService, profileService } from '../../services'
import { formatDateTime, formatPhone } from '../../utils/format'
import './admin.css'

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR = 5 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor, other: Monitor }

function ReadOnly({ label, children }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="adm-readonly">{children}</div>
    </div>
  )
}

function ProfileCard() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [form, setForm] = useState(() => ({ name: user?.name || '', email: user?.email || '' }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const dirty = form.name.trim() !== (user?.name || '') || form.email.trim() !== (user?.email || '')

  const save = async (e) => {
    e.preventDefault()
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters'
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length) return

    const body = {}
    if (form.name.trim() !== user.name) body.name = form.name.trim()
    if (form.email.trim() !== (user.email || '')) body.email = form.email.trim() || null
    setSaving(true)
    try {
      await profileService.update(body)
      const me = await refreshUser()
      setForm({ name: me?.name || '', email: me?.email || '' })
      toast.success('Profile updated')
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error('Choose a JPG, PNG or WEBP image')
      return
    }
    if (file.size > MAX_AVATAR) {
      toast.error('The photo must be 5 MB or smaller')
      return
    }
    setUploading(true)
    try {
      await profileService.uploadAvatar(file)
      await refreshUser()
      toast.success('Profile photo updated')
    } catch (err) {
      toast.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2 className="adm-card-title">Profile Information</h2>
      </div>
      <form className="adm-card-body" onSubmit={save} noValidate>
        <div className="adm-profile-body">
          <div className="adm-avatar-col">
            <div className="adm-avatar-wrap">
              <Avatar src={user?.avatarUrl} name={user?.name} size={112} />
              <button type="button" className="adm-avatar-btn" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo" title="Change photo">
                {uploading ? <span className="dot dot-pulse" /> : <Camera size={16} />}
              </button>
            </div>
            <button type="button" className="link-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Change Photo'}
            </button>
            <span className="text-xs text-muted">JPG, PNG or WEBP, up to 5 MB</span>
            <input ref={fileRef} type="file" accept={AVATAR_TYPES.join(',')} onChange={pickPhoto} hidden />
          </div>

          <div className="stack" style={{ '--gap': '14px' }}>
            <Input label="Full Name" required icon={<User size={17} />} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} autoComplete="name" />
            <Input
              label="Email"
              type="email"
              icon={<Mail size={17} />}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={errors.email}
              placeholder="you@gogoride.com"
              autoComplete="email"
            />
            <div className="grid grid-2" style={{ '--gap': '14px' }}>
              <ReadOnly label="Phone Number">{formatPhone(user?.phone)}</ReadOnly>
              <ReadOnly label="Role">
                <RoleBadge role={user?.role} />
              </ReadOnly>
            </div>
            <div className="grid grid-2" style={{ '--gap': '14px' }}>
              <ReadOnly label="Joined On">{formatDateTime(user?.createdAt)}</ReadOnly>
              <ReadOnly label="Last Sign-in">{user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '-'}</ReadOnly>
            </div>
            <p className="text-xs text-muted">Your phone number is your sign-in ID and can't be changed here.</p>
            <div>
              <Button type="submit" variant="accent" icon={<Save size={16} />} loading={saving} disabled={!dirty}>
                Update Profile
              </Button>
            </div>
          </div>
        </div>
      </form>
    </section>
  )
}

function PasswordCard({ onChanged }) {
  const { user, login, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const v = {}
    if (!form.current) v.current = 'Enter your current password'
    if (form.next.length < 6) v.next = 'Use at least 6 characters'
    else if (form.next === form.current) v.next = 'Choose a password different from the current one'
    if (form.confirm !== form.next) v.confirm = 'Passwords do not match'
    setErrors(v)
    if (Object.keys(v).length) return

    setSaving(true)
    try {
      await authService.changePassword(form.current, form.next)
    } catch (err) {
      const fe = err.fieldErrors || {}
      setErrors({ current: fe.currentPassword || (/current password/i.test(err.message) ? err.message : undefined), next: fe.newPassword })
      toast.error(err)
      setSaving(false)
      return
    }
    // The API revokes every session, this one included - sign straight back in
    // with the new password so only the other devices are logged out.
    try {
      await login(user.phone, form.next)
      setForm({ current: '', next: '', confirm: '' })
      toast.success('Password changed. You were signed out on all other devices.')
      onChanged?.()
    } catch {
      toast.success('Password changed. Please sign in again with your new password.')
      await logout()
      navigate('/admin/login', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="adm-card">
      <div className="adm-card-head">
        <h2 className="adm-card-title">Change Password</h2>
        <KeyRound size={18} className="text-muted" />
      </div>
      <form className="adm-card-body stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        <Input label="Current Password" type="password" required value={form.current} onChange={set('current')} error={errors.current} placeholder="Enter current password" autoComplete="current-password" />
        <Input label="New Password" type="password" required value={form.next} onChange={set('next')} error={errors.next} placeholder="Enter new password" hint="At least 6 characters" autoComplete="new-password" />
        <Input label="Confirm Password" type="password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} placeholder="Confirm new password" autoComplete="new-password" />
        <div className="alert alert-info">
          <ShieldCheck size={18} />
          <div>Changing your password signs you out on every other device.</div>
        </div>
        <Button type="submit" variant="accent" block loading={saving} disabled={!form.current || !form.next || !form.confirm}>
          Change Password
        </Button>
      </form>
    </section>
  )
}

export default function AdminProfile() {
  const logins = usePagedQuery(profileService.loginActivity, { limit: 8 })

  const columns = [
    {
      key: 'device',
      header: 'Device',
      render: (l) => {
        const d = deviceLabel(l.device)
        const Icon = DEVICE_ICON[d.kind]
        return (
          <span className="row" style={{ '--gap': '10px' }} title={l.device || undefined}>
            <span className="icon-tile sm">
              <Icon size={16} />
            </span>
            <span className="fw-500 nowrap">{d.label}</span>
          </span>
        )
      },
    },
    { key: 'ipAddress', header: 'IP Address', render: (l) => <span className="tabular">{l.ipAddress || '-'}</span> },
    { key: 'location', header: 'Location', render: (l) => l.location || <span className="text-muted">Unknown</span> },
    { key: 'createdAt', header: 'Login Time', render: (l) => <span className="nowrap">{formatDateTime(l.createdAt)}</span> },
    { key: 'status', header: 'Status', render: (l) => <LoginStatus status={l.status} /> },
  ]

  return (
    <div className="adm-page">
      <SectionHeader
        title="Admin Profile"
        subtitle={
          <span className="row" style={{ '--gap': '4px', display: 'inline-flex' }}>
            <Link to="/admin/settings">Settings</Link> <ChevronRight size={13} /> Admin Profile
          </span>
        }
      />

      <div className="adm-profile-grid">
        <ProfileCard />
        <PasswordCard onChanged={logins.reload} />
      </div>

      <section className="adm-card adm-table-card compact">
        <div className="adm-card-head" style={{ paddingBottom: 14 }}>
          <div>
            <h2 className="adm-card-title">Login Activity</h2>
            <div className="adm-card-sub">Recent sign-ins to your account</div>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={logins.rows}
          loading={logins.loading}
          error={logins.error}
          onRetry={logins.reload}
          meta={logins.meta}
          onPageChange={logins.setPage}
          noun="sign-ins"
          empty={{ title: 'No sign-ins recorded', message: 'Sign-ins to your account will be listed here.' }}
        />
      </section>
    </div>
  )
}
