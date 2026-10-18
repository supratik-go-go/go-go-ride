import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  BusFront,
  CheckCircle2,
  CircleCheck,
  CircleHelp,
  Crown,
  ExternalLink,
  Fan,
  FileText,
  Gauge,
  IndianRupee,
  Loader2,
  Lock,
  Mail,
  Phone,
  Rocket,
  Route,
  Snowflake,
  Users,
  UserRound,
  XCircle,
  Zap,
} from 'lucide-react'
import { assetUrl } from '../../api/client'
import { busService, routeService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SectionHeader,
  Select,
  Skeleton,
  StatusBadge,
  optionsFrom,
  useToast,
} from '../../components/ui'
import { OwnerGate, OwnerOnlyBanner, VerificationSteps } from '../../components/owner/OwnerParts'
import {
  ChoiceChips,
  DOC_TILES,
  DocTiles,
  JourneySummary,
  RouteEnds,
  ServiceDaysPicker,
  StopagesEditor,
  newStopRow,
} from '../../components/owner/BusFormParts'
import { DEFAULT_DAYS, focusFirstError, serverFieldErrors } from '../../components/owner/ownerUtils'
import { LABELS, formatDate, formatPhone, label, splitDays, to12h } from '../../utils/format'
import './owner.css'

const cx = (...c) => c.filter(Boolean).join(' ')

const INITIAL = {
  busNumber: '',
  busName: '',
  type: '',
  category: '',
  operator: '',
  totalSeats: '45',
  fare: '',
  contactNumber: '',
  contactStart: '06:00',
  contactEnd: '22:00',
  serviceDays: DEFAULT_DAYS,
  routeId: '',
}

const EMPTY_FILES = { RC_BOOK: null, ROUTE_PERMIT: null, INSURANCE: null, OTHER: null }

const TYPE_CHIPS = [
  { value: 'AC', label: 'AC', icon: Snowflake },
  { value: 'NON_AC', label: 'Non-AC', icon: Fan },
]
const CATEGORY_CHIPS = [
  { value: 'SUPER_FAST', label: 'Super Fast', icon: Rocket, tone: 'green' },
  { value: 'NORMAL', label: 'Normal', icon: Gauge, tone: 'orange' },
  { value: 'EXPRESS', label: 'Express', icon: Zap, tone: 'blue' },
  { value: 'DELUXE', label: 'Deluxe', icon: Crown, tone: 'violet' },
]

const initialRows = () => [newStopRow({ distanceKm: '0' }), newStopRow()]

/** Server keys ("serviceDays.0", "stopages.2.arrivalTime") -> the keys the form renders. */
function normaliseServerErrors(fe) {
  const out = {}
  for (const [k, v] of Object.entries(fe)) {
    if (k.startsWith('serviceDays')) out.serviceDays = v
    else if (/^stopages\.\d+\.(stopName|stopId)$/.test(k)) out[k.replace(/\.(stopName|stopId)$/, '.stop')] = v
    else if (/^stopages\.\d+$/.test(k)) out[`${k}.stop`] = v
    else out[k] = v
  }
  return out
}

