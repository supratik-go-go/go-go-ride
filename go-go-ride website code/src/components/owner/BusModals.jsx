import { useEffect, useState } from 'react'
import { CalendarX2, ExternalLink, FileText, ImageIcon, Lock, Trash2, Upload } from 'lucide-react'
import { assetUrl } from '../../api/client'
import { busService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, optionsFrom, useToast } from '../ui'
import { LABELS, addDays, formatDate, formatDateLong, label, todayISO } from '../../utils/format'
import { DOC_ACCEPT, formatBytes, serverFieldErrors, validateUpload } from './ownerUtils'
import '../../pages/owner/owner.css'

const OWNER_NOTICE_DAYS = 5

/**
 * Non-operating dates for one bus: list upcoming ones, add (owners need 5 days
 * notice - the backend rule), remove.
 */
export function ExceptionsModal({ bus, open, onClose, isAdmin }) {
  const toast = useToast()
  const q = useAsync(() => (open && bus ? busService.get(bus.id) : Promise.resolve(null)), [open, bus?.id])
  const minDate = isAdmin ? todayISO() : addDays(todayISO(), OWNER_NOTICE_DAYS)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)

  useEffect(() => {
    if (open) {
      setDate('')
      setReason('')
      setErrors({})
    }
  }, [open, bus?.id])

  const exceptions = [...(q.data?.exceptions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const add = async (e) => {
    e.preventDefault()
    const next = {}
    if (!date) next.date = 'Pick a date'
    else if (date < minDate) next.date = isAdmin ? 'Pick today or a future date' : `Dates must be at least ${OWNER_NOTICE_DAYS} days away (from ${formatDate(minDate)})`
    if (reason.length > 200) next.reason = 'Keep the reason under 200 characters'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const created = await busService.addException(bus.id, date, reason.trim() || undefined)
      q.setData((d) => {
        if (!d) return d
        const rest = (d.exceptions || []).filter((x) => x.id !== created.id)
        return { ...d, exceptions: [...rest, created] }
      })
      toast.success(`${bus.busNumber} marked as not running on ${formatDate(date)}`)
      setDate('')
      setReason('')
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      else if (err?.status === 400) setErrors({ date: err.message })
      else toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (ex) => {
    setRemoving(ex.id)
    try {
      await busService.removeException(bus.id, ex.id)
      q.setData((d) => (d ? { ...d, exceptions: (d.exceptions || []).filter((x) => x.id !== ex.id) } : d))
      toast.success('Date removed — the bus is back in service that day')
    } catch (err) {
      toast.error(err)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Non-operating dates" subtitle={bus ? `${bus.busNumber}${bus.busName ? ` · ${bus.busName}` : ''}` : undefined}>
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="alert alert-warning">
          <CalendarX2 size={16} />
          <span>
            {isAdmin
              ? 'As an admin you can record a date at any time.'
              : `Add dates at least ${OWNER_NOTICE_DAYS} days in advance so passengers can plan.`}{' '}
            Anyone with an alarm on this bus for that date is notified automatically.
          </span>
        </div>

        <form className="own-exc-form" onSubmit={add} noValidate>
          <Input
            label="Date"
            type="date"
            required
            min={minDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value)
              setErrors((x) => ({ ...x, date: undefined }))
            }}
            error={errors.date}
            hint={!isAdmin ? `Earliest: ${formatDate(minDate)}` : undefined}
          />
          <Input
            label="Reason (optional)"
            value={reason}
            maxLength={200}
            onChange={(e) => {
              setReason(e.target.value)
              setErrors((x) => ({ ...x, reason: undefined }))
            }}
            placeholder="e.g. Vehicle servicing, local holiday"
            error={errors.reason}
          />
          <Button type="submit" loading={saving} icon={<CalendarX2 size={17} />}>
            Add date
          </Button>
        </form>

        <div>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="fw-600">Upcoming dates</span>
            {exceptions.length > 0 && <span className="text-xs text-muted">{exceptions.length} scheduled</span>}
          </div>
          {q.loading && !q.data ? (
            <div className="stack" style={{ '--gap': '8px' }}>
              <Skeleton height={56} radius={12} />
              <Skeleton height={56} radius={12} />
            </div>
          ) : q.error && !q.data ? (
            <ErrorState error={q.error} onRetry={q.reload} compact />
          ) : !exceptions.length ? (
            <EmptyState compact icon={<CalendarX2 size={24} />} title="No non-operating dates" message="This bus runs on all of its service days." />
          ) : (
            <ul className="own-exc-list">
              {exceptions.map((ex) => (
                <li key={ex.id} className="own-exc-item">
                  <span className="own-exc-date">
                    <span className="own-exc-day">{String(ex.date).slice(8, 10)}</span>
                    <span className="own-exc-mon">{formatDate(ex.date).split(' ')[1]}</span>
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="fw-600" style={{ display: 'block' }}>
                      {formatDateLong(ex.date)}
                    </span>
                    <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
                      {ex.reason || 'No reason given'}
                    </span>
                  </span>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    icon={<Trash2 size={15} />}
                    loading={removing === ex.id}
                    onClick={() => remove(ex)}
                    aria-label={`Remove ${formatDate(ex.date)}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

const isPdf = (doc) => /\.pdf$/i.test(doc.fileUrl || doc.originalName || '')

/** Existing documents for a bus with links, plus "upload another". */
export function DocumentsModal({ bus, open, onClose, onUploaded }) {
  const toast = useToast()
  const [docType, setDocType] = useState('RC_BOOK')
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  useEffect(() => {
    if (open) {
      setFile(null)
      setError(null)
      setDocType('RC_BOOK')
      setInputKey((k) => k + 1)
    }
  }, [open, bus?.id])

  const docs = bus?.documents || []

  const pick = (e) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setError(f ? validateUpload(f) : null)
  }

  const upload = async (e) => {
    e.preventDefault()
    const problem = validateUpload(file)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const doc = await busService.uploadDocument(bus.id, file, docType)
      onUploaded?.(doc)
      toast.success(`${label('docType', docType)} uploaded`)
      setFile(null)
      setInputKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ownership documents" subtitle={bus ? `${bus.busNumber}${bus.busName ? ` · ${bus.busName}` : ''}` : undefined}>
      <div className="stack" style={{ '--gap': '16px' }}>
        {!docs.length ? (
          <EmptyState compact icon={<FileText size={24} />} title="No documents yet" message="Upload an RC book, route permit or insurance so we can verify this bus." />
        ) : (
          <ul className="own-doc-list">
            {docs.map((d) => (
              <li key={d.id}>
                <a href={assetUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer" className="own-doc-link">
                  <span className="icon-tile sm">{isPdf(d) ? <FileText size={17} /> : <ImageIcon size={17} />}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="fw-600" style={{ display: 'block' }}>
                      {label('docType', d.docType)}
                    </span>
                    <span className="text-xs text-muted truncate" style={{ display: 'block' }}>
                      {d.originalName || 'Document'} · {formatDate(d.uploadedAt)}
                    </span>
                  </span>
                  <ExternalLink size={16} className="text-muted" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <form className="own-upload-box" onSubmit={upload} noValidate>
          <div className="fw-600">Upload another document</div>
          <div className="own-upload-row">
            <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} options={optionsFrom(LABELS.docType)} />
            <div className="field">
              <label className="field-label" htmlFor={`own-doc-file-${inputKey}`}>
                File
              </label>
              <input key={inputKey} id={`own-doc-file-${inputKey}`} type="file" accept={DOC_ACCEPT} onChange={pick} className="own-file-input" aria-invalid={Boolean(error)} />
              {file && !error && <span className="field-hint">{`${file.name} · ${formatBytes(file.size)}`}</span>}
              {error && <span className="field-error">{error}</span>}
            </div>
          </div>
          <div className="row-between wrap" style={{ '--gap': '10px' }}>
            <span className="text-xs text-muted row" style={{ '--gap': '6px' }}>
              <Lock size={13} /> JPG, PNG, WEBP or PDF · max 5 MB · used only for verification
            </span>
            <Button type="submit" icon={<Upload size={16} />} loading={busy} disabled={!file || Boolean(error)}>
              Upload
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
