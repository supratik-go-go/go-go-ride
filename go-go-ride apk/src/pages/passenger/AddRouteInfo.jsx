import { useRef, useState } from 'react'
import { CheckCircle2, MapPin, Plus, Route, X } from 'lucide-react'
import { StopInput } from '../../components/navigation/SearchBar'
import { Button, EmptyState, ErrorState, Input, PageHeader, Skeleton, StatusBadge, Textarea, useToast } from '../../components/ui'
import { contributionService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { timeAgo } from '../../utils/format'
import './passenger.css'

const pin = (className) => <MapPin size={22} className={className} fill="currentColor" stroke="#fff" strokeWidth={1.6} />

export default function AddRouteInfo() {
  const toast = useToast()
  const nextKey = useRef(1)
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [middle, setMiddle] = useState([])
  const [routeNumber, setRouteNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)
  const mine = useAsync(() => contributionService.myRoutes({ limit: 50 }).then((r) => r.data), [])

  const addStop = () => setMiddle((rows) => [...rows, { key: nextKey.current++, stop: null }])
  const removeStop = (key) => setMiddle((rows) => rows.filter((r) => r.key !== key))
  const setStop = (key, stop) => setMiddle((rows) => rows.map((r) => (r.key === key ? { ...r, stop } : r)))

  const submit = async (e) => {
    e.preventDefault()
    const stops = [from, ...middle.map((r) => r.stop), to]
    if (!from?.name?.trim() || !to?.name?.trim()) {
      toast.warning('Enter where the route starts and ends.')
      return
    }
    if (stops.some((s) => !s?.name?.trim())) {
      toast.warning('Fill in every stop, or remove the empty ones.')
      return
    }
    setSaving(true)
    try {
      await contributionService.submitRoute({
        routeNumber: routeNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        stops: stops.map((s) => ({ stopId: s.id || undefined, stopName: s.name.trim() })),
      })
      setFrom(null)
      setTo(null)
      setMiddle([])
      setRouteNumber('')
      setNotes('')
      setSent(true)
      mine.reload()
    } catch (err) {
      toast.error(err)
    } finally {
      setSaving(false)
    }
  }

  const items = mine.data ?? []

  return (
    <div className="px-page">
      <PageHeader title="Add Route Information" subtitle="Our team checks every route before it goes live" />

      {sent && (
        <div className="alert alert-success px-contrib-sent" role="status">
          <CheckCircle2 size={18} />
          <span>Thank you! Your route was sent for verification. We&apos;ll notify you once it is checked.</span>
        </div>
      )}

      <form className="card px-card-pad px-contrib-form" onSubmit={submit} aria-label="Add route information">
        <StopInput label="From" value={from} onChange={setFrom} placeholder="Where the route starts" icon={pin('px-pin-from')} />
        {middle.map((row, i) => (
          <div className="px-via-row px-contrib-stop" key={row.key}>
            <StopInput label={`Stop ${i + 1}`} value={row.stop} onChange={(s) => setStop(row.key, s)} placeholder="Enter stop" icon={pin('px-pin-via')} />
            <button type="button" className="icon-btn px-via-remove" onClick={() => removeStop(row.key)} aria-label={`Remove stop ${i + 1}`}>
              <X size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="link-btn px-contrib-add" onClick={addStop}>
          <Plus size={16} /> Add a stop in between
        </button>
        <StopInput label="To" value={to} onChange={setTo} placeholder="Where the route ends" icon={pin('px-pin-to')} />
        <Input
          label="Route number (optional)"
          placeholder="e.g. S12"
          value={routeNumber}
          onChange={(e) => setRouteNumber(e.target.value.toUpperCase())}
          maxLength={20}
          autoComplete="off"
        />
        <Textarea label="Anything else? (optional)" placeholder="e.g. first and last bus times" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
        <Button type="submit" size="lg" block loading={saving}>
          Submit for Verification
        </Button>
      </form>

      <section className="px-section" aria-labelledby="px-contrib-title">
        <h2 id="px-contrib-title" className="px-section-title">
          Your routes
        </h2>
        {mine.loading && !mine.data ? (
          <Skeleton height={76} radius={14} />
        ) : mine.error && !mine.data ? (
          <ErrorState error={mine.error} onRetry={mine.reload} compact />
        ) : !items.length ? (
          <EmptyState compact icon={<Route size={24} />} title="Nothing sent yet" message="Routes you send will appear here with their status." />
        ) : (
          <div className="px-news-list">
            {items.map((r) => (
              <div className="card px-contrib-item" key={r.id}>
                <div className="row-between">
                  <span className="fw-600">{r.name}</span>
                  <StatusBadge value={r.status} group="busStatus" />
                </div>
                <p className="text-xs text-muted">
                  {r.stops.length} stops · {timeAgo(r.submittedAt)}
                </p>
                {r.status === 'REJECTED' && r.rejectionReason && <p className="text-xs text-danger">Rejected: {r.rejectionReason}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