function Section({ title, subtitle, children, action, className }) {
  return (
    <section className={cx('own-section card', className)}>
      <div className="own-section-head">
        <div>
          <h2 className="own-section-title">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function FormSkeleton() {
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      {[220, 180, 260].map((h, i) => (
        <Skeleton key={i} height={h} radius={16} />
      ))}
    </div>
  )
}

function UploadStatus({ item }) {
  const tile = DOC_TILES.find((t) => t.type === item.type)
  return (
    <li className={cx('own-up-item', item.status)}>
      <span className="own-up-icon">
        {item.status === 'done' ? (
          <CheckCircle2 size={18} />
        ) : item.status === 'failed' ? (
          <XCircle size={18} />
        ) : item.status === 'uploading' ? (
          <Loader2 size={18} className="own-spin" />
        ) : (
          <FileText size={18} />
        )}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="fw-600" style={{ display: 'block' }}>
          {tile?.title || label('docType', item.type)}
        </span>
        <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
          {item.status === 'failed' ? item.error || 'Upload failed' : item.file.name}
        </span>
      </span>
      <span className="text-xs fw-600 own-up-state">
        {item.status === 'done' ? 'Uploaded' : item.status === 'failed' ? 'Failed' : item.status === 'uploading' ? 'Uploading…' : 'Waiting'}
      </span>
    </li>
  )
}

export default function BusForm({ admin = false }) {
  const { isOwner } = useAuth()
  const { id } = useParams()
  if (!admin && !isOwner) {
    return (
      <div className="own-page">
        <PageHeader title={id ? 'Edit Bus' : 'Add Bus'} />
        <OwnerGate />
      </div>
    )
  }
  return <BusFormScreen admin={admin} id={id} />
}

function BusFormScreen({ admin, id }) {
  const editing = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const listPath = admin ? '/admin/buses' : '/owner/buses'
  const formRef = useRef(null)

  const existing = useAsync(() => (editing ? busService.get(id) : Promise.resolve(null)), [id])
  const routes = useAsync(() => (admin ? routeService.list({ limit: 100 }) : Promise.resolve(null)), [admin])

  const [form, setForm] = useState(INITIAL)
  const [rows, setRows] = useState(initialRows)
  const [files, setFiles] = useState(EMPTY_FILES)
  const [fileErrors, setFileErrors] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [phase, setPhase] = useState('form') // form | saving | done
  const [progress, setProgress] = useState({ saved: false, uploads: [] })
  const [created, setCreated] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [dirty, setDirty] = useState(false)

  const bus = existing.data
  const notMine = editing && !admin && bus && user && bus.ownerId !== user.id

  // Prefill when editing.
  useEffect(() => {
    if (!bus) return
    setForm({
      busNumber: bus.busNumber || '',
      busName: bus.busName || '',
      type: bus.type || '',
      category: bus.category || '',
      operator: bus.operator || '',
      totalSeats: bus.totalSeats != null ? String(bus.totalSeats) : '',
      fare: bus.fare != null ? String(bus.fare) : '',
      contactNumber: bus.contactNumber || '',
      contactStart: bus.contactStart || '06:00',
      contactEnd: bus.contactEnd || '22:00',
      serviceDays: splitDays(bus.serviceDays),
      routeId: bus.routeId || '',
    })
    const list = bus.timetable?.length ? bus.timetable : bus.stopages || []
    setRows(
      list.length >= 2
        ? list.map((s) =>
            newStopRow({
              stop: s.stop ? { id: s.stop.id, name: s.stop.name } : null,
              arrivalTime: s.arrivalTime || '',
              departureTime: s.departureTime || '',
              distanceKm: s.distanceKm != null ? String(s.distanceKm) : '',
            }),
          )
        : initialRows(),
    )
  }, [bus])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty || phase !== 'form') return undefined
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, phase])

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e))
    setDirty(true)
  }

  const onRowsEdited = (keys) => {
    setDirty(true)
    setErrors((e) => {
      const next = { ...e, stopages: undefined }
      for (const k of Object.keys(next)) {
        if (keys === 'all' ? k.startsWith('stopages.') : keys.includes(k)) delete next[k]
      }
      return next
    })
  }

  const onFile = (type, file, error) => {
    setFiles((f) => ({ ...f, [type]: error ? null : file }))
    setFileErrors((fe) => ({ ...fe, [type]: error || undefined }))
    setErrors((e) => ({ ...e, documents: undefined }))
    setDirty(true)
  }

  const routeOptions = useMemo(
    () => (routes.data?.data || []).map((r) => ({ value: r.id, label: `${r.routeNumber} · ${r.name}` })),
    [routes.data],
  )

  // ---------------------------------------------------------------- validation
  function validate() {
    const e = {}
    if (!editing) {
      const bn = form.busNumber.trim()
      if (!bn) e.busNumber = 'Enter the bus registration number'
      else if (bn.length < 4 || bn.length > 20) e.busNumber = 'Bus number must be 4–20 characters'
    }
    const name = form.busName.trim()
    if (name && name.length < 2) e.busName = 'Bus name must be at least 2 characters'
    if (name.length > 80) e.busName = 'Keep the bus name under 80 characters'
    if (!form.type) e.type = 'Select the bus type'
    if (!form.category) e.category = 'Select the bus category'
    if (form.operator.trim().length > 80) e.operator = 'Keep the operator name under 80 characters'
    if (form.totalSeats !== '') {
      const n = Number(form.totalSeats)
      if (!Number.isInteger(n) || n < 1 || n > 120) e.totalSeats = 'Seats must be a whole number from 1 to 120'
    }
    if (form.fare !== '') {
      const f = Number(form.fare)
      if (!Number.isFinite(f) || f < 0) e.fare = 'Enter a valid fare'
    }
    const contact = form.contactNumber.trim()
    const digits = contact.replace(/\D/g, '')
    if (!contact) e.contactNumber = 'Enter a number passengers can call for bookings'
    else if (!/^[+\d\s-]+$/.test(contact) || digits.length < 6 || contact.length > 20) e.contactNumber = 'Enter a valid mobile or landline number'
    if (!form.contactStart) e.contactStart = 'Required'
    if (!form.contactEnd) e.contactEnd = 'Required'
    if (form.contactStart && form.contactEnd && form.contactEnd <= form.contactStart) e.contactEnd = 'Must be after the start time'
    if (!form.serviceDays.length) e.serviceDays = 'Select at least one day the bus runs'

    if (rows.length < 2) e.stopages = 'A route needs at least two stops'
    const last = rows.length - 1
    let prevTime = null
    let prevDist = null
    rows.forEach((r, i) => {
      const b = `stopages.${i}`
      const stopName = r.stop?.name?.trim()
      if (!stopName) e[`${b}.stop`] = i === 0 ? 'Enter the starting stop' : i === last ? 'Enter the last stop' : 'Enter the stop name'
      else if (!r.stop.id && stopName.length < 2) e[`${b}.stop`] = 'Stop name must be at least 2 characters'
      if (!r.arrivalTime) e[`${b}.arrivalTime`] = 'Enter the arrival time'
      if (!r.departureTime) e[`${b}.departureTime`] = 'Enter the departure time'
      if (r.arrivalTime && r.departureTime && r.departureTime < r.arrivalTime) e[`${b}.departureTime`] = 'Must be at or after arrival'
      if (prevTime && r.arrivalTime && r.arrivalTime < prevTime) e[`${b}.arrivalTime`] = `Must be ${to12h(prevTime)} or later (previous stop)`
      if (r.departureTime || r.arrivalTime) prevTime = r.departureTime || r.arrivalTime
      const raw = String(r.distanceKm ?? '').trim()
      if (raw === '') {
        if (i > 0) e[`${b}.distanceKm`] = 'Enter km from the start'
      } else {
        const d = Number(raw)
        if (!Number.isFinite(d) || d < 0) e[`${b}.distanceKm`] = 'Enter a valid distance'
        else {
          if (prevDist != null && d < prevDist) e[`${b}.distanceKm`] = `Can't be less than ${prevDist} km`
          prevDist = d
        }
      }
    })

    if (Object.values(fileErrors).some(Boolean)) e.documents = 'Fix or remove the highlighted file'
    else if (!editing && !admin && !Object.values(files).some(Boolean)) {
      e.documents = 'Upload at least one ownership document so we can verify your bus'
    }
    return e
  }

  function buildPayload() {
    const p = {
      busName: form.busName.trim() || (editing ? null : undefined),
      type: form.type,
      category: form.category,
      operator: form.operator.trim() || (editing ? null : undefined),
      totalSeats: form.totalSeats === '' ? undefined : Number(form.totalSeats),
      fare: form.fare === '' ? undefined : Number(form.fare),
      contactNumber: form.contactNumber.trim(),
      contactStart: form.contactStart,
      contactEnd: form.contactEnd,
      serviceDays: form.serviceDays,
      stopages: rows.map((r) => ({
        ...(r.stop?.id ? { stopId: r.stop.id } : { stopName: r.stop.name.trim() }),
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        distanceKm: Number(r.distanceKm || 0),
      })),
    }
    if (!editing) p.busNumber = form.busNumber.trim().toUpperCase()
    if (admin) p.routeId = form.routeId || (editing ? null : undefined)
    return p
  }

  // ---------------------------------------------------------------- submit
  async function uploadAll(busId, items, onUpdate) {
    const out = [...items]
    for (let i = 0; i < out.length; i += 1) {
      if (out[i].status === 'done') continue
      out[i] = { ...out[i], status: 'uploading', error: null }
      onUpdate([...out])
      try {
        await busService.uploadDocument(busId, out[i].file, out[i].type)
        out[i] = { ...out[i], status: 'done' }
      } catch (err) {
        out[i] = { ...out[i], status: 'failed', error: err.message }
      }
      onUpdate([...out])
    }
    return out
  }

  function handleSaveError(err) {
    if (err?.status === 403) {
      setFormError(
        admin
          ? err.message
          : `${err.message || 'You are not allowed to do this.'} Only Bus Owner accounts can add buses, and owners can only edit their own buses.`,
      )
      toast.error(err)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const fe = normaliseServerErrors(serverFieldErrors(err))
    if (Object.keys(fe).length) {
      setErrors(fe)
      toast.error('Please fix the highlighted fields')
      focusFirstError(formRef.current)
      return
    }
    if (err?.status === 409 || err?.code === 'CONFLICT' || err?.code === 'DUPLICATE') {
      setErrors({ busNumber: err.message })
      toast.error(err)
      focusFirstError(formRef.current)
      return
    }
    if (err?.status === 400) setFormError(err.message)
    toast.error(err)
  }

  async function save() {
    setFormError(null)
    const payload = buildPayload()
    const queued = Object.entries(files)
      .filter(([, f]) => f)
      .map(([type, file]) => ({ type, file, status: 'pending', error: null }))
    setProgress({ saved: false, uploads: queued })
    setPhase('saving')
    let saved
    try {
      saved = editing ? await busService.update(id, payload) : await busService.create(payload)
    } catch (err) {
      setPhase('form')
      handleSaveError(err)
      return
    }
    setDirty(false)
    setProgress((p) => ({ ...p, saved: true }))
    const results = await uploadAll(saved.id, queued, (uploads) => setProgress((p) => ({ ...p, uploads })))
    setProgress({ saved: true, uploads: results })
    setCreated(saved)
    const failed = results.filter((r) => r.status === 'failed').length

    if (editing) {
      if (failed) toast.error(`Bus saved, but ${failed} document${failed > 1 ? 's' : ''} failed to upload. Retry from Documents on My Buses.`)
      else if (!admin && bus?.status === 'APPROVED' && saved.status === 'UNDER_REVIEW') toast.success('Changes saved. Your bus is back under review.')
      else toast.success('Bus updated')
      navigate(listPath)
      return
    }
    setPhase('done')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onSubmit = (e) => {
    e.preventDefault()
    const v = validate()
    setErrors(v)
    if (Object.keys(v).length) {
      toast.error('Please fix the highlighted fields')
      focusFirstError(formRef.current)
      return
    }
    if (editing && !admin && bus?.status === 'APPROVED') {
      setConfirmOpen(true)
      return
    }
    save()
  }

  const retryFailed = async () => {
    setRetrying(true)
    const results = await uploadAll(created.id, progress.uploads, (uploads) => setProgress((p) => ({ ...p, uploads })))
    setProgress((p) => ({ ...p, uploads: results }))
    setRetrying(false)
    if (results.every((r) => r.status === 'done')) toast.success('All documents uploaded')
  }

  const startAnother = () => {
    setForm(INITIAL)
    setRows(initialRows())
    setFiles(EMPTY_FILES)
    setFileErrors({})
    setErrors({})
    setFormError(null)
    setCreated(null)
    setProgress({ saved: false, uploads: [] })
    setPhase('form')
    window.scrollTo({ top: 0 })
  }

  // ---------------------------------------------------------------- render
  const title = editing ? 'Edit Bus' : admin ? 'Add New Bus' : 'Add Bus'
  const header = admin ? (
    <SectionHeader
      title={title}
      subtitle={editing ? (bus ? `${bus.busNumber}${bus.busName ? ` · ${bus.busName}` : ''}` : 'Loading…') : 'Create a bus with its route timetable. New buses start as Pending.'}
      actions={
        <Button variant="outline" icon={<ArrowLeft size={17} />} to={listPath}>
          Back to buses
        </Button>
      }
    />
  ) : (
    <PageHeader
      title={title}
      actions={
        <IconButton label="How verification works" onClick={() => setHelpOpen(true)}>
          <CircleHelp size={22} />
        </IconButton>
      }
    />
  )

  const wrap = (content) => (
    <div className={cx('own-page own-form-page', admin && 'own-admin')}>
      {header}
      {content}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="How adding a bus works">
        <div className="stack" style={{ '--gap': '14px' }}>
          <p className="text-sm text-2">
            Every bus is checked by the GO-GO Ride team before passengers can see it. Fill in the details, add the route with stop timings, and upload at least
            one ownership document.
          </p>
          <VerificationSteps />
          <div className="alert alert-warning">
            <BellRing size={16} />
            <span>After approval, report non-operating dates at least 5 days in advance from My Buses.</span>
          </div>
        </div>
      </Modal>
    </div>
  )

  if (editing && existing.error && !bus) {
    return wrap(<ErrorState error={existing.error} onRetry={existing.reload} title={existing.error.status === 404 ? 'Bus not found' : undefined} />)
  }
  if (editing && !bus) return wrap(<FormSkeleton />)
  if (notMine) {
    return wrap(
      <EmptyState
        icon={<Lock size={26} />}
        title="You can only edit your own buses"
        message="This bus is registered to another owner."
        action={<Button to={listPath}>Back to My Buses</Button>}
      />,
    )
  }

  // ---- success screen (create) ----------------------------------------------
  if (phase === 'done' && created) {
    const failed = progress.uploads.filter((u) => u.status === 'failed')
    return wrap(
      <div className="own-success card">
        <span className="own-success-icon">
          <CheckCircle2 size={44} />
        </span>
        <h2>{admin ? 'Bus created' : 'Submitted for verification'}</h2>
        <p className="text-2">
          <strong>{created.busNumber}</strong> is now <StatusBadge value={created.status || 'PENDING'} group="busStatus" />.{' '}
          {admin
            ? 'Approve it from Bus Requests to make it visible to passengers.'
            : "Our team will verify your documents. You'll get a notification as soon as your bus is approved and live."}
        </p>
        <VerificationSteps status={created.status || 'PENDING'} />

        {progress.uploads.length > 0 && (
          <div className="own-success-uploads">
            <div className="fw-600" style={{ marginBottom: 8 }}>
              Documents
            </div>
            <ul className="own-up-list">
              {progress.uploads.map((u) => (
                <UploadStatus key={u.type} item={u} />
              ))}
            </ul>
            {failed.length > 0 && (
              <div className="alert alert-warning" style={{ marginTop: 12 }}>
                <AlertTriangle size={16} />
                <div className="grow">
                  {failed.length} document{failed.length > 1 ? 's' : ''} didn&apos;t upload. Your bus is saved — retry now, or later from{' '}
                  {admin ? 'the bus list' : 'My Buses → Documents'}.
                  <div style={{ marginTop: 8 }}>
                    <Button size="sm" variant="outline" onClick={retryFailed} loading={retrying}>
                      Retry failed uploads
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="own-success-actions">
          <Button size="lg" to={listPath}>
            {admin ? 'Go to Bus Management' : 'Go to My Buses'}
          </Button>
          {admin && (
            <Button size="lg" variant="outline" to="/admin/bus-requests">
              Open Bus Requests
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={startAnother}>
            Add another bus
          </Button>
        </div>
      </div>,
    )
  }

  const ownerInfo = admin ? (editing ? bus?.owner : user) : user
  const existingDocs = bus?.documents || []
  const submitLabel = editing ? 'Save Changes' : admin ? 'Create Bus' : 'Submit for Verification'

  return wrap(
    <>
      {!admin && !editing && <OwnerOnlyBanner />}

      {editing && bus && (
        <div className={cx('own-status-card card', bus.status === 'REJECTED' && 'rejected')}>
          <div className="row-between wrap" style={{ '--gap': '10px' }}>
            <div className="row" style={{ '--gap': '10px' }}>
              <span className="icon-tile sm">
                <BusFront size={18} />
              </span>
              <div>
                <div className="fw-700">{bus.busNumber}</div>
                <div className="text-xs text-muted">Submitted {formatDate(bus.submittedAt || bus.createdAt)}</div>
              </div>
            </div>
            <StatusBadge value={bus.status} group="busStatus" size="lg" />
          </div>
          {bus.status === 'REJECTED' && (
            <div className="alert alert-danger" style={{ marginTop: 12 }}>
              <XCircle size={16} />
              <span>
                <strong>Rejected:</strong> {bus.rejectionReason || 'No reason given.'} Saving changes keeps the status as Rejected — contact support to request another
                review after fixing the issue.
              </span>
            </div>
          )}
          {!admin && bus.status === 'APPROVED' && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              <AlertTriangle size={16} />
              <span>This bus is live. Saving changes sends it back for review and hides it from passengers until it&apos;s approved again.</span>
            </div>
          )}
        </div>
      )}

      {formError && (
        <div className="alert alert-danger own-form-error" role="alert">
          <AlertTriangle size={18} />
          <span>{formError}</span>
        </div>
      )}

      <form ref={formRef} className="own-form" onSubmit={onSubmit} noValidate>
        {/* ---------------- bus details */}
        <Section title="Bus Details">
          <div className="own-grid">
            <Input
              label="Bus Number"
              required={!editing}
              icon={<BusFront size={18} />}
              placeholder="WB 01 AB 1234"
              value={form.busNumber}
              onChange={(e) => setField('busNumber', e.target.value.toUpperCase())}
              disabled={editing}
              maxLength={20}
              error={errors.busNumber}
              hint={editing ? "The registration number can't be changed. Contact support if it's wrong." : 'As printed on the RC book'}
              autoCapitalize="characters"
            />
            <Input
              label="Bus Name"
              icon={<BusFront size={18} />}
              placeholder="e.g., Shree Travels"
              value={form.busName}
              onChange={(e) => setField('busName', e.target.value)}
              maxLength={80}
              error={errors.busName}
            />
            <Select
              label="Bus Type"
              required
              placeholder="Select bus type"
              options={optionsFrom(LABELS.busType)}
              value={form.type}
              onChange={(e) => setField('type', e.target.value)}
              error={errors.type}
            />
            <Select
              label="Bus Category"
              required
              placeholder="Select category"
              options={optionsFrom(LABELS.busCategory)}
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
              error={errors.category}
            />
          </div>
          <div className="own-chips-row">
            <ChoiceChips options={TYPE_CHIPS} value={form.type} onChange={(v) => setField('type', v)} ariaLabel="Bus type" />
            <ChoiceChips options={CATEGORY_CHIPS} value={form.category} onChange={(v) => setField('category', v)} ariaLabel="Bus category" />
          </div>
          <div className="own-grid three">
            <Input
              label="Operator"
              placeholder="e.g., WBTC or your company"
              value={form.operator}
              onChange={(e) => setField('operator', e.target.value)}
              maxLength={80}
              error={errors.operator}
            />
            <Input
              label="Total Seats"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              icon={<Users size={17} />}
              value={form.totalSeats}
              onChange={(e) => setField('totalSeats', e.target.value)}
              error={errors.totalSeats}
            />
            <Input
              label="Fare (₹)"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              icon={<IndianRupee size={17} />}
              placeholder="Full-route fare"
              value={form.fare}
              onChange={(e) => setField('fare', e.target.value)}
              error={errors.fare}
            />
          </div>
        </Section>

        {/* ---------------- owner + booking contact */}
        <Section title="Bus Owner Information">
          {admin && !editing && (
            <div className="alert alert-info">
              <UserRound size={16} />
              <span>Buses created from the admin panel are registered under your admin account.</span>
            </div>
          )}
          <div className="own-grid">
            <Input label="Owner Name" icon={<UserRound size={17} />} value={ownerInfo?.name || ''} disabled readOnly />
            <Input label="Mobile Number" icon={<Phone size={17} />} value={formatPhone(ownerInfo?.phone) || ''} disabled readOnly />
            <Input
              label="Alternate Contact Number (For Booking)"
              required
              icon={<Phone size={17} />}
              type="tel"
              inputMode="tel"
              placeholder="Enter contact number"
              value={form.contactNumber}
              onChange={(e) => setField('contactNumber', e.target.value)}
              maxLength={20}
              error={errors.contactNumber}
              hint="This number will be shown to passengers for booking inquiries."
            />
            <Input label="Email (Optional)" icon={<Mail size={17} />} value={ownerInfo?.email || ''} placeholder="No email on account" disabled readOnly />
          </div>
          <div className="own-grid">
            <Input
              label="Booking calls from"
              type="time"
              required
              value={form.contactStart}
              onChange={(e) => setField('contactStart', e.target.value)}
              error={errors.contactStart}
            />
            <Input
              label="Booking calls until"
              type="time"
              required
              value={form.contactEnd}
              onChange={(e) => setField('contactEnd', e.target.value)}
              error={errors.contactEnd}
            />
          </div>
          {!admin && (
            <p className="text-xs text-muted">
              Owner name, mobile and email come from your account. To change them, <Link to="/profile/edit">edit your profile</Link>.
            </p>
          )}
        </Section>

        {/* ---------------- documents */}
        <Section title="Ownership Proof" subtitle="Upload any one of the following documents">
          {existingDocs.length > 0 && (
            <ul className="own-doc-list compact">
              {existingDocs.map((d) => (
                <li key={d.id}>
                  <a href={assetUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer" className="own-doc-link">
                    <span className="icon-tile sm">
                      <FileText size={16} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="fw-600" style={{ display: 'block' }}>
                        {label('docType', d.docType)}
                      </span>
                      <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
                        {d.originalName || 'Document'} · {formatDate(d.uploadedAt)}
                      </span>
                    </span>
                    <ExternalLink size={15} className="text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <DocTiles files={files} errors={fileErrors} existing={existingDocs} onChange={onFile} invalid={Boolean(errors.documents)} />
          {errors.documents && <span className="field-error">{errors.documents}</span>}
          <p className="own-secure-note">
            <Lock size={13} /> Your documents are secure and will only be used for verification purposes. JPG, PNG, WEBP or PDF, up to 5 MB each.
          </p>
        </Section>

        {/* ---------------- route */}
        <Section title="Bus Route & Stopages">
          <RouteEnds rows={rows} onChange={setRows} errors={errors} onEdited={onRowsEdited} />
          {admin && (
            <Select
              label="Linked route (optional)"
              placeholder={routes.loading ? 'Loading routes…' : 'No linked route'}
              options={routeOptions}
              value={form.routeId}
              onChange={(e) => setField('routeId', e.target.value)}
              error={errors.routeId}
              hint="Linking a route gives the bus its route number badge (e.g. S12) in search results."
            />
          )}
          <StopagesEditor rows={rows} onChange={setRows} errors={errors} onEdited={onRowsEdited} />
          {errors.stopages && <span className="field-error">{errors.stopages}</span>}
          <JourneySummary rows={rows} />
          <p className="text-xs text-muted row" style={{ '--gap': '6px', alignItems: 'flex-start' }}>
            <Route size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            Pick stops from the suggestions when you can. A new stop name you type is added to the directory and our team will place it on the map.
          </p>
        </Section>

        {/* ---------------- service days */}
        <Section title="Service Days" subtitle="Select the days you operate this bus">
          <ServiceDaysPicker value={form.serviceDays} onChange={(v) => setField('serviceDays', v)} error={errors.serviceDays} />
        </Section>

        <div className="own-notice orange">
          <span className="own-notice-icon">
            <BellRing size={20} />
          </span>
          <div>
            <div className="fw-600">Please update in our app at least 5 days in advance if the bus will not operate on any specific date.</div>
            <div className="text-sm">This helps passengers plan their journey better. You can add these dates from My Buses → Non-operating dates.</div>
          </div>
        </div>

        <div className="own-notice green">
          <span className="own-notice-icon">
            <CircleCheck size={22} />
          </span>
          <div>
            <div className="fw-600">Verification &amp; Approval</div>
            <div className="text-sm">
              {admin
                ? 'New buses start as Pending. Approve them from Bus Requests to list them for passengers.'
                : 'After you submit the details, our team will verify your documents and approve your bus. You will be notified once your bus is live.'}
            </div>
          </div>
        </div>

        <div className="own-submit">
          <Button type="submit" size="lg" block loading={phase === 'saving'}>
            {submitLabel}
          </Button>
          <Button variant="ghost" to={listPath} disabled={phase === 'saving'}>
            Cancel
          </Button>
        </div>
      </form>

      <Modal open={phase === 'saving'} dismissible={false} title={editing ? 'Saving changes' : admin ? 'Creating bus' : 'Submitting your bus'} size="sm">
        <ul className="own-up-list">
          <li className={cx('own-up-item', progress.saved ? 'done' : 'uploading')}>
            <span className="own-up-icon">{progress.saved ? <CheckCircle2 size={18} /> : <Loader2 size={18} className="own-spin" />}</span>
            <span className="grow fw-600">Saving bus details</span>
            <span className="text-xs fw-600 own-up-state">{progress.saved ? 'Saved' : 'Saving…'}</span>
          </li>
          {progress.uploads.map((u) => (
            <UploadStatus key={u.type} item={u} />
          ))}
        </ul>
        <p className="text-xs text-muted" style={{ marginTop: 12 }}>
          Please keep this screen open until everything is uploaded.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false)
          await save()
        }}
        title="Send this bus for review?"
        message="Saving will send this bus back for review (Under Review) and hide it from passengers until it's re-approved."
        confirmLabel="Save & send for review"
        tone="primary"
      />
    </>,
  )
}
