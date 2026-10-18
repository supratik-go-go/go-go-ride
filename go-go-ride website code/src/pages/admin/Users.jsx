import { useState } from 'react'
import { Ban, Download, Eye, Pencil, ShieldCheck, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { Avatar, Button, ConfirmDialog, DataTable, Input, Modal, SectionHeader, Select, StatusBadge, TableToolbar, optionsFrom } from '../../components/ui'
import { AdminTabs, RoleBadge, UserDrawer, useStatusCounts } from '../../components/admin'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatDate, formatDateTime, formatPhone, isAdminRole, isValidPhone, label, LABELS, todayISO } from '../../utils/format'
import './admin.css'

const TABS = [
  { value: '', label: 'All Users' },
  { value: 'BUS_OWNER', label: 'Bus Owners' },
  { value: 'DRIVER', label: 'Drivers' },
  { value: 'PASSENGER', label: 'Passengers' },
  { value: 'ADMIN', label: 'Admins' },
]

const BASE_ROLES = ['PASSENGER', 'BUS_OWNER', 'DRIVER']
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN']
const roleOptions = (superAdmin) => [...BASE_ROLES, ...(superAdmin ? ADMIN_ROLES : [])].map((r) => ({ value: r, label: label('role', r) }))
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CSV_COLUMNS = [
  { header: 'Name', value: 'name' },
  { header: 'Email', value: (u) => u.email || '' },
  { header: 'Phone', value: 'phone' },
  { header: 'Role', value: (u) => label('role', u.role) },
  { header: 'Status', value: (u) => label('userStatus', u.status) },
  { header: 'Phone Verified', value: (u) => (u.phoneVerified ? 'Yes' : 'No') },
  { header: 'Joined On', value: (u) => formatDate(u.createdAt) },
  { header: 'Last Sign-in', value: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '') },
]

// ---------------------------------------------------------------- edit user

