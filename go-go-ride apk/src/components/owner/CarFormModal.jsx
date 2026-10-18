import { useEffect, useState } from 'react'
import { Camera, CarFront, Clock, Hash, MapPin, Phone, UserRound, X } from 'lucide-react'
import { assetUrl } from '../../api/client'
import { localCarService } from '../../services'
import { useAuth } from '../../context/AuthContext'
import { Button, Input, Modal, useToast } from '../ui'
import { isValidPhone } from '../../utils/format'
import { IMAGE_ACCEPT, cleanMessage, formatBytes, serverFieldErrors, validateUpload } from './ownerUtils'
import '../../pages/owner/owner.css'

const blank = (user) => ({
  driverName: user?.name || '',
  phone: user?.phone || '',
  area: '',
  carModel: '',
  carNumber: '',
  availableFrom: '06:00',
  availableTo: '22:00',
  status: 'ACTIVE',
})

/** Add / edit a local car listing, with an optional photo upload after saving. */
export function CarFormModal({ open, car, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const editing = Boolean(car)
  const [form, setForm] = useState(blank(user))
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  useEffect(() => {
    if (!open) return
    setForm(
      car
        ? {
            driverName: car.driverName || '',
            phone: car.phone || '',
            area: car.area || '',
            carModel: car.carModel || '',
            carNumber: car.carNumber || '',
            availableFrom: car.availableFrom || '06:00',
            availableTo: car.availableTo || '22:00',
            status: car.status || 'ACTIVE',
          }
        : blank(user),
    )
    setPhoto(null)
    setPhotoError(null)
    setErrors({})
    setInputKey((k) => k + 1)
  }, [open, car, user])

  useEffect(() => {
    if (!photo) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e))
  }

  const validate = () => {
    const e = {}
    const name = form.driverName.trim()
    if (name.length < 2) e.driverName = 'Enter the driver’s name'
    else if (name.length > 80) e.driverName = 'Keep the name under 80 characters'
    if (!isValidPhone(form.phone)) e.phone = 'Enter a valid 10-digit mobile number'
    if (form.area.trim().length < 2) e.area = 'Enter the area where you take rides'
    if (form.carModel.trim().length > 80) e.carModel = 'Keep the model under 80 characters'
    if (form.carNumber.trim().length > 20) e.carNumber = 'Car number is too long'
    if (!form.availableFrom) e.availableFrom = 'Required'
    if (!form.availableTo) e.availableTo = 'Required'
    if (form.availableFrom && form.availableFrom === form.availableTo) e.availableTo = 'Must differ from the start time'
    return e
  }

  const pickPhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const problem = validateUpload(f, { imageOnly: true })
    setPhotoError(problem)
    setPhoto(problem ? null : f)
  }

  const submit = async (e) => {
    e.preventDefault()
    const v = validate()
    setErrors(v)
    if (Object.keys(v).length) return
    const body = {
      driverName: form.driverName.trim(),
      phone: form.phone.replace(/\D/g, '').slice(-10),
      area: form.area.trim(),
      carModel: form.carModel.trim() || (editing ? null : undefined),
      carNumber: form.carNumber.trim().toUpperCase() || (editing ? null : undefined),
      availableFrom: form.availableFrom,
      availableTo: form.availableTo,
      status: form.status,
    }
    setBusy(true)
    let saved
    try {
      saved = editing ? await localCarService.update(car.id, body) : await localCarService.create(body)
    } catch (err) {
      const fe = serverFieldErrors(err)
      if (Object.keys(fe).length) setErrors(fe)
      toast.error(err)
      setBusy(false)
      return
    }
    if (photo) {
      try {
        saved = await localCarService.uploadPhoto(saved.id, photo)
      } catch (err) {
        toast.error(`Listing saved, but the photo didn't upload: ${cleanMessage(err.message)}`)
      }
    }
    setBusy(false)
    toast.success(editing ? 'Listing updated' : saved.verified ? 'Car listed' : 'Car listed — our team will verify your details')
    onSaved?.(saved, { created: !editing })
    onClose?.()
  }

  const currentPhoto = preview || assetUrl(car?.photoUrl)

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={editing ? 'Edit car listing' : 'List your car'}
      subtitle={editing ? car?.carNumber || car?.carModel : 'Passengers nearby can call you directly'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="own-car-form" loading={busy}>
            {editing ? 'Save changes' : 'List car'}
          </Button>
        </>
      }
    >
      <form id="own-car-form" className="stack" style={{ '--gap': '14px' }} onSubmit={submit} noValidate>
        <div className="own-photo-pick">
          <div className="own-photo-preview">
            {currentPhoto ? <img src={currentPhoto} alt="Car" /> : <CarFront size={34} />}
          </div>
          <div className="stack" style={{ '--gap': '6px', minWidth: 0 }}>
            <span className="fw-600 text-sm">Car photo</span>
            <span className="text-xs text-muted">A clear photo helps passengers recognise your car. JPG, PNG or WEBP, up to 5 MB.</span>
            <div className="row wrap" style={{ '--gap': '8px' }}>
              <label className="btn btn-outline btn-sm own-file-btn">
                <Camera size={15} /> {currentPhoto ? 'Change photo' : 'Add photo'}
                <input key={inputKey} type="file" accept={IMAGE_ACCEPT} className="own-sr-only" onChange={pickPhoto} />
              </label>
              {photo && (
                <button type="button" className="link-btn" onClick={() => { setPhoto(null); setInputKey((k) => k + 1) }}>
                  <X size={14} /> Remove ({formatBytes(photo.size)})
                </button>
              )}
            </div>
            {photoError && <span className="field-error">{photoError}</span>}
          </div>
        </div>

        <div className="own-grid">
          <Input label="Driver name" required icon={<UserRound size={17} />} value={form.driverName} onChange={(e) => set('driverName', e.target.value)} error={errors.driverName} maxLength={80} />
          <Input
            label="Mobile number"
            required
            type="tel"
            inputMode="tel"
            icon={<Phone size={17} />}
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            error={errors.phone}
            hint="Shown publicly so passengers can call you"
            maxLength={16}
          />
          <Input
            label="Area"
            required
            icon={<MapPin size={17} />}
            placeholder="e.g. Howrah Station"
            value={form.area}
            onChange={(e) => set('area', e.target.value)}
            error={errors.area}
            maxLength={80}
          />
          <Input label="Car model" icon={<CarFront size={17} />} placeholder="e.g. Maruti Dzire" value={form.carModel} onChange={(e) => set('carModel', e.target.value)} error={errors.carModel} maxLength={80} />
          <Input
            label="Car number"
            icon={<Hash size={17} />}
            placeholder="WB 22 AB 1122"
            value={form.carNumber}
            onChange={(e) => set('carNumber', e.target.value.toUpperCase())}
            error={errors.carNumber}
            maxLength={20}
          />
          <div className="field">
            <span className="field-label">Listing status</span>
            <div className="segmented" role="radiogroup" aria-label="Listing status">
              {[
                ['ACTIVE', 'Active'],
                ['INACTIVE', 'Inactive'],
              ].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={form.status === v} className={form.status === v ? 'active' : ''} onClick={() => set('status', v)}>
                  {l}
                </button>
              ))}
            </div>
            <span className="field-hint">{form.status === 'ACTIVE' ? 'Visible in Local Cars' : 'Hidden from the Local Cars list'}</span>
          </div>
          <Input label="Available from" type="time" required icon={<Clock size={17} />} value={form.availableFrom} onChange={(e) => set('availableFrom', e.target.value)} error={errors.availableFrom} />
          <Input label="Available until" type="time" required icon={<Clock size={17} />} value={form.availableTo} onChange={(e) => set('availableTo', e.target.value)} error={errors.availableTo} />
        </div>
      </form>
    </Modal>
  )
}
