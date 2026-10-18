import { useEffect, useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import { DEFAULT_CENTER } from '../../services/locationService'

// Leaflet + OpenStreetMap: no API key, no billing account, works in the
// browser and inside the Android WebView. Markers are HTML (divIcon), which
// also sidesteps Leaflet's broken default-icon paths under bundlers.

const BUS_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'

export function busIcon({ label, tone = 'primary', selected } = {}) {
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
    html: `<div class="map-bus ${tone} ${selected ? 'selected' : ''}">${BUS_SVG}${label ? `<span class="map-bus-label">${label}</span>` : ''}</div>`,
  })
}

export function stopIcon({ kind = 'stop', label } = {}) {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="map-stop ${kind}">${label ? `<span>${label}</span>` : ''}</div>`,
  })
}

export const userIcon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div class="map-user"></div>',
})

/** Fit the map to a set of [lat,lng] points whenever their identity changes. */
export function FitBounds({ points, padding = 40, maxZoom = 15, refitKey }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (!points.length) return undefined
    const fit = () => {
      if (points.length === 1) map.setView(points[0], maxZoom)
      else map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom })
    }
    fit()
    // Containers that are still animating / sizing (bottom sheets, tabs) report
    // a wrong size at mount; fit once more after they settle.
    const t = setTimeout(() => {
      map.invalidateSize()
      fit()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, refitKey])
  return null
}

/** Smoothly re-centre on a point when it changes (follow mode). */
export function FollowPoint({ point, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.panTo([point.lat, point.lng], { animate: true, duration: 0.8 })
  }, [point?.lat, point?.lng, map, zoom])
  return null
}

/** Leaflet needs a nudge when its container is resized (tabs, sidebars). */
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

/**
 * <MapView height={360} center={{lat,lng}} zoom={13} fit={[[lat,lng],...]}>
 *   <BusMarker ... /> <StopMarker ... /> <RouteLine ... />
 * </MapView>
 */
export function MapView({ center = DEFAULT_CENTER, zoom = 13, height = 360, fit, refitKey, children, className = '', scrollWheelZoom = true }) {
  const fitPoints = useMemo(() => (fit || []).filter(Boolean), [fit])
  return (
    <div className={`map-view ${className}`} style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom={scrollWheelZoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <InvalidateOnResize />
        {fitPoints.length > 0 && <FitBounds points={fitPoints} refitKey={refitKey} />}
        {children}
      </MapContainer>
    </div>
  )
}

export function BusMarker({ point, label, tone, selected, onClick, children, tooltip }) {
  if (!point) return null
  return (
    <Marker
      position={[point.lat, point.lng]}
      icon={busIcon({ label, tone, selected })}
      zIndexOffset={selected ? 1000 : 500}
      eventHandlers={onClick ? { click: onClick } : undefined}
    >
      {tooltip && <Tooltip direction="top" offset={[0, -18]}>{tooltip}</Tooltip>}
      {children && <Popup>{children}</Popup>}
    </Marker>
  )
}

export function StopMarker({ point, kind, label, name, children, onClick }) {
  if (!point) return null
  return (
    <Marker position={[point.lat, point.lng]} icon={stopIcon({ kind, label })} eventHandlers={onClick ? { click: onClick } : undefined}>
      {name && <Tooltip direction="top" offset={[0, -10]}>{name}</Tooltip>}
      {children && <Popup>{children}</Popup>}
    </Marker>
  )
}

export function UserMarker({ point, accuracy }) {
  if (!point) return null
  return (
    <>
      {accuracy > 0 && accuracy < 2000 && (
        <CircleMarker center={[point.lat, point.lng]} radius={Math.min(60, Math.max(14, accuracy / 8))} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.08 }} />
      )}
      <Marker position={[point.lat, point.lng]} icon={userIcon} zIndexOffset={900}>
        <Tooltip direction="top" offset={[0, -10]}>You are here</Tooltip>
      </Marker>
    </>
  )
}

/** Route polyline. `travelled` (0..n) draws the completed part in a muted style. */
export function RouteLine({ points, color = '#0b2a7a', weight = 5, dashed }) {
  const latlngs = points.filter(Boolean).map((p) => [p.lat, p.lng])
  if (latlngs.length < 2) return null
  return <Polyline positions={latlngs} pathOptions={{ color, weight, opacity: 0.85, dashArray: dashed ? '8 10' : undefined, lineCap: 'round' }} />
}
