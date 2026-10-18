import { useState } from 'react'
import { ArrowRight, Download, Eye, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react'
import { Button, ConfirmDialog, DataTable, ErrorState, Input, Modal, RouteBadge, SectionHeader, Select, Skeleton, StatusBadge, TableToolbar } from '../../components/ui'
import { AdminTabs, useStatusCounts } from '../../components/admin'
import { RECORD_STATUS_OPTIONS, RouteStopsEditor, StopField, changedFields, newRouteStopRow, plural, toNumber } from '../../components/admin-ops'
import { MapView, RouteLine, StopMarker } from '../../components/map/MapView'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { usePagedQuery } from '../../hooks/usePagedQuery'
import { routeService } from '../../services'
import { stopPoint } from '../../services/locationService'
import { exportCsv } from '../../utils/csv'
import { label, todayISO } from '../../utils/format'
import './admin.css'
import './admin-ops.css'

const TABS = [
  { value: '', label: 'All Routes' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

/** First / last stop of a route (from the explicit ends, else the stop list). */
function routeEnds(r) {
  const stops = r?.stops || []
  return {
    from: r?.fromStop || stops[0]?.stop || null,
    to: r?.toStop || stops[stops.length - 1]?.stop || null,
  }
}

const brief = (s) => (s ? { id: s.id, name: s.name, area: s.area, latitude: s.latitude, longitude: s.longitude } : null)

const CSV_COLUMNS = [
  { header: 'Route Number', value: 'routeNumber' },
  { header: 'Route Name', value: 'name' },
  { header: 'From', value: (r) => routeEnds(r).from?.name || '' },
  { header: 'To', value: (r) => routeEnds(r).to?.name || '' },
  { header: 'Stops', value: (r) => r.stops?.length ?? 0 },
  { header: 'Total Buses', value: (r) => r.totalBuses ?? 0 },
  { header: 'Distance (km)', value: (r) => r.distanceKm ?? '' },
  { header: 'Status', value: (r) => label('recordStatus', r.status) },
]

// ---------------------------------------------------------------- form

/** Form key -> API field name, for clearing server / validation errors. */
const ERROR_KEY = { from: 'fromStopId', to: 'toStopId' }

function initialForm(route) {
  const { from, to } = routeEnds(route)
  let mids = route?.stops || []
  if (mids.length && from && mids[0].stopId === from.id) mids = mids.slice(1)
  if (mids.length && to && mids[mids.length - 1].stopId === to.id) mids = mids.slice(0, -1)
  return {
    name: route?.name || '',
    routeNumber: route?.routeNumber || '',
    from: brief(from),
    to: brief(to),
    distanceKm: route?.distanceKm != null ? String(route.distanceKm) : '',
    status: route?.status || 'ACTIVE',
    rows: mids.map((s) => newRouteStopRow({ stop: brief(s.stop) || { id: s.stopId, name: 'Stop' }, km: String(s.distanceFromStartKm ?? '') })),
  }
}

/** What the API currently holds, in request shape - to send only changes. */
function baseBody(route) {
  const { from, to } = routeEnds(route)
  return {
    name: route.name,
    routeNumber: route.routeNumber,
    fromStopId: from?.id ?? null,
    toStopId: to?.id ?? null,
    distanceKm: route.distanceKm,
    status: route.status,
    stops: (route.stops || []).map((s) => ({ stopId: s.stopId, distanceFromStartKm: s.distanceFromStartKm })),
  }
}

function validate(form) {
  const e = {}
  const rowErrors = {}
  if (form.name.trim().length < 2) e.name = 'Enter at least 2 characters'
  if (!form.routeNumber.trim()) e.routeNumber = 'Enter the route number, e.g. S12'
  else if (form.routeNumber.trim().length > 20) e.routeNumber = 'Use 20 characters or fewer'
  if (!form.from?.id) e.fromStopId = form.from?.name ? 'Pick the stop from the suggestions' : 'Choose where the route starts'
  if (!form.to?.id) e.toStopId = form.to?.name ? 'Pick the stop from the suggestions' : 'Choose where the route ends'
  if (form.from?.id && form.to?.id && form.from.id === form.to.id) e.toStopId = 'From and To must be different stops'
  const dist = toNumber(form.distanceKm)
  if (dist == null) e.distanceKm = 'Enter the route length in km'
  else if (Number.isNaN(dist) || dist < 0) e.distanceKm = 'Enter a distance of 0 km or more'

  const seen = new Set([form.from?.id, form.to?.id].filter(Boolean))
  let prev = 0
  for (const r of form.rows) {
    const km = toNumber(r.km)
    if (!r.stop?.id) rowErrors[r.key] = r.stop?.name ? 'Pick the stop from the suggestions' : 'Choose a stop or remove this row'
    else if (seen.has(r.stop.id)) rowErrors[r.key] = `${r.stop.name} is already on this route`
    else if (km == null || Number.isNaN(km) || km < 0) rowErrors[r.key] = 'Enter the distance from the first stop'
    else if (km < prev) rowErrors[r.key] = 'Distances must increase along the route'
    else if (dist != null && !Number.isNaN(dist) && km > dist) rowErrors[r.key] = `Must be within the route length (${dist} km)`
    if (r.stop?.id) seen.add(r.stop.id)
    if (km != null && !Number.isNaN(km)) prev = Math.max(prev, km)
  }
  if (Object.keys(rowErrors).length) e.stops = 'Fix the highlighted stops'
  return { errors: e, rowErrors }
}

function RoutePreview({ form }) {
  const stops = [form.from, ...form.rows.map((r) => r.stop), form.to].filter((s) => s?.id)
  const points = stops.map(stopPoint)
  const located = points.filter(Boolean)
  // FitBounds re-fits on the joined coordinates, so a fresh array per render is fine.
  const fit = located.map((p) => [p.lat, p.lng])
  if (located.length < 2) return null
  return (
    <div className="stack" style={{ '--gap': '8px' }}>
      <div className="ops-legend">
        <span className="ops-section-title">Route preview</span>
        {located.length < stops.length && <span className="text-xs text-warning">{plural(stops.length - located.length, 'stop')} without coordinates not shown</span>}
      </div>
      <MapView height={220} fit={fit} scrollWheelZoom={false}>
        <RouteLine points={located} />
        {stops.map((s, i) => (
          <StopMarker key={`${s.id}-${i}`} point={stopPoint(s)} name={s.name} kind={i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'stop'} />
        ))}
      </MapView>
    </div>
  )
}

function RouteForm({ route, formId, onSaving, onSaved, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState(() => initialForm(route))
  const [errors, setErrors] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }))
    if (k === 'rows') {
      setRowErrors({})
      setErrors((x) => ({ ...x, stops: undefined }))
    } else {
      const ek = ERROR_KEY[k] || k
      setErrors((x) => (x[ek] ? { ...x, [ek]: undefined } : x))
    }
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const v = validate(form)
    setErrors(v.errors)
    setRowErrors(v.rowErrors)
    if (Object.keys(v.errors).length) {
      toast.warning('Please fix the highlighted fields.')
      return
    }
    const dist = toNumber(form.distanceKm)
    const body = {
      name: form.name.trim(),
      routeNumber: form.routeNumber.trim().toUpperCase(),
      fromStopId: form.from.id,
      toStopId: form.to.id,
      distanceKm: dist,
      status: form.status,
      stops: [
        { stopId: form.from.id, distanceFromStartKm: 0 },
        ...form.rows.map((r) => ({ stopId: r.stop.id, distanceFromStartKm: toNumber(r.km) })),
        { stopId: form.to.id, distanceFromStartKm: dist },
      ],
    }
    const payload = route ? changedFields(baseBody(route), body) : body
    if (route && !Object.keys(payload).length) {
      toast.info('No changes to save')
      onClose()
      return
    }
    onSaving(true)
    try {
      const saved = route ? await routeService.update(route.id, payload) : await routeService.create(payload)
      toast.success(route ? `Route ${saved.routeNumber} updated` : `Route ${saved.routeNumber} created`)
      onSaved(saved, !route)
    } catch (err) {
      const fe = err.fieldErrors || {}
      setErrors((x) => ({ ...x, ...fe }))
      toast.error(err)
    } finally {
      onSaving(false)
    }
  }

  return (
    <form id={formId} className="ops-form" onSubmit={submit} noValidate>
      <div className="ops-form-grid">
        <Input label="Route name" required placeholder="e.g. Howrah Station - Esplanade" value={form.name} onChange={set('name')} error={errors.name} maxLength={120} autoComplete="off" />
        <Input
          label="Route number"
          required
          placeholder="e.g. S12"
          value={form.routeNumber}
          onChange={(e) => set('routeNumber')(e.target.value.toUpperCase())}
          error={errors.routeNumber}
          maxLength={20}
          autoComplete="off"
          hint="Shown on the bus badge. Must be unique."
        />
        <StopField label="From stop" required value={form.from} onChange={set('from')} error={errors.fromStopId} hint="Pick from the suggestions (active stops only)." />
        <StopField label="To stop" required value={form.to} onChange={set('to')} error={errors.toStopId} />
        <Input label="Distance (km)" required type="number" inputMode="decimal" min={0} step="0.1" placeholder="e.g. 11.2" value={form.distanceKm} onChange={set('distanceKm')} error={errors.distanceKm} />
        <Select label="Status" value={form.status} onChange={set('status')} options={RECORD_STATUS_OPTIONS} error={errors.status} hint={form.status === 'INACTIVE' ? 'Inactive routes are hidden from passengers.' : undefined} />
      </div>

      <div className="ops-divider" />
      <div className="stack" style={{ '--gap': '10px' }}>
        <div className="ops-legend">
          <div>
            <div className="ops-section-title">Stops along the route</div>
            <div className="text-xs text-muted">In travel order, with the distance from the first stop.</div>
          </div>
          <span className="text-xs text-muted">{plural(form.rows.length + 2, 'stop')}</span>
        </div>
        <RouteStopsEditor from={form.from} to={form.to} distanceKm={form.distanceKm} rows={form.rows} onChange={set('rows')} errors={rowErrors} />
        {errors.stops && <span className="field-error">{errors.stops}</span>}
      </div>
      <RoutePreview form={form} />
    </form>
  )
}

