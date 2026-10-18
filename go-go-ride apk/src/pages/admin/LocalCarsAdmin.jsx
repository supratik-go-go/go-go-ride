import { useEffect, useState } from 'react'
import { BadgeCheck, CarFront, Download, Eye, MessageSquareText, Phone, Power, PowerOff, Star, Trash2 } from 'lucide-react'
import { Avatar, Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Modal, SectionHeader, Skeleton, StarRating, StatusBadge, TableToolbar } from '../../components/ui'
import { AdminTabs, DetailSection, useStatusCounts } from '../../components/admin'
import { Switch, plural, telHref } from '../../components/admin-ops'
import { assetUrl } from '../../api/client'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { localCarService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatDate, formatPhone, label, timeAgo, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const TABS = [
  { value: '', label: 'All Cars' },
  { value: 'true', label: 'Verified' },
  { value: 'false', label: 'Unverified' },
]

const carLine = (c) => [c.carModel, c.carNumber].filter(Boolean).join(' · ')

const CSV_COLUMNS = [
  { header: 'Driver', value: 'driverName' },
  { header: 'Phone', value: 'phone' },
  { header: 'Area', value: 'area' },
  { header: 'Car Model', value: (c) => c.carModel || '' },
  { header: 'Car Number', value: (c) => c.carNumber || '' },
  { header: 'Availability', value: (c) => c.availabilityLabel || `${c.availableFrom} - ${c.availableTo}` },
  { header: 'Rating', value: (c) => c.ratingAvg ?? '' },
  { header: 'Reviews', value: (c) => c.ratingCount ?? 0 },
  { header: 'Verified', value: (c) => (c.verified ? 'Yes' : 'No') },
  { header: 'Status', value: (c) => label('recordStatus', c.status) },
  { header: 'Listed On', value: (c) => formatDate(c.createdAt) },
]

function Rating({ car }) {
  if (!car.ratingCount) return <span className="text-muted text-sm">No ratings</span>
  return (
    <span className="ops-rating" title={`${car.ratingAvg} average from ${plural(car.ratingCount, 'review')}`}>
      <Star size={14} /> {Number(car.ratingAvg).toFixed(1)} <small>({car.ratingCount})</small>
    </span>
  )
}

function CarThumb({ car, size = 40 }) {
  const url = assetUrl(car?.photoUrl)
  if (url) return <img src={url} alt="" className="ops-car-thumb" style={{ width: size, height: size }} loading="lazy" />
  return <Avatar name={car?.driverName} size={size} />
}

// ---------------------------------------------------------------- details

function CarDetailsModal({ carId, initial, onClose, onVerify, onStatus, verifying }) {
  const q = useAsync(() => (carId ? localCarService.get(carId) : Promise.resolve(null)), [carId])
  const loaded = q.data?.id === carId ? q.data : null
  // Row data (kept fresh by the page) wins for verified / status; reviews come from the detail call.
  const car = loaded ? { ...loaded, ...(initial?.id === carId ? { verified: initial.verified, status: initial.status } : null) } : initial?.id === carId ? initial : null
  const tel = telHref(car?.phone)

  return (
    <Modal
      open={Boolean(carId)}
      onClose={onClose}
      size="md"
      title="Local car details"
      footer={
        car && (
          <div className="adm-footer-row">
            {tel && (
              <Button variant="outline" href={tel} icon={<Phone size={16} />}>
                Call driver
              </Button>
            )}
            <Button variant={car.status === 'ACTIVE' ? 'outline-danger' : 'success'} icon={car.status === 'ACTIVE' ? <PowerOff size={16} /> : <Power size={16} />} onClick={() => onStatus(car)}>
              {car.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant={car.verified ? 'outline' : 'primary'} icon={<BadgeCheck size={16} />} loading={verifying} onClick={() => onVerify(car, !car.verified)}>
              {car.verified ? 'Remove verification' : 'Mark verified'}
            </Button>
          </div>
        )
      }
    >
      {!car ? (
        q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} compact />
        ) : (
          <div className="stack">
            <Skeleton height={84} radius={18} />
            <Skeleton height={160} radius={12} />
          </div>
        )
      ) : (
        <>
          <div className="ops-car-hero">
            <CarThumb car={car} size={84} />
            <div className="stack" style={{ '--gap': '4px', minWidth: 0 }}>
              <div className="row wrap" style={{ '--gap': '8px' }}>
                <span className="fw-700 text-lg">{car.driverName}</span>
                {car.verified ? (
                  <Badge tone="success" icon={<BadgeCheck size={13} />}>
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="warning">Not verified</Badge>
                )}
              </div>
              <span className="text-sm text-2">{carLine(car) || 'Car details not added'}</span>
              <span className="row wrap" style={{ '--gap': '8px' }}>
                <StarRating value={car.ratingAvg || 0} size={15} />
                <span className="text-xs text-muted">
                  {car.ratingCount ? `${Number(car.ratingAvg).toFixed(1)} from ${plural(car.ratingCount, 'rating')}` : 'No ratings yet'}
                </span>
              </span>
            </div>
          </div>

          <DetailSection title="Listing">
            <div className="adm-facts">
              <div>
                <div className="adm-fact-label">Phone</div>
                <div className="adm-fact-value">{tel ? <a href={tel}>{formatPhone(car.phone)}</a> : '-'}</div>
              </div>
              <div>
                <div className="adm-fact-label">Area</div>
                <div className="adm-fact-value">{car.area}</div>
              </div>
              <div>
                <div className="adm-fact-label">Availability</div>
                <div className="adm-fact-value">{car.availabilityLabel || `${car.availableFrom} - ${car.availableTo}`}</div>
              </div>
              <div>
                <div className="adm-fact-label">Status</div>
                <div className="adm-fact-value">
                  <StatusBadge value={car.status} group="recordStatus" withDot />
                </div>
              </div>
              <div>
                <div className="adm-fact-label">Listed by</div>
                <div className="adm-fact-value">{car.ownerId ? 'A registered owner account' : 'GO-GO Ride team'}</div>
              </div>
              <div>
                <div className="adm-fact-label">Listed on</div>
                <div className="adm-fact-value">{car.createdAt ? formatDate(car.createdAt) : '-'}</div>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Recent reviews" aside={loaded && <span className="text-xs text-muted">Latest 10 shown</span>}>
            {!loaded ? (
              q.error ? (
                <ErrorState error={q.error} onRetry={q.reload} compact />
              ) : (
                <Skeleton height={90} radius={12} />
              )
            ) : loaded.reviews?.length ? (
              <ul className="ops-reviews">
                {loaded.reviews.map((r) => (
                  <li key={r.id}>
                    <Avatar src={r.user?.avatarUrl} name={r.user?.name || 'User'} size={36} />
                    <div className="grow">
                      <div className="row-between">
                        <span className="fw-600 text-sm">{r.user?.name || 'GO-GO Ride user'}</span>
                        <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
                      </div>
                      <StarRating value={r.rating} size={13} />
                      {r.comment && <p>{r.comment}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={<MessageSquareText size={22} />}
                title={loaded.ratingCount ? 'No written reviews to show' : 'No reviews yet'}
                message="Reviews passengers write about this driver appear here."
              />
            )}
          </DetailSection>
        </>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- page

export default function LocalCarsAdmin() {
  const toast = useToast()
  const list = usePagedQuery(localCarService.list, { limit: 10, initialFilters: { verified: '', area: '' } })
  const counts = useStatusCounts(localCarService.list, 'verified', TABS.map((t) => t.value))
  const [area, setArea] = useState('')
  const debouncedArea = useDebounce(area.trim(), 300)
  const [verifying, setVerifying] = useState({}) // id -> true while saving
  const [viewing, setViewing] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const { setFilter } = list

  useEffect(() => {
    setFilter('area', debouncedArea)
  }, [debouncedArea, setFilter])

  const verify = async (car, next) => {
    if (verifying[car.id]) return
    setVerifying((v) => ({ ...v, [car.id]: true }))
    list.patchRow(car.id, { verified: next }) // optimistic
    if (viewing?.id === car.id) setViewing((v) => ({ ...v, verified: next }))
    try {
      const updated = await localCarService.verify(car.id, next)
      list.patchRow(car.id, updated)
      if (viewing?.id === car.id) setViewing((v) => (v ? { ...v, ...updated } : v))
      toast.success(next ? `${car.driverName} is now verified` : `Verification removed for ${car.driverName}`)
      counts.reload()
    } catch (err) {
      list.patchRow(car.id, { verified: car.verified }) // roll back
      if (viewing?.id === car.id) setViewing((v) => (v ? { ...v, verified: car.verified } : v))
      toast.error(err)
    } finally {
      setVerifying((v) => {
        const n = { ...v }
        delete n[car.id]
        return n
      })
    }
  }

  const setStatus = async (car, next) => {
    try {
      const updated = await localCarService.update(car.id, { status: next })
      list.patchRow(car.id, updated)
      setViewing((v) => (v?.id === car.id ? { ...v, ...updated } : v))
      toast.success(next === 'ACTIVE' ? `${car.driverName} is listed again` : `${car.driverName} is hidden from passengers`)
      counts.reload()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const askStatus = (car) => {
    if (car.status === 'ACTIVE') setStatusTarget(car)
    else setStatus(car, 'ACTIVE').catch(() => {})
  }

  const remove = async () => {
    try {
      await localCarService.remove(deleting.id)
      toast.success(`${deleting.driverName}'s listing removed`)
      list.removeRow(deleting.id)
      setViewing((v) => (v?.id === deleting.id ? null : v))
      counts.reload()
    } catch (err) {
      toast.error(err?.code === 'INVALID_REFERENCE' ? `${err.message}. This car has bookings - deactivate it instead.` : err)
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-local-cars-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${plural(list.rows.length, 'car')} from this page`)
  }

  const columns = [
    {
      key: 'driver',
      header: 'Driver',
      render: (c) => (
        <div className="adm-person">
          <CarThumb car={c} size={38} />
          <div className="adm-cell">
            <span className="adm-cell-main">{c.driverName}</span>
            <span className="adm-cell-sub">{c.createdAt ? `Listed ${formatDate(c.createdAt)}` : 'Local car'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (c) =>
        telHref(c.phone) ? (
          <a className="ops-link tabular" href={telHref(c.phone)} onClick={(e) => e.stopPropagation()}>
            {formatPhone(c.phone)}
          </a>
        ) : (
          '-'
        ),
    },
    { key: 'area', header: 'Area', render: (c) => c.area },
    {
      key: 'car',
      header: 'Car',
      render: (c) =>
        carLine(c) ? (
          <div className="adm-cell">
            <span className="text-sm fw-500 nowrap">{c.carModel || 'Car'}</span>
            {c.carNumber && <span className="adm-cell-sub">{c.carNumber}</span>}
          </div>
        ) : (
          <span className="text-muted">Not added</span>
        ),
    },
    {
      key: 'availability',
      header: 'Availability',
      render: (c) => {
        const [from, to] = String(c.availabilityLabel || `${c.availableFrom} - ${c.availableTo}`).split(' - ')
        return (
          <span className="adm-datetime text-sm">
            {from}
            {to && <small>to {to}</small>}
          </span>
        )
      },
    },
    { key: 'rating', header: 'Rating', render: (c) => <Rating car={c} /> },
    {
      key: 'verified',
      header: 'Verified',
      render: (c) => (
        <span className="ops-switch-row">
          <Switch checked={c.verified} onChange={(next) => verify(c, next)} busy={Boolean(verifying[c.id])} label={`Verified badge for ${c.driverName}`} title={c.verified ? 'Remove the verified badge' : 'Mark as verified'} />
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge value={c.status} group="recordStatus" withDot /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (c) => (
        <span className="adm-actions">
          <button type="button" className="adm-act" onClick={() => setViewing(c)} aria-label={`View ${c.driverName}`} title="View details & reviews">
            <Eye size={16} />
          </button>
          <button
            type="button"
            className={`adm-act ${c.status === 'ACTIVE' ? 'danger' : 'approve'}`}
            onClick={() => askStatus(c)}
            aria-label={`${c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${c.driverName}`}
            title={c.status === 'ACTIVE' ? 'Deactivate (hide from passengers)' : 'Activate'}
          >
            {c.status === 'ACTIVE' ? <PowerOff size={15} /> : <Power size={15} />}
          </button>
          <button type="button" className="adm-act danger" onClick={() => setDeleting(c)} aria-label={`Delete ${c.driverName}`} title="Delete">
            <Trash2 size={15} />
          </button>
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))

  return (
    <div className="adm-page">
      <SectionHeader title="Local Cars" subtitle="Drivers passengers can call directly - verify them, hide or remove listings." />

      <section className="adm-card adm-table-card ops-dense">
        <AdminTabs items={tabItems} value={list.filters.verified} onChange={(v) => list.setFilter('verified', v)} ariaLabel="Verification" />
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search driver, area or car model…"
          actions={
            <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
              Export
            </Button>
          }
        >
          <input className="input ops-toolbar-input" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Filter by area…" aria-label="Filter by area" />
        </TableToolbar>
        <div className="card-note">
          Only active listings are returned by the server. A car you deactivate stays here until you refresh, then disappears from every list (the API has no admin view of inactive cars yet).
        </div>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="cars"
          empty={{
            icon: <CarFront size={24} />,
            title: list.search || area ? 'No cars match your filters' : 'No local cars here',
            message: list.search || area ? 'Try a different name, area or car model.' : 'Cars listed by owners or the team will appear here.',
          }}
        />
      </section>

      <CarDetailsModal
        carId={viewing?.id}
        initial={viewing}
        onClose={() => setViewing(null)}
        verifying={Boolean(viewing && verifying[viewing.id])}
        onVerify={verify}
        onStatus={askStatus}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title="Deactivate this listing?"
        confirmLabel="Deactivate"
        message={
          statusTarget && (
            <>
              <b>{statusTarget.driverName}</b> will be hidden from passengers. The server doesn't list inactive cars in the admin panel, so after a refresh you won't be able to re-activate it from here.{' '}
              {statusTarget.ownerId ? 'Its owner can still re-activate it from My Cars.' : 'It has no owner account, so it can only be re-activated during this visit.'}
            </>
          )
        }
        onConfirm={() => setStatus(statusTarget, 'INACTIVE')}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this listing?"
        confirmLabel="Delete listing"
        message={
          deleting && (
            <>
              <b>{deleting.driverName}</b>
              {carLine(deleting) ? ` (${carLine(deleting)})` : ''} and {deleting.ratingCount ? `its ${plural(deleting.ratingCount, 'review')}` : 'its reviews'} will be permanently removed. This cannot be undone.
            </>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
