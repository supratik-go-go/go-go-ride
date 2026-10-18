import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Bike, Car, CarFront, CarTaxiFront, Download, Info, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { Button, ConfirmDialog, DataTable, ErrorState, Input, Modal, RouteBadge, SectionHeader, Select, Skeleton, StatusBadge, TableToolbar } from '../../components/ui'
import { AdminTabs, DateTimeCell, useStatusCounts } from '../../components/admin'
import { ChoiceGroup, StopField, changedFields, fromLocalInput, plural, toLocalInput, toNumber } from '../../components/admin-ops'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { adminService, rideService, routeService } from '../../services'
import { exportCsv } from '../../utils/csv'
import { formatCurrency, formatDateTime, formatNumber, formatPhone, label, LABELS, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const STATUSES = ['SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED']
const VEHICLE_ICON = { CAR: Car, AUTO: CarTaxiFront, BIKE: Bike }
const VEHICLE_OPTIONS = Object.entries(LABELS.vehicleType).map(([value, text]) => ({ value, label: text, icon: VEHICLE_ICON[value] }))
const booked = (r) => Math.max(0, (r.totalSeats ?? 0) - (r.availableSeats ?? 0))
const brief = (s) => (s ? { id: s.id, name: s.name, area: s.area, latitude: s.latitude, longitude: s.longitude } : null)

const CSV_COLUMNS = [
  { header: 'From', value: (r) => r.fromStop?.name || '' },
  { header: 'To', value: (r) => r.toStop?.name || '' },
  { header: 'Route', value: (r) => r.route?.routeNumber || '' },
  { header: 'Vehicle', value: (r) => label('vehicleType', r.vehicleType) },
  { header: 'Departure', value: (r) => formatDateTime(r.departureAt) },
  { header: 'Seats Booked', value: (r) => booked(r) },
  { header: 'Total Seats', value: 'totalSeats' },
  { header: 'Fare per Seat (INR)', value: 'farePerSeat' },
  { header: 'Driver', value: (r) => r.driver?.name || '' },
  { header: 'Driver Phone', value: (r) => r.driver?.phone || '' },
  { header: 'Status', value: (r) => label('rideStatus', r.status) },
]

// ---------------------------------------------------------------- status header

function RideStatusCard({ refreshKey }) {
  const q = useAsync(async () => {
    // Upcoming = what passengers can still book (the list API hides past departures).
    const [status, sched, running] = await Promise.all([
      rideService.status(),
      rideService.list({ status: 'SCHEDULED', limit: 1 }).then((r) => r.meta?.total ?? 0),
      rideService.list({ status: 'RUNNING', limit: 1 }).then((r) => r.meta?.total ?? 0),
    ])
    return { ...status, upcoming: sched + running }
  }, [refreshKey])
  const d = q.data
  const live = d?.status === 'LIVE'
  const stale = d ? Math.max(0, (d.activeRides ?? 0) - (d.upcoming ?? 0)) : 0

  if (q.error && !d) {
    return (
      <div className="adm-card">
        <ErrorState error={q.error} onRetry={q.reload} compact title="Couldn't load the Running Car status" />
      </div>
    )
  }

  return (
    <section className="ops-hero" aria-busy={q.loading || undefined}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="ops-hero-title">
          <span className="ops-hero-icon">
            <CarFront size={24} />
          </span>
          <h2>Running Car</h2>
          {d ? (
            <span className={`ops-live ${live ? 'live' : 'soon'}`}>
              {live && <span className="dot dot-pulse" />}
              {live ? 'LIVE' : 'COMING SOON'}
            </span>
          ) : (
            <Skeleton width={90} height={22} radius={999} />
          )}
        </div>
        <p>{d?.tagline || 'Shared rides on popular routes.'}</p>
        <p style={{ marginTop: 6 }}>
          Passengers see <b>LIVE</b> while at least one ride is Scheduled or Running; otherwise the app shows <b>Coming Soon</b> with a Notify Me button.
        </p>
      </div>
      <div className="ops-hero-stats">
        <div className="ops-hero-stat">
          {d ? <b>{formatNumber(d.activeRides)}</b> : <Skeleton width={40} height={28} />}
          <span>Active rides (scheduled + running)</span>
        </div>
        <div className="ops-hero-stat">
          {d ? <b>{formatNumber(d.waitlistCount)}</b> : <Skeleton width={40} height={28} />}
          <span>On the Notify Me waitlist</span>
        </div>
      </div>
      {d && (
        <div className={`ops-hero-note ${stale > 0 ? 'warn' : ''}`}>
          {stale > 0 ? <AlertTriangle size={16} /> : <Info size={16} />}
          <span>
            {stale > 0 ? (
              <>
                {plural(stale, 'active ride has', 'active rides have')} already departed but {stale === 1 ? 'is' : 'are'} still marked Scheduled or Running, so Running Car stays LIVE. Pick the departure date
                below to find {stale === 1 ? 'it' : 'them'} and mark {stale === 1 ? 'it' : 'them'} Completed or Cancelled.
              </>
            ) : (
              <>Known server quirk: a ride keeps counting as active - even after its departure time - until it's marked Completed or Cancelled.</>
            )}
          </span>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- form

/** Form key -> API field name, for clearing server / validation errors. */
const ERROR_KEY = { from: 'fromStopId', to: 'toStopId', departure: 'departureAt' }

function rideForm(ride) {
  return {
    from: brief(ride?.fromStop),
    to: brief(ride?.toStop),
    routeId: ride?.routeId || ride?.route?.id || '',
    driverId: ride?.driver?.id || '',
    vehicleType: ride?.vehicleType || 'CAR',
    departure: toLocalInput(ride?.departureAt),
    totalSeats: ride ? String(ride.totalSeats) : '4',
    farePerSeat: ride ? String(ride.farePerSeat) : '',
    status: ride?.status || 'SCHEDULED',
  }
}

function RideFormModal({ target, onClose, onSaved }) {
  const toast = useToast()
  const { user: me } = useAuth()
  const ride = target?.ride || null
  // Remounted per target (key), so the form starts from that ride's values.
  const [form, setForm] = useState(() => rideForm(ride))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [minDeparture] = useState(() => toLocalInput(new Date().toISOString()))
  const open = Boolean(target)
  const options = useAsync(async () => {
    if (!open) return null
    const [routes, drivers] = await Promise.all([routeService.list({ limit: 100 }), adminService.users({ role: 'DRIVER', limit: 100 })])
    return { routes: routes.data, drivers: drivers.data }
  }, [open])
  const set = (k) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((f) => ({ ...f, [k]: value }))
    const ek = ERROR_KEY[k] || k
    setErrors((x) => (x[ek] ? { ...x, [ek]: undefined } : x))
  }

  const routes = options.data?.routes || []
  const routeOptions = routes.map((r) => ({ value: r.id, label: `${r.routeNumber} · ${r.name}` }))
  if (ride?.route && !routes.some((r) => r.id === ride.route.id)) routeOptions.unshift({ value: ride.route.id, label: `${ride.route.routeNumber} · ${ride.route.name}` })
  const driverOptions = (options.data?.drivers || []).map((u) => ({ value: u.id, label: `${u.name} · ${formatPhone(u.phone)}${u.status !== 'ACTIVE' ? ` (${label('userStatus', u.status)})` : ''}` }))
  if (ride?.driver && !driverOptions.some((o) => o.value === ride.driver.id)) {
    driverOptions.unshift({ value: ride.driver.id, label: `${ride.driver.name}${ride.driver.phone ? ` · ${formatPhone(ride.driver.phone)}` : ''}` })
  }

  const pickRoute = (e) => {
    const id = e.target.value
    const r = routes.find((x) => x.id === id)
    setForm((f) => {
      const next = { ...f, routeId: id }
      // Fill empty From / To from the route's ends - a convenience, still editable.
      if (r) {
        const stops = r.stops || []
        if (!f.from?.id) next.from = brief(r.fromStop || stops[0]?.stop)
        if (!f.to?.id) next.to = brief(r.toStop || stops[stops.length - 1]?.stop)
      }
      return next
    })
  }

  const seatsBooked = ride ? booked(ride) : 0
  const seatsChanged = ride && String(ride.totalSeats) !== form.totalSeats

  const submit = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (!form.from?.id) e.fromStopId = form.from?.name ? 'Pick the stop from the suggestions' : 'Choose the pick-up stop'
    if (!form.to?.id) e.toStopId = form.to?.name ? 'Pick the stop from the suggestions' : 'Choose the drop stop'
    if (form.from?.id && form.from.id === form.to?.id) e.toStopId = 'Pick two different stops'
    if (!form.departure) e.departureAt = 'Choose the departure date and time'
    else if (!ride && new Date(form.departure).getTime() < Date.now()) e.departureAt = 'Departure must be in the future'
    const seats = toNumber(form.totalSeats)
    if (seats == null || Number.isNaN(seats) || !Number.isInteger(seats) || seats < 1 || seats > 8) e.totalSeats = 'Between 1 and 8 seats'
    else if (ride && seats < seatsBooked) e.totalSeats = `${plural(seatsBooked, 'seat is', 'seats are')} already booked`
    const fare = toNumber(form.farePerSeat)
    if (fare == null || Number.isNaN(fare) || fare < 0) e.farePerSeat = 'Enter the fare per seat (₹0 or more)'
    setErrors(e)
    if (Object.keys(e).length) return

    const body = {
      fromStopId: form.from.id,
      toStopId: form.to.id,
      routeId: form.routeId || null,
      driverId: form.driverId || null,
      vehicleType: form.vehicleType,
      departureAt: form.departure,
      totalSeats: seats,
      farePerSeat: fare,
    }
    let payload
    if (ride) {
      const base = {
        fromStopId: ride.fromStop?.id ?? null,
        toStopId: ride.toStop?.id ?? null,
        routeId: ride.routeId || ride.route?.id || null,
        driverId: ride.driver?.id ?? null,
        vehicleType: ride.vehicleType,
        departureAt: toLocalInput(ride.departureAt),
        totalSeats: ride.totalSeats,
        farePerSeat: ride.farePerSeat,
        status: ride.status,
      }
      payload = changedFields(base, { ...body, status: form.status })
      if (payload.departureAt) payload.departureAt = fromLocalInput(payload.departureAt)
      if (!Object.keys(payload).length) {
        toast.info('No changes to save')
        onClose()
        return
      }
    } else {
      payload = { ...body, departureAt: fromLocalInput(form.departure) }
      if (!payload.routeId) delete payload.routeId
      if (!payload.driverId) delete payload.driverId
    }

    setSaving(true)
    try {
      const saved = ride ? await rideService.update(ride.id, payload) : await rideService.create(payload)
      toast.success(ride ? 'Ride updated' : `Ride published: ${saved.fromStop?.name} → ${saved.toStop?.name}`)
      onSaved(saved, !ride)
    } catch (err) {
      setErrors(err.fieldErrors || {})
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={saving ? undefined : onClose}
      size="lg"
      title={ride ? 'Edit ride' : 'Publish a shared ride'}
      subtitle={ride ? `${ride.fromStop?.name || '?'} → ${ride.toStop?.name || '?'} · ${seatsBooked}/${ride.totalSeats} seats booked` : 'Passengers can book seats as soon as it is published.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="ops-ride-form" loading={saving} icon={ride ? null : <Plus size={16} />}>
            {ride ? 'Save changes' : 'Publish ride'}
          </Button>
        </>
      }
    >
      <form id="ops-ride-form" className="ops-form" onSubmit={submit} noValidate>
        <div className="ops-form-grid">
          <StopField label="From (pick-up)" required value={form.from} onChange={set('from')} error={errors.fromStopId} />
          <StopField label="To (drop)" required value={form.to} onChange={set('to')} error={errors.toStopId} />
          <Select
            label="Route"
            placeholder={options.loading ? 'Loading routes…' : 'No route (point to point)'}
            options={routeOptions}
            value={form.routeId}
            onChange={pickRoute}
            error={errors.routeId}
            hint="Optional. Picking a route fills empty From / To with its ends."
          />
          <Select
            label="Driver"
            placeholder={options.loading ? 'Loading drivers…' : ride ? 'No driver assigned' : `Me (${me?.name || 'signed-in admin'})`}
            options={driverOptions}
            value={form.driverId}
            onChange={set('driverId')}
            error={errors.driverId}
            hint={options.error ? 'Could not load drivers - the ride will be published under your account.' : !ride ? 'If no driver is picked, the ride is published under your account.' : undefined}
          />
        </div>
        <div className="field">
          <span className="field-label">Vehicle type</span>
          <ChoiceGroup ariaLabel="Vehicle type" options={VEHICLE_OPTIONS} value={form.vehicleType} onChange={set('vehicleType')} />
        </div>
        <div className="ops-form-grid three">
          <Input
            label="Departure"
            required
            type="datetime-local"
            value={form.departure}
            min={ride ? undefined : minDeparture}
            onChange={set('departure')}
            error={errors.departureAt}
            className="span-2"
          />
          <Input
            label="Total seats"
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={8}
            step={1}
            value={form.totalSeats}
            onChange={set('totalSeats')}
            error={errors.totalSeats}
            hint={seatsChanged ? `The server keeps ${ride.availableSeats} seat${ride.availableSeats === 1 ? '' : 's'} available - it doesn't recalculate them.` : '1 to 8'}
          />
          <Input label="Fare per seat (₹)" required type="number" inputMode="decimal" min={0} step="1" placeholder="e.g. 60" value={form.farePerSeat} onChange={set('farePerSeat')} error={errors.farePerSeat} />
          {ride && (
            <Select
              label="Status"
              value={form.status}
              onChange={set('status')}
              options={STATUSES.map((s) => ({ value: s, label: label('rideStatus', s) }))}
              error={errors.status}
              hint={form.status === 'CANCELLED' && ride.status !== 'CANCELLED' ? "Bookings aren't cancelled automatically." : undefined}
            />
          )}
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- page

export default function Rides() {
  const toast = useToast()
  const list = usePagedQuery(rideService.list, { limit: 10, initialFilters: { status: 'SCHEDULED', vehicleType: '', date: '' } })
  const extra = useMemo(() => {
    const x = {}
    if (list.filters.vehicleType) x.vehicleType = list.filters.vehicleType
    if (list.filters.date) x.date = list.filters.date
    return x
  }, [list.filters.vehicleType, list.filters.date])
  const counts = useStatusCounts(rideService.list, 'status', STATUSES, extra)
  const [statusKey, setStatusKey] = useState(0)
  const [formTarget, setFormTarget] = useState(null) // { ride } | { new: true }
  const [cancelling, setCancelling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  // A ride changing status can flip the passenger-facing LIVE badge.
  const refreshAll = () => {
    counts.reload()
    setStatusKey((k) => k + 1)
  }
  const saved = (ride, isNew) => {
    setFormTarget(null)
    if (isNew) list.reload()
    else list.patchRow(ride.id, ride)
    refreshAll()
  }

  const cancelRide = async () => {
    try {
      const updated = await rideService.update(cancelling.id, { status: 'CANCELLED' })
      toast.success('Ride cancelled')
      list.patchRow(cancelling.id, updated)
      refreshAll()
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const remove = async () => {
    try {
      await rideService.remove(deleting.id)
      toast.success('Ride deleted')
      list.removeRow(deleting.id)
      refreshAll()
    } catch (err) {
      toast.error(err?.code === 'INVALID_REFERENCE' ? `${err.message}. This ride has bookings - cancel it instead of deleting it.` : err)
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-rides-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${plural(list.rows.length, 'ride')} from this page`)
  }

  const columns = [
    {
      key: 'route',
      header: 'From → To',
      render: (r) => (
        <div className="adm-cell">
          <span className="ops-fromto">
            {r.fromStop?.name || '?'} <ArrowRight size={14} /> <span className="ops-to">{r.toStop?.name || '?'}</span>
          </span>
          {r.route ? (
            <span className="adm-route-cell" style={{ marginTop: 3 }}>
              <RouteBadge size="sm">{r.route.routeNumber}</RouteBadge>
              <span className="adm-cell-sub ops-clip" title={r.route.name}>
                {r.route.name}
              </span>
            </span>
          ) : (
            <span className="adm-cell-sub">Point to point</span>
          )}
        </div>
      ),
    },
    {
      key: 'vehicleType',
      header: 'Vehicle',
      render: (r) => {
        const Icon = VEHICLE_ICON[r.vehicleType] || Car
        return (
          <span className="ops-vehicle">
            <Icon size={16} /> {label('vehicleType', r.vehicleType)}
          </span>
        )
      },
    },
    { key: 'departureAt', header: 'Departure', render: (r) => <DateTimeCell value={r.departureAt} /> },
    {
      key: 'seats',
      header: 'Seats',
      render: (r) => {
        const b = booked(r)
        const pct = r.totalSeats ? Math.round((b / r.totalSeats) * 100) : 0
        return (
          <div className="ops-seats" title={`${b} booked, ${r.availableSeats} available of ${r.totalSeats}`}>
            <span className="text-sm">
              <b className="tabular">{b}</b>/<span className="tabular">{r.totalSeats}</span> booked
            </span>
            <span className={`ops-seats-bar ${r.availableSeats <= 0 ? 'full' : ''}`}>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="adm-cell-sub">{r.availableSeats > 0 ? `${r.availableSeats} left` : 'Full'}</span>
          </div>
        )
      },
    },
    { key: 'farePerSeat', header: 'Fare/seat', align: 'right', render: (r) => <span className="adm-amount">{formatCurrency(r.farePerSeat)}</span> },
    {
      key: 'driver',
      header: 'Driver',
      render: (r) =>
        r.driver ? (
          <div className="adm-cell">
            <span className="adm-cell-main" style={{ fontWeight: 500 }}>
              {r.driver.name}
            </span>
            {r.driver.phone && <span className="adm-cell-sub">{formatPhone(r.driver.phone)}</span>}
          </div>
        ) : (
          <span className="text-muted">Not assigned</span>
        ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} group="rideStatus" withDot /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => {
        const closed = r.status === 'CANCELLED' || r.status === 'COMPLETED'
        return (
          <span className="adm-actions">
            <button type="button" className="adm-act" onClick={() => setFormTarget({ ride: r })} aria-label="Edit ride" title="Edit">
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="adm-act reject"
              onClick={() => setCancelling(r)}
              disabled={closed}
              aria-label="Cancel ride"
              title={closed ? `Already ${label('rideStatus', r.status).toLowerCase()}` : 'Cancel ride'}
            >
              <XCircle size={15} />
            </button>
            <button type="button" className="adm-act danger" onClick={() => setDeleting(r)} aria-label="Delete ride" title="Delete">
              <Trash2 size={15} />
            </button>
          </span>
        )
      },
    },
  ]

  const tabItems = STATUSES.map((s) => ({ value: s, label: label('rideStatus', s), count: counts.data?.[s] ?? undefined }))
  const filtered = list.filters.vehicleType || list.filters.date
  const statusLabel = label('rideStatus', list.filters.status).toLowerCase()

  return (
    <div className="adm-page">
      <SectionHeader
        title="Running Car (Rides)"
        subtitle="Shared rides passengers can book seat by seat."
        actions={
          <Button icon={<Plus size={17} />} onClick={() => setFormTarget({ new: true })}>
            Publish Ride
          </Button>
        }
      />

      <RideStatusCard refreshKey={statusKey} />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={list.filters.status} onChange={(v) => list.setFilter('status', v)} ariaLabel="Ride status" />
        <TableToolbar
          actions={
            <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
              Export
            </Button>
          }
        >
          <label className="adm-toolbar-field">
            <span>Vehicle</span>
            <select className="select" value={list.filters.vehicleType} onChange={(e) => list.setFilter('vehicleType', e.target.value)}>
              <option value="">All</option>
              {Object.entries(LABELS.vehicleType).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-toolbar-field">
            <span>Departure date</span>
            <Input type="date" aria-label="Departure date" value={list.filters.date} onChange={(e) => list.setFilter('date', e.target.value)} />
          </label>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                list.setFilters((f) => ({ ...f, vehicleType: '', date: '' }))
                list.setPage(1)
              }}
            >
              Clear filters
            </Button>
          )}
        </TableToolbar>
        <div className="card-note">
          {list.filters.date
            ? `Showing ${statusLabel} rides departing on this date (dates follow UTC on the server, so very early-morning rides may show under the previous day).`
            : `Showing ${statusLabel} rides departing from now on - past rides only appear when you pick their date.`}
        </div>
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="rides"
          empty={{
            icon: <CarFront size={24} />,
            title: `No ${statusLabel} rides`,
            message: list.filters.date ? 'Nothing matches this date and vehicle. Try another date.' : 'Pick a departure date to look at past rides, or publish a new one.',
            action:
              list.filters.status === 'SCHEDULED' ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormTarget({ new: true })}>
                  Publish a ride
                </Button>
              ) : null,
          }}
        />
      </section>

      <RideFormModal key={formTarget?.ride?.id || (formTarget ? 'new' : 'closed')} target={formTarget} onClose={() => setFormTarget(null)} onSaved={saved} />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this ride?"
        confirmLabel="Cancel ride"
        message={
          cancelling && (
            <>
              <b>
                {cancelling.fromStop?.name} → {cancelling.toStop?.name}
              </b>{' '}
              on {formatDateTime(cancelling.departureAt)} will be marked Cancelled and can't be booked any more.
              {booked(cancelling) > 0 &&
                ` ${plural(booked(cancelling), 'seat is', 'seats are')} booked - those passengers are not notified and their bookings stay as they are, so cancel them from Bookings.`}
            </>
          )
        }
        onConfirm={cancelRide}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this ride?"
        confirmLabel="Delete ride"
        message={
          deleting && (
            <>
              <b>
                {deleting.fromStop?.name} → {deleting.toStop?.name}
              </b>{' '}
              on {formatDateTime(deleting.departureAt)} will be permanently removed.
              {booked(deleting) > 0 ? ' It has bookings, so the server will refuse - cancel it instead.' : ' This cannot be undone.'}
            </>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