function EditUserModal({ user, superAdmin, onClose, onSaved }) {
  const toast = useToast()
  // Remounted per user (key) so the form starts from that user's values.
  const [form, setForm] = useState(() => ({ name: user?.name || '', email: user?.email || '', role: user?.role || '' }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const promoting = form.role !== user?.role && isAdminRole(form.role)

  const save = async (e) => {
    e.preventDefault()
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters'
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length) return

    const body = {}
    if (form.name.trim() !== user.name) body.name = form.name.trim()
    if (form.email.trim() !== (user.email || '') && form.email.trim()) body.email = form.email.trim()
    if (form.role !== user.role) body.role = form.role
    if (!Object.keys(body).length) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const updated = await adminService.updateUser(user.id, body)
      toast.success(`${updated.name} updated`)
      onSaved(updated, Boolean(body.role))
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(user)}
      onClose={saving ? undefined : onClose}
      title="Edit user"
      subtitle={user && `${formatPhone(user.phone)} · joined ${formatDate(user.createdAt)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="adm-edit-user" loading={saving}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="adm-edit-user" className="stack" style={{ '--gap': '14px' }} onSubmit={save} noValidate>
        <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          hint={user?.email ? 'An email can be changed but not removed here.' : 'Optional'}
          autoComplete="off"
        />
        <Select
          label="Role"
          required
          value={form.role}
          onChange={set('role')}
          options={roleOptions(superAdmin)}
          error={errors.role}
          hint={superAdmin ? undefined : 'Only a super admin can grant admin roles.'}
        />
        {promoting && (
          <div className="alert alert-warning">
            <ShieldCheck size={18} />
            <div>Admins can approve buses, manage users and change platform settings. Grant this only to trusted staff.</div>
          </div>
        )}
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- add user

const EMPTY_NEW = { name: '', phone: '', email: '', role: 'BUS_OWNER', password: '' }

function AddUserModal({ open, onClose, onCreated }) {
  const toast = useToast()
  // Remounted each time it opens (key), so the form always starts empty.
  const [form, setForm] = useState(EMPTY_NEW)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Enter at least 2 characters'
    if (!isValidPhone(form.phone)) next.phone = 'Enter a valid 10-digit mobile number'
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address'
    if (form.password.length < 6) next.password = 'Use at least 6 characters'
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      const created = await adminService.createUser({
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, '').slice(-10),
        email: form.email.trim() || undefined,
        role: form.role,
        password: form.password,
      })
      toast.success(`${label('role', created.role)} account created for ${created.name}`)
      onCreated(created)
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Add user"
      subtitle="Create a staff, owner, driver or passenger account."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="adm-add-user" loading={saving} icon={<UserPlus size={16} />}>
            Create user
          </Button>
        </>
      }
    >
      <form id="adm-add-user" className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        <Input label="Full name" required value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" />
        <div className="grid grid-2" style={{ '--gap': '14px' }}>
          <Input label="Mobile number" required type="tel" inputMode="numeric" placeholder="10-digit mobile" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="off" />
          <Input label="Email" type="email" placeholder="Optional" value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" />
        </div>
        <Select label="Role" required value={form.role} onChange={set('role')} options={roleOptions(true)} error={errors.role} />
        <Input
          label="Temporary password"
          required
          type="password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 6 characters. Share it privately and ask them to change it after signing in."
          autoComplete="new-password"
        />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- page

export default function Users() {
  const toast = useToast()
  const { user: me, isSuperAdmin } = useAuth()
  const list = usePagedQuery(adminService.users, { limit: 10, initialFilters: { role: '', status: '' } })
  const counts = useStatusCounts(adminService.users, 'role', TABS.map((t) => t.value))
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [adding, setAdding] = useState(false)

  /** Why the current admin can't manage this account (null = allowed). */
  const lockReason = (u) => {
    if (!u) return null
    if (u.id === me?.id) return 'This is your account - manage it from My Profile'
    if (isAdminRole(u.role) && !isSuperAdmin) return 'Only a super admin can manage admin accounts'
    return null
  }

  const saved = (updated, roleChanged) => {
    list.patchRow(updated.id, updated)
    setEditing(null)
    setViewing((v) => (v?.id === updated.id ? updated : v))
    if (roleChanged) counts.reload()
  }

  const toggleStatus = async () => {
    const u = statusTarget
    const next = u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE'
    try {
      const updated = await adminService.updateUser(u.id, { status: next })
      toast.success(next === 'BLOCKED' ? `${u.name} blocked and signed out everywhere` : `${u.name} can sign in again`)
      list.patchRow(u.id, updated)
      setViewing((v) => (v?.id === u.id ? updated : v))
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const remove = async () => {
    try {
      await adminService.deleteUser(deleting.id)
      toast.success(`${deleting.name} deleted`)
      list.removeRow(deleting.id)
      setViewing((v) => (v?.id === deleting.id ? null : v))
      counts.reload()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-users-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${list.rows.length} user${list.rows.length === 1 ? '' : 's'} from this page`)
  }

  const statusButton = (u, asButton) => {
    const lock = lockReason(u)
    const blocking = u.status === 'ACTIVE'
    const text = blocking ? 'Block' : u.status === 'BLOCKED' ? 'Unblock' : 'Activate'
    if (asButton) {
      return (
        <Button variant={blocking ? 'outline-danger' : 'outline'} icon={blocking ? <Ban size={16} /> : <ShieldCheck size={16} />} onClick={() => setStatusTarget(u)} disabled={Boolean(lock)} title={lock || undefined}>
          {text}
        </Button>
      )
    }
    return (
      <button
        type="button"
        className={`adm-act ${blocking ? 'danger' : 'approve'}`}
        onClick={() => setStatusTarget(u)}
        disabled={Boolean(lock)}
        aria-label={`${text} ${u.name}`}
        title={lock || text}
      >
        {blocking ? <Ban size={15} /> : <ShieldCheck size={15} />}
      </button>
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div className="adm-person">
          <Avatar src={u.avatarUrl} name={u.name} size={36} />
          <div className="adm-cell">
            <span className="adm-cell-main">
              {u.name}
              {u.id === me?.id && <span className="adm-you">You</span>}
            </span>
            <span className="adm-cell-sub">{u.email || 'No email'}</span>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'User Type', render: (u) => <RoleBadge role={u.role} /> },
    { key: 'phone', header: 'Phone Number', render: (u) => <span className="nowrap tabular">{formatPhone(u.phone)}</span> },
    { key: 'createdAt', header: 'Joined On', render: (u) => <span className="nowrap">{formatDate(u.createdAt)}</span> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge value={u.status} group="userStatus" withDot /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => {
        const lock = lockReason(u)
        return (
          <span className="adm-actions">
            <button type="button" className="adm-act" onClick={() => setViewing(u)} aria-label={`View ${u.name}`} title="View details">
              <Eye size={16} />
            </button>
            <button type="button" className="adm-act" onClick={() => setEditing(u)} disabled={Boolean(lock)} aria-label={`Edit ${u.name}`} title={lock || 'Edit / change role'}>
              <Pencil size={15} />
            </button>
            {statusButton(u)}
            {isSuperAdmin && (
              <button
                type="button"
                className="adm-act danger"
                onClick={() => setDeleting(u)}
                disabled={u.id === me?.id}
                aria-label={`Delete ${u.name}`}
                title={u.id === me?.id ? 'You cannot delete your own account' : 'Delete'}
              >
                <Trash2 size={15} />
              </button>
            )}
          </span>
        )
      },
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))
  const role = list.filters.role
  const blocking = statusTarget?.status === 'ACTIVE'

  return (
    <div className="adm-page">
      <SectionHeader
        title="Users Management"
        subtitle="Passengers, bus owners, drivers and staff accounts."
        actions={
          isSuperAdmin && (
            <Button icon={<UserPlus size={17} />} onClick={() => setAdding(true)}>
              Add User
            </Button>
          )
        }
      />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={role} onChange={(v) => list.setFilter('role', v)} ariaLabel="User type" />
        {role === 'ADMIN' && <div className="card-note">Shows Admin accounts. Super admins are listed under All Users.</div>}
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search name, phone or email…"
          actions={
            <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
              Export
            </Button>
          }
        >
          <Select aria-label="Status" placeholder="All statuses" options={optionsFrom(LABELS.userStatus)} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} />
        </TableToolbar>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="users"
          empty={{
            icon: <UsersIcon size={24} />,
            title: list.search ? 'No users match your search' : 'No users here',
            message: list.search ? `Nothing found for "${list.search}".` : 'Accounts with this role or status will appear here.',
          }}
        />
      </section>

      <UserDrawer
        userId={viewing?.id}
        initial={viewing}
        onClose={() => setViewing(null)}
        footer={(u) =>
          lockReason(u) ? (
            <span className="text-sm text-muted" style={{ marginRight: 'auto' }}>
              {lockReason(u)}
            </span>
          ) : (
            <>
              {statusButton(u, true)}
              <Button icon={<Pencil size={16} />} onClick={() => setEditing(u)}>
                Edit user
              </Button>
            </>
          )
        }
      />

      <EditUserModal key={editing?.id || 'none'} user={editing} superAdmin={isSuperAdmin} onClose={() => setEditing(null)} onSaved={saved} />
      <AddUserModal
        key={adding ? 'open' : 'closed'}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false)
          list.reload()
          counts.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        tone={blocking ? 'danger' : 'primary'}
        title={blocking ? 'Block this user?' : 'Restore access?'}
        confirmLabel={blocking ? 'Block user' : statusTarget?.status === 'BLOCKED' ? 'Unblock' : 'Activate'}
        message={
          statusTarget &&
          (blocking ? (
            <>
              <b>{statusTarget.name}</b> will be signed out on every device immediately and won't be able to sign in until you unblock them.
            </>
          ) : (
            <>
              <b>{statusTarget.name}</b> will be able to sign in and use GO-GO Ride again.
            </>
          ))
        }
        onConfirm={toggleStatus}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this user?"
        confirmLabel="Delete permanently"
        message={
          deleting && (
            <>
              <b>{deleting.name}</b> ({formatPhone(deleting.phone)}, {label('role', deleting.role)}) will be permanently removed. This cannot be undone - consider blocking instead.
            </>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