function RouteFormModal({ target, onClose, onSaved }) {
  const editing = Boolean(target?.id)
  const q = useAsync(() => (editing ? routeService.get(target.id) : Promise.resolve(null)), [target?.id])
  const [saving, setSaving] = useState(false)
  const route = editing && q.data?.id === target.id ? q.data : null
  const ready = !editing || Boolean(route)
  const formId = 'ops-route-form'

  return (
    <Modal
      open={Boolean(target)}
      onClose={saving ? undefined : onClose}
      size="lg"
      title={editing ? 'Edit route' : 'Add new route'}
      subtitle={editing ? (route ? `${route.routeNumber} · ${plural(route.totalBuses ?? 0, 'bus', 'buses')} on this route` : 'Loading route…') : 'Create a bus route and list its stops in travel order.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={!ready} icon={editing ? null : <Plus size={16} />}>
            {editing ? 'Save changes' : 'Create route'}
          </Button>
        </>
      }
    >
      {editing && q.error && !route ? (
        <ErrorState error={q.error} onRetry={q.reload} compact />
      ) : !ready ? (
        <div className="stack" aria-busy="true">
          <div className="ops-form-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={68} radius={10} />
            ))}
          </div>
          <Skeleton height={160} radius={12} />
        </div>
      ) : (
        <RouteForm key={route?.id || 'new'} route={route} formId={formId} onSaving={setSaving} onSaved={onSaved} onClose={onClose} />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- page

export default function RoutesAdmin() {
  const toast = useToast()
  const list = usePagedQuery(routeService.list, { limit: 10, initialFilters: { status: '' } })
  const counts = useStatusCounts(routeService.list, 'status', TABS.map((t) => t.value))
  const [formTarget, setFormTarget] = useState(null) // { new: true } | { id }
  const [deleting, setDeleting] = useState(null)

  const saved = (route, isNew) => {
    setFormTarget(null)
    if (isNew) list.reload()
    else list.patchRow(route.id, route)
    counts.reload()
  }

  const remove = async () => {
    try {
      await routeService.remove(deleting.id)
      toast.success(`Route ${deleting.routeNumber} deleted`)
      list.removeRow(deleting.id)
      counts.reload()
    } catch (err) {
      toast.error(
        err?.code === 'INVALID_REFERENCE'
          ? `${err.message}. Shared rides probably still use route ${deleting.routeNumber} - change or delete those rides first.`
          : err,
      )
      throw err
    }
  }

  const exportRows = () => {
    exportCsv(`gogoride-routes-${todayISO()}.csv`, list.rows, CSV_COLUMNS)
    toast.info(`Exported ${plural(list.rows.length, 'route')} from this page`)
  }

  const columns = [
    {
      key: 'name',
      header: 'Route Name',
      render: (r) => (
        <div className="adm-cell">
          <span className="adm-cell-main">{r.name}</span>
          <span className="adm-cell-sub">{plural(r.stops?.length ?? 0, 'stop')}</span>
        </div>
      ),
    },
    { key: 'routeNumber', header: 'Route Number', render: (r) => <RouteBadge size="sm">{r.routeNumber}</RouteBadge> },
    {
      key: 'ends',
      header: 'From → To',
      render: (r) => {
        const { from, to } = routeEnds(r)
        if (!from && !to) return <span className="text-muted">No stops yet</span>
        return (
          <span className="ops-fromto">
            {from?.name || '?'} <ArrowRight size={14} /> <span className="ops-to">{to?.name || '?'}</span>
          </span>
        )
      },
    },
    { key: 'totalBuses', header: 'Total Buses', align: 'center', render: (r) => <span className="ops-num fw-600">{r.totalBuses ?? 0}</span> },
    { key: 'distanceKm', header: 'Distance (km)', align: 'right', render: (r) => <span className="ops-num">{r.distanceKm != null ? Number(r.distanceKm).toFixed(1) : '-'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge value={r.status} group="recordStatus" withDot /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <span className="adm-actions">
          <a className="adm-act" href={`/routes/${r.id}`} target="_blank" rel="noreferrer" aria-label={`View route ${r.routeNumber} as a passenger`} title="View as passenger (new tab)">
            <Eye size={16} />
          </a>
          <button type="button" className="adm-act" onClick={() => setFormTarget({ id: r.id })} aria-label={`Edit route ${r.routeNumber}`} title="Edit">
            <Pencil size={15} />
          </button>
          <button type="button" className="adm-act danger" onClick={() => setDeleting(r)} aria-label={`Delete route ${r.routeNumber}`} title="Delete">
            <Trash2 size={15} />
          </button>
        </span>
      ),
    },
  ]

  const tabItems = TABS.map((t) => ({ ...t, count: counts.data?.[t.value] ?? undefined }))

  return (
    <div className="adm-page">
      <SectionHeader title="Route Management" subtitle="Bus routes, the stops they serve and how many buses run on each." />

      <section className="adm-card adm-table-card">
        <AdminTabs items={tabItems} value={list.filters.status} onChange={(v) => list.setFilter('status', v)} ariaLabel="Route status" />
        <TableToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search route name or number…"
          actions={
            <>
              <Button variant="outline" size="sm" icon={<Download size={16} />} onClick={exportRows} disabled={!list.rows.length} title="Download the rows on this page as CSV">
                Export
              </Button>
              <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormTarget({ new: true })}>
                Add New Route
              </Button>
            </>
          }
        />
        <DataTable
          columns={columns}
          rows={list.rows}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          meta={list.meta}
          onPageChange={list.setPage}
          noun="routes"
          empty={{
            icon: <RouteIcon size={24} />,
            title: list.search ? 'No routes match your search' : 'No routes here',
            message: list.search ? `Nothing found for "${list.search}". Try a route number like S12.` : 'Routes in this status will appear here.',
            action:
              !list.search && !list.filters.status ? (
                <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormTarget({ new: true })}>
                  Add the first route
                </Button>
              ) : null,
          }}
        />
      </section>

      <RouteFormModal target={formTarget} onClose={() => setFormTarget(null)} onSaved={saved} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this route?"
        confirmLabel="Delete route"
        message={
          deleting && (
            <>
              Route <b>{deleting.routeNumber}</b> ({deleting.name}) and its stop list will be permanently removed.
              {deleting.totalBuses > 0 && ` ${plural(deleting.totalBuses, 'bus is', 'buses are')} linked to it and will be left without a route.`} This cannot be undone - mark it Inactive
              instead to just hide it.
            </>
          )
        }
        onConfirm={remove}
      />
    </div>
  )
}
