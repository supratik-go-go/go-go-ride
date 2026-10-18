import { useMemo, useState } from 'react'
import { AlertTriangle, Download, List, Map as MapIcon, MapPin, MapPinOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, Modal, SectionHeader, Select, Skeleton, StatusBadge, TableToolbar } from '../../components/ui'
import { AdminTabs, useStatusCounts } from '../../components/admin'
import { LocationPicker, RECORD_STATUS_OPTIONS, changedFields, fetchAll, fmtCoord, plural, toNumber } from '../../components/admin-ops'
import { MapView, StopMarker } from '../../components/map/MapView'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { stopService } from '../../services'
import { stopPoint } from '../../services/locationService'
import { exportCsv } from '../../utils/csv'
import { label, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const TABS = [
  { value: '', label: 'All Bus Stops' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

const hasCoords = (s) => s?.latitude != null && s?.longitude != null

const CSV_COLUMNS = [
  { header: 'Stop Name', value: 'name' },
  { header: 'Area', value: (s) => s.area || '' },
  { header: 'City', value: (s) => s.city || '' },
  { header: 'Routes', value: (s) => s.routes ?? 0 },
  { header: 'Buses Available', value: (s) => s.busesAvailable ?? 0 },
  { header: 'Latitude', value: (s) => s.latitude ?? '' },
  { header: 'Longitude', value: (s) => s.longitude ?? '' },
  { header: 'Status', value: (s) => label('recordStatus', s.status) },
]

// ---------------------------------------------------------------- form

const EMPTY = { name: '', area: '', city: 'Kolkata', latitude: '', longitude: '', status: 'ACTIVE' }

function toForm(stop) {
  if (!stop) return EMPTY
  return {
    name: stop.name || '',
    area: stop.area || '',
    city: stop.city || 'Kolkata',
    latitude: stop.latitude != null ? String(stop.latitude) : '',
    longitude: stop.longitude != null ? String(stop.longitude) : '',
    status: stop.status || 'ACTIVE',
  }
}

function StopFormModal({ target, onClose, onSaved }) {
  const toast = useToast()
  const stop = target?.stop || null
  // Remounted per target (key), so the form starts from that stop's values.
  const [form, setForm] = useState(() => toForm(stop))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x))
  }

  const lat = toNumber(form.latitude)
  const lng = toNumber(form.longitude)
  const noCoords = lat == null && lng == null

  const submit = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (form.name.trim().length < 2) e.name = 'Enter at least 2 characters'
    if (form.area.trim().length > 80) e.area = 'Use 80 characters or fewer'
    if (!form.city.trim()) e.city = 'Enter the city'
    if ((lat == null) !== (lng == null)) {
      if (lat == null) e.latitude = 'Enter both latitude and longitude, or neither'
      else e.longitude = 'Enter both latitude and longitude, or neither'
    }
    if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) e.latitude = 'Latitude must be between -90 and 90'
    if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) e.longitude = 'Longitude must be between -180 and 180'
    setErrors(e)
    if (Object.keys(e).length) return

    const body = {
      name: form.name.trim(),
      area: form.area.trim() || null,
      city: form.city.trim(),
      latitude: lat,
      longitude: lng,
      status: form.status,
    }
    let payload = body
    if (stop) {
      payload = changedFields({ name: stop.name, area: stop.area || null, city: stop.city, latitude: stop.latitude ?? null, longitude: stop.longitude ?? null, status: stop.status }, body)
      if (!Object.keys(payload).length) {
        toast.info('No changes to save')
        onClose()
        return
      }
    } else {
      if (!body.area) delete payload.area
      if (lat == null) {
        delete payload.latitude
        delete payload.longitude
      }
    }

    setSaving(true)
    try {
      const saved = stop ? await stopService.update(stop.id, payload) : await stopService.create(payload)
      toast.success(stop ? `${saved.name} updated` : `${saved.name} added`)
      onSaved(saved, !stop)
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
      title={stop ? 'Edit bus stop' : 'Add new bus stop'}
      subtitle={stop ? `Used by ${plural(stop.routes ?? 0, 'route')} and ${plural(stop.busesAvailable ?? 0, 'bus timetable')}` : 'Stops appear in search, on route timelines and on the map.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="ops-stop-form" loading={saving} icon={stop ? null : <Plus size={16} />}>
            {stop ? 'Save changes' : 'Add stop'}
          </Button>
        </>
      }
    >
      <form id="ops-stop-form" className="ops-form" onSubmit={submit} noValidate>
        <div className="ops-form-grid">
          <Input label="Stop name" required placeholder="e.g. Howrah Station" value={form.name} onChange={set('name')} error={errors.name} maxLength={80} autoComplete="off" className="span-2" />
          <Input label="Area" placeholder="e.g. Howrah" value={form.area} onChange={set('area')} error={errors.area} maxLength={80} autoComplete="off" />
          <Input label="City" required value={form.city} onChange={set('city')} error={errors.city} maxLength={80} autoComplete="off" />
          <Select
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={RECORD_STATUS_OPTIONS}
            error={errors.status}
            hint={form.status === 'INACTIVE' ? 'Inactive stops are left out of search suggestions and Nearby Stops.' : undefined}
          />
        </div>
        <div className="ops-divider" />
        <div className="stack" style={{ '--gap': '10px' }}>
          <div className="ops-section-title">Location</div>
          {noCoords && (
            <div className="alert alert-warning">
              <MapPinOff size={18} />
              <div>Without coordinates this stop can't appear on maps, in "Bus Stops Near You" or in live tracking. Click the map to set its position.</div>
            </div>
          )}
          <LocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onChange={(v) => {
              setForm((f) => ({ ...f, ...v }))
              setErrors((x) => ({ ...x, latitude: undefined, longitude: undefined }))
            }}
            errors={errors}
          />
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- map view

function StopsMap({ status, search, onEdit }) {
  const q = useAsync(() => fetchAll(stopService.list, { status: status || undefined, search: search || undefined }), [status, search])
  const rows = q.data?.rows
  const located = useMemo(() => (rows || []).filter(hasCoords), [rows])
  const missing = useMemo(() => (rows || []).filter((s) => !hasCoords(s)), [rows])
  const fit = useMemo(() => located.map((s) => [s.latitude, s.longitude]), [located])

  if (q.loading && !rows) {
    return (
      <div className="ops-map-wrap">
        <Skeleton height={460} radius={14} />
      </div>
    )
  }
  if (q.error && !rows) return <ErrorState error={q.error} onRetry={q.reload} compact />
  if (!rows?.length) return <EmptyState icon={<MapPin size={24} />} compact title="No stops to show" message={search ? `Nothing found for "${search}".` : 'Stops in this status will appear here.'} />

  return (
    <div className={`ops-map-wrap ${q.loading ? 'adm-dim' : ''}`}>
      <div className="ops-map-legend">
        <span>
          <b>{located.length}</b> of {plural(rows.length, 'stop')} on the map
        </span>
        <span className="row" style={{ '--gap': '6px' }}>
          <span className="map-stop" style={{ width: 14, height: 14, borderWidth: 3 }} /> Active
        </span>
        <span className="row" style={{ '--gap': '6px' }}>
          <span className="map-stop passed" style={{ width: 14, height: 14, borderWidth: 3 }} /> Inactive
        </span>
        {q.data?.truncated && <span className="text-warning">Showing the first {rows.length} stops only.</span>}
      </div>
      {located.length ? (
        <MapView height={460} fit={fit}>
          {located.map((s) => (
            <StopMarker key={s.id} point={stopPoint(s)} name={s.name} kind={s.status === 'ACTIVE' ? 'stop' : 'passed'}>
              <div className="ops-map-pop">
                <b>{s.name}</b>
                <span className="text-xs text-muted">{[s.area, s.city].filter(Boolean).join(', ')}</span>
                <span className="text-xs">
                  {plural(s.routes ?? 0, 'route')} · {plural(s.busesAvailable ?? 0, 'bus', 'buses')}
                </span>
                <span>
                  <StatusBadge value={s.status} group="recordStatus" />
                </span>
                <Button size="sm" variant="soft" icon={<Pencil size={14} />} onClick={() => onEdit(s)}>
                  Edit stop
                </Button>
              </div>
            </StopMarker>
          ))}
        </MapView>
      ) : (
        <EmptyState icon={<MapPinOff size={24} />} compact title="None of these stops has coordinates" message="Edit a stop and click the map to place it." />
      )}
      {missing.length > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div className="stack" style={{ '--gap': '8px' }}>
            <span>
              {plural(missing.length, 'stop has', 'stops have')} no coordinates, so {missing.length === 1 ? 'it is' : 'they are'} missing from maps and tracking:
            </span>
            <div className="ops-nocoords">
              {missing.map((s) => (
                <Button key={s.id} size="sm" variant="white" icon={<Pencil size={13} />} onClick={() => onEdit(s)}>
                  {s.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- page

export default function StopsAdmin() {
  const toast = useToast()
  const list = usePagedQuery(stopService.list, { limit: 10, initialFilters: { status: '' } })
  const counts = useStatusCounts(stopService.list, 'status', TABS.map((t) => t.value))
  const [view, setView] = useState('table')
  const [formTarget, setFormTarget] = useState(null) // { stop } | { new: true }
  const [deleting, setDeleting] = useState(null)
  const [mapKey, setMapKey] = useState(0)
  const mapSearch = useDebounce(list.search, 300)

  const saved = (stop, isNew) => {
    setFormTarget(null)
    if (isNew) list.reload()
    else list.patchRow(stop.id, stop)
    counts.reload()
    setMapKey((k) => k + 1)
  }

  const remove = async () => {
    try {
      await stopService.remove(deleting.id)
      toast.success(`${deleting.name} deleted`)
      list.removeRow(deleting.id)
      counts.reload()
      setMapKey((k) => k + 1)
    } catch (err) {
      toast.error(
        err?.code === 'DB_ERROR' || err?.code === 'INVALID_REFERENCE'
          ? `${err.message}. ${deleting.name} is still used by routes, bus timetables or rides - mark it Inactive instead.`
          : err,
      )
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-stops-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${plural(list.rows.length, 'stop')} from this page`)
  }

  const columns = [
    {
      key: 'name',
      header: 'Stop Name',
      render: (s) => (
        <div className="adm-person">
          <span className={`icon-tile sm ${hasCoords(s) ? '' : 'warning'}`} aria-hidden="true">
            {hasCoords(s) ? <MapPin size={16} /> : <MapPinOff size={16} />}
          </span>
          <span className="adm-cell-main">{s.name}</span>
        </div>
      ),
    },
    { key: 'area', header: 'Area', render: (s) => s.area || <span className="ops-muted-dash">-</span> },
    { key: 'city', header: 'City', render: (s) => s.city || <span className="ops-muted-dash">-</span> },
    { key: 'routes', header: 'Routes', align: 'center', render: (s) => <span className="ops-num fw-600">{s.routes ?? 0}</span> },
    { key: 'busesAvailable', header: 'Buses Available', align: 'center', render: (s) => <span className="ops-num fw-600">{s.busesAvailable ?? 0}</span> },
    {
      key: 'coords',
      header: 'Coordinates',
      render: (s) =>
        hasCoords(s) ? (
          <span className="ops-coord">
            {fmtCoord(s.latitude)},
            <br />
            {fmtCoord(s.longitude)}
          </span>
        ) : (
          <span className="ops-cell-warn" title="This stop can't appear on maps or in tracking">
            <AlertTriangle size={13} /> Not set
          </span>
        ),
    },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge value={s.status} group="recordStatus" withDot /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <span className="adm-actions">
          <button type="button" className="adm-act" onClick={() => setFormTarget({ stop: s })} aria-label={`Edit ${s.name}`} title="Edit">
            <Pencil size={15} />
          </button>
          <button type="button" className="adm-act danger" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`} title="Delete">
            <Trash2 size={15} />
          </button>
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))
  const inUse = deleting && ((deleting.routes ?? 0) > 0 || (deleting.busesAvailable ?? 0) > 0)

  return (
    <div className="adm-page">
      <SectionHeader title="Bus Stops Management" subtitle="Every stop on the network - names, areas and map positions." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={list.filters.status} onChange={(v) => list.setFilter('status', v)} ariaLabel="Stop status" />
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search stop name or area…"
          actions={
            <>
              <div className="segmented ops-view-switch" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
                  <List size={15} /> Table
                </button>
                <button type="button" role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                  <MapIcon size={15} /> Map view
                </button>
              </div>
              <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
                Export
              </Button>
              <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormTarget({ new: true })}>
                Add New Stop
              </Button>
            </>
          }
        />
        {view === 'map' ? (
          <StopsMap key={mapKey} status={list.filters.status} search={mapSearch} onEdit={(s) => setFormTarget({ stop: s })} />
        ) : (
          <DataTable
            columns={columns}
            rows={list.rows}
            loading={list.loading}
            error={list.error}
            onRetry={list.reload}
            meta={list.meta}
            onPageChange={list.setPage}
            noun="stops"
            empty={{
              icon: <MapPin size={24} />,
              title: list.search ? 'No stops match your search' : 'No stops here',
              message: list.search ? `Nothing found for "${list.search}".` : 'Stops in this status will appear here.',
              action:
                !list.search && !list.filters.status ? (
                  <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormTarget({ new: true })}>
                    Add the first stop
                  </Button>
                ) : null,
            }}
          />
        )}
      </section>

      <StopFormModal key={formTarget?.stop?.id || (formTarget ? 'new' : 'closed')} target={formTarget} onClose={() => setFormTarget(null)} onSaved={saved} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this stop?"
        confirmLabel="Delete stop"
        message={
          deleting && (
            <span className="stack" style={{ '--gap': '10px' }}>
              <span>
                <b>{deleting.name}</b>
                {deleting.area ? ` (${deleting.area})` : ''} will be permanently removed. This cannot be undone.
              </span>
              {inUse && (
                <span className="alert alert-warning">
                  <AlertTriangle size={18} />
                  <span>
                    It is used by {plural(deleting.routes ?? 0, 'route')} and {plural(deleting.busesAvailable ?? 0, 'bus timetable')}. The server will usually refuse to delete a stop in use - mark it{' '}
                    <Badge tone="neutral" square>
                      Inactive
                    </Badge>{' '}
                    instead.
                  </span>
                </span>
              )}
            </span>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
