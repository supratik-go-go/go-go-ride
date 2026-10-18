import { useRef, useState } from 'react'
import {
  BadgeCheck,
  Camera,
  CarFront,
  Clock,
  ExternalLink,
  Hourglass,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react'
import { assetUrl } from '../../api/client'
import { localCarService } from '../../services'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../context/AuthContext'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StarRating,
  StatusBadge,
  useToast,
} from '../../components/ui'
import { CarFormModal } from '../../components/owner/CarFormModal'
import { IMAGE_ACCEPT, cleanMessage, validateUpload } from '../../components/owner/ownerUtils'
import { formatPhone } from '../../utils/format'
import './owner.css'

function CarsSkeleton() {
  return (
    <div className="own-car-grid">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ overflow: 'hidden' }}>
          <Skeleton height={150} radius={0} />
          <div className="stack" style={{ padding: 16, '--gap': '10px' }}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={13} width="80%" />
            <Skeleton height={13} width="50%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyCars() {
  const { isDriver } = useAuth()
  const toast = useToast()
  const q = useAsync(() => localCarService.mine(), [])
  const [formFor, setFormFor] = useState(null) // null | 'new' | car
  const [deleting, setDeleting] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(null)
  const photoInput = useRef(null)
  const photoTarget = useRef(null)

  const cars = q.data || []

  const upsert = (saved, { created }) => {
    q.setData((list) => {
      const rest = (list || []).filter((c) => c.id !== saved.id)
      return created ? [saved, ...rest] : (list || []).map((c) => (c.id === saved.id ? saved : c))
    })
  }

  const remove = async () => {
    try {
      await localCarService.remove(deleting.id)
      q.setData((list) => (list || []).filter((c) => c.id !== deleting.id))
      toast.success('Listing removed')
    } catch (err) {
      toast.error(err)
      throw err
    }
  }

  const choosePhoto = (car) => {
    photoTarget.current = car
    photoInput.current?.click()
  }

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const car = photoTarget.current
    if (!file || !car) return
    const problem = validateUpload(file, { imageOnly: true })
    if (problem) {
      toast.error(problem)
      return
    }
    setPhotoBusy(car.id)
    try {
      const saved = await localCarService.uploadPhoto(car.id, file)
      upsert(saved, { created: false })
      toast.success('Photo updated')
    } catch (err) {
      toast.error(cleanMessage(err.message))
    } finally {
      setPhotoBusy(null)
    }
  }

  return (
    <div className="own-page">
      <PageHeader title="My Car Listings" subtitle="Local Cars passengers can call" />

      <div className="own-car-intro card">
        <span className="icon-tile lg accent">
          <CarFront size={26} />
        </span>
        <div className="grow stack" style={{ '--gap': '6px' }}>
          <h2 className="own-section-title">{isDriver ? 'Get rides from passengers nearby' : 'Drive a local car? List it here'}</h2>
          <p className="text-sm text-2">
            Your listing appears under Local Cars with your phone number, so passengers in your area can call you directly — no booking fees.
          </p>
          <ul className="own-car-points">
            <li>
              <ShieldCheck size={15} /> New listings show “Awaiting verification” until our team checks your details.
            </li>
            <li>
              <Users size={15} /> Set a listing to Inactive when you&apos;re not taking rides.
            </li>
          </ul>
        </div>
        <Button icon={<Plus size={18} />} onClick={() => setFormFor('new')} className="own-car-intro-btn">
          Add car
        </Button>
      </div>

      {q.loading && !q.data ? (
        <CarsSkeleton />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !cars.length ? (
        <div className="card">
          <EmptyState
            icon={<CarFront size={26} />}
            title="No cars listed yet"
            message="Add your car with your area and available hours. Passengers nearby will be able to call you."
            action={
              <Button icon={<Plus size={18} />} onClick={() => setFormFor('new')}>
                List your first car
              </Button>
            }
          />
        </div>
      ) : (
        <div className="own-car-grid">
          {cars.map((car) => {
            const photo = assetUrl(car.photoUrl)
            return (
              <article key={car.id} className={`own-car card ${car.status === 'INACTIVE' ? 'inactive' : ''}`}>
                <div className="own-car-photo">
                  {photo ? (
                    <img src={photo} alt={`${car.carModel || 'Car'} of ${car.driverName}`} loading="lazy" />
                  ) : (
                    <div className="own-car-ph" aria-hidden="true">
                      <CarFront size={44} />
                    </div>
                  )}
                  <span className="own-car-verify">
                    {car.verified ? (
                      <Badge tone="success" icon={<BadgeCheck size={13} />}>
                        Verified by GO-GO Ride
                      </Badge>
                    ) : (
                      <Badge tone="warning" icon={<Hourglass size={13} />}>
                        Awaiting verification
                      </Badge>
                    )}
                  </span>
                  <button type="button" className="own-car-photo-btn" onClick={() => choosePhoto(car)} disabled={photoBusy === car.id}>
                    <Camera size={15} className={photoBusy === car.id ? 'own-spin' : undefined} />
                    {photoBusy === car.id ? 'Uploading…' : photo ? 'Change photo' : 'Add photo'}
                  </button>
                </div>

                <div className="own-car-body">
                  <div className="row-between" style={{ '--gap': '8px' }}>
                    <div className="fw-700 truncate">{car.driverName}</div>
                    <StatusBadge value={car.status} group="recordStatus" />
                  </div>
                  <div className="row" style={{ '--gap': '6px' }}>
                    <StarRating value={car.ratingAvg || 0} size={14} />
                    <span className="text-xs text-muted">
                      {car.ratingCount ? `${Number(car.ratingAvg).toFixed(1)} · ${car.ratingCount} ${car.ratingCount === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
                    </span>
                  </div>
                  <ul className="own-car-info">
                    <li>
                      <Phone size={15} /> {formatPhone(car.phone)}
                    </li>
                    <li>
                      <MapPin size={15} /> {car.area}
                    </li>
                    <li>
                      <CarFront size={15} /> {[car.carModel, car.carNumber].filter(Boolean).join(' · ') || 'Car details not added'}
                    </li>
                    <li>
                      <Clock size={15} /> {car.availabilityLabel}
                    </li>
                  </ul>
                  {car.status === 'INACTIVE' && <p className="text-xs text-muted">Inactive — hidden from the Local Cars list.</p>}
                </div>

                <div className="own-car-actions">
                  <Button size="sm" variant="soft" icon={<Pencil size={15} />} onClick={() => setFormFor(car)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" icon={<ExternalLink size={15} />} to={`/local-cars/${car.id}`}>
                    View
                  </Button>
                  <button type="button" className="own-icon-btn danger" onClick={() => setDeleting(car)} aria-label={`Delete listing for ${car.driverName}`} title="Delete listing">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <input ref={photoInput} type="file" accept={IMAGE_ACCEPT} className="own-sr-only" onChange={onPhoto} tabIndex={-1} aria-hidden="true" />

      <CarFormModal open={Boolean(formFor)} car={formFor === 'new' ? null : formFor} onClose={() => setFormFor(null)} onSaved={upsert} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Remove this listing?"
        message={deleting ? `${deleting.driverName}'s ${deleting.carModel || 'car'} will be removed from Local Cars. Passengers won't be able to find or call it here any more.` : ''}
        confirmLabel="Remove listing"
      />
    </div>
  )
}
