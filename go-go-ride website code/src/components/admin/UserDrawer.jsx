import { Link } from 'react-router-dom'
import { BadgeCheck, Bus, CalendarCheck, LogIn, Mail, Phone } from 'lucide-react'
import { Avatar } from '../ui/Misc'
import { Badge, StatusBadge } from '../ui/Badge'
import { Skeleton } from '../ui/LoadingSpinner'
import { ErrorState } from '../ui/States'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services'
import { formatCurrency, formatDate, formatDateTime, formatPhone } from '../../utils/format'
import { deviceLabel } from './adminUtils'
import { DetailSection } from './BusRequestDetails'
import { Drawer } from './Drawer'
import { RoleBadge } from './RoleBadge'
import './admin-ui.css'

/** Sign-in result pill for login-activity rows (SUCCESS / FAILED). */
export function LoginStatus({ status }) {
  const ok = status === 'SUCCESS'
  return (
    <Badge tone={ok ? 'success' : 'danger'} square>
      {ok ? 'Success' : status === 'FAILED' ? 'Failed' : String(status || '-').toLowerCase()}
    </Badge>
  )
}

function Stat({ icon, value, label }) {
  return (
    <div className="adm-card" style={{ padding: '12px 14px', boxShadow: 'none' }}>
      <div className="row" style={{ '--gap': '8px' }}>
        <span className="text-muted">{icon}</span>
        <span className="fw-700 tabular" style={{ fontSize: '1.15rem' }}>
          {value}
        </span>
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

/**
 * Side panel with one user's profile (GET /admin/users/{id}): contact,
 * account dates, owned buses, last 10 bookings and last 10 sign-ins.
 *
 *   <UserDrawer userId={id} initial={row} onClose={...} footer={(user) => <Button>Block</Button>} />
 *
 * `initial` (the table row) fills the header while the detail loads;
 * `footer` may be a node or a function of the loaded user.
 */
export function UserDrawer({ userId, initial, onClose, footer }) {
  const q = useAsync(() => (userId ? adminService.user(userId) : Promise.resolve(null)), [userId])
  const user = q.data?.id === userId ? q.data : null
  const head = user || (initial?.id === userId ? initial : null)

  return (
    <Drawer
      open={Boolean(userId)}
      onClose={onClose}
      title="User details"
      footer={typeof footer === 'function' ? (head ? footer(user || head) : null) : footer}
    >
      {head && (
        <div className="row" style={{ '--gap': '14px', marginBottom: 18 }}>
          <Avatar src={head.avatarUrl} name={head.name} size={64} />
          <div className="grow">
            <div className="fw-700" style={{ fontSize: 'var(--fs-lg)' }}>
              {head.name}
            </div>
            <div className="row wrap" style={{ '--gap': '6px', marginTop: 4 }}>
              <RoleBadge role={head.role} />
              <StatusBadge value={head.status} group="userStatus" withDot />
            </div>
          </div>
        </div>
      )}

      {q.loading && !user ? (
        <div className="stack">
          <Skeleton height={110} radius={14} />
          <Skeleton height={70} radius={14} />
          <Skeleton height={160} radius={14} />
        </div>
      ) : q.error && !user ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : user ? (
        <>
          <div className="adm-facts">
            <div>
              <div className="adm-fact-label">Phone</div>
              <div className="adm-fact-value row" style={{ '--gap': '6px' }}>
                <Phone size={14} className="text-muted" />
                <a href={`tel:${user.phone}`}>{formatPhone(user.phone)}</a>
                {user.phoneVerified && <BadgeCheck size={15} className="text-success" aria-label="Verified" />}
              </div>
            </div>
            <div>
              <div className="adm-fact-label">Email</div>
              <div className="adm-fact-value row" style={{ '--gap': '6px' }}>
                <Mail size={14} className="text-muted" />
                {user.email ? <a href={`mailto:${user.email}`}>{user.email}</a> : <span className="text-muted">Not added</span>}
              </div>
            </div>
            <div>
              <div className="adm-fact-label">Joined</div>
              <div className="adm-fact-value">{formatDateTime(user.createdAt)}</div>
            </div>
            <div>
              <div className="adm-fact-label">Last sign-in</div>
              <div className="adm-fact-value">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</div>
            </div>
          </div>

          <div className="grid grid-3 keep-mobile" style={{ '--gap': '10px', marginTop: 18, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Stat icon={<Bus size={16} />} value={user.buses?.length ?? 0} label="Buses owned" />
            <Stat icon={<CalendarCheck size={16} />} value={user.bookings?.length ?? 0} label="Recent bookings" />
            <Stat icon={<LogIn size={16} />} value={user.logins?.length ?? 0} label="Recent sign-ins" />
          </div>

          {user.buses?.length > 0 && (
            <DetailSection title="Buses">
              <ul className="adm-mini-list">
                {user.buses.map((b) => (
                  <li key={b.id}>
                    <Bus size={16} className="text-muted" />
                    <Link to={`/admin/buses?search=${encodeURIComponent(b.busNumber)}`} className="fw-600 grow" onClick={onClose}>
                      {b.busNumber}
                    </Link>
                    <StatusBadge value={b.status} group="busStatus" />
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          <DetailSection title="Recent bookings" aside={<span className="text-xs text-muted">Last 10</span>}>
            {user.bookings?.length ? (
              <ul className="adm-mini-list">
                {user.bookings.map((b) => (
                  <li key={b.id}>
                    <span className="fw-600">{b.bookingRef}</span>
                    <span className="text-muted grow truncate">{formatDate(b.travelDate)}</span>
                    <span className="fw-600 tabular">{formatCurrency(b.amount)}</span>
                    <StatusBadge value={b.status} group="bookingStatus" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No bookings yet.</p>
            )}
          </DetailSection>

          <DetailSection title="Recent sign-ins" aside={<span className="text-xs text-muted">Last 10</span>}>
            {user.logins?.length ? (
              <ul className="adm-mini-list">
                {user.logins.map((l) => (
                  <li key={l.id}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="fw-500 truncate" title={l.device || ''}>
                        {deviceLabel(l.device).label}
                      </div>
                      <div className="text-xs text-muted">
                        {[l.ipAddress, l.location].filter(Boolean).join(' · ') || 'Unknown IP'} · {formatDateTime(l.createdAt)}
                      </div>
                    </div>
                    <LoginStatus status={l.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No sign-ins recorded.</p>
            )}
          </DetailSection>
        </>
      ) : null}
    </Drawer>
  )
}

export default UserDrawer
