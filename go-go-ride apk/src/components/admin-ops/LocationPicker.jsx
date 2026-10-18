import { useEffect, useMemo, useState } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, Eraser, MousePointerClick } from 'lucide-react'
import { MapView } from '../map/MapView'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_CENTER, locationService } from '../../services/locationService'
import { roundCoord, toNumber } from './opsUtils'
import '../../pages/admin/admin-ops.css'

const pinIcon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 30], html: '<div class="ops-pin"></div>' })

/** Clicking the map moves the pin. */
function ClickToPick({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: roundCoord(e.latlng.lat), lng: roundCoord(e.latlng.lng) })
    },
  })
  return null
}

/** Bring the pin into view when it moves outside the visible map (typed / located). */
function KeepInView({ point }) {
  const map = useMap()
  useEffect(() => {
    if (!point) return
    const ll = L.latLng(point.lat, point.lng)
    if (!map.getBounds().contains(ll)) map.setView(ll, Math.max(map.getZoom(), 15))
  }, [point, map])
  return null
}

/**
 * Latitude / longitude inputs + a map to pick the point on.
 * Values are strings (form state); `onChange({ latitude, longitude })`.
 *
 *   <LocationPicker latitude={form.latitude} longitude={form.longitude} onChange={...} errors={errors} />
 */
export function LocationPicker({ latitude, longitude, onChange, errors = {}, height = 280, disabled }) {
  const toast = useToast()
  const [locating, setLocating] = useState(false)
  const lat = toNumber(latitude)
  const lng = toNumber(longitude)
  const valid = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const point = useMemo(() => (valid ? { lat, lng } : null), [valid, lat, lng])
  // Centre once, at mount: on the stop if it has a point, else Kolkata.
  const [initial] = useState(() => point || DEFAULT_CENTER)

  const set = (p) => onChange({ latitude: p ? String(p.lat) : '', longitude: p ? String(p.lng) : '' })

  const locate = async () => {
    setLocating(true)
    try {
      const pos = await locationService.getCurrentPosition()
      set({ lat: roundCoord(pos.lat), lng: roundCoord(pos.lng) })
      if (pos.accuracy > 100) toast.info(`Location found (accurate to about ${Math.round(pos.accuracy)} m). Drag the pin to fine-tune.`)
    } catch (err) {
      toast.error(err)
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="ops-locpicker">
      <div className="ops-form-grid">
        <Input
          label="Latitude"
          type="number"
          inputMode="decimal"
          step="any"
          min={-90}
          max={90}
          placeholder="e.g. 22.5839"
          value={latitude}
          onChange={(e) => onChange({ latitude: e.target.value, longitude })}
          error={errors.latitude}
          disabled={disabled}
        />
        <Input
          label="Longitude"
          type="number"
          inputMode="decimal"
          step="any"
          min={-180}
          max={180}
          placeholder="e.g. 88.3425"
          value={longitude}
          onChange={(e) => onChange({ latitude, longitude: e.target.value })}
          error={errors.longitude}
          disabled={disabled}
        />
      </div>
      <MapView center={initial} zoom={point ? 15 : 12} height={height}>
        {!disabled && <ClickToPick onPick={set} />}
        <KeepInView point={point} />
        {point && (
          <Marker
            position={[point.lat, point.lng]}
            icon={pinIcon}
            draggable={!disabled}
            eventHandlers={{
              dragend: (e) => {
                const ll = e.target.getLatLng()
                set({ lat: roundCoord(ll.lat), lng: roundCoord(ll.lng) })
              },
            }}
          />
        )}
      </MapView>
      <div className="ops-locpicker-bar">
        <span className="ops-locpicker-hint">
          <MousePointerClick size={14} /> Click the map or drag the pin to set the stop's position.
        </span>
        <div className="row" style={{ '--gap': '8px' }}>
          {point && (
            <Button variant="ghost" size="sm" icon={<Eraser size={15} />} onClick={() => set(null)} disabled={disabled}>
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" icon={<Crosshair size={15} />} onClick={locate} loading={locating} disabled={disabled}>
            Use my location
          </Button>
        </div>
      </div>
    </div>
  )
}

export default LocationPicker
