import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, AttributionControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DarkReliefTiles } from './MapTiles'
import { MapGestures } from './MapGestures'
import { trip } from '../data/trip'
import type { LatLng, Photo } from '../types'

/** Foto-Position: echte EXIF-Koordinaten, sonst Fallback auf die Etappen-Position
 *  (mit kleinem Versatz, damit Fotos ohne Geo nicht exakt stapeln). Nie weglassen. */
function photoPos(p: Photo, i: number): LatLng {
  if (typeof p.lat === 'number' && typeof p.lng === 'number') return [p.lat, p.lng]
  const s = trip.stages.find((st) => st.id === p.stageId)
  const base: LatLng = s?.start ?? [45.5, 6.5]
  const o = ((i % 6) - 2.5) * 0.006
  return [base[0] + o, base[1] + o * 0.8]
}

function thumbIcon(p: Photo) {
  return L.divIcon({
    className: '',
    html: `<img src="${p.thumbUrl}" alt="" style="width:38px;height:38px;border-radius:8px;object-fit:cover;border:2px solid #FF8A3D;box-shadow:0 1px 5px rgba(0,0,0,.55)"/>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

function Fit({ pts }: { pts: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1]))), { padding: [44, 44], maxZoom: 12 })
  }, [map, pts])
  return null
}

export function PhotoTimelineMap({ photos, onOpen, height = 360 }: { photos: Photo[]; onOpen: (id: string) => void; height?: number }) {
  const ordered = useMemo(() => [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [photos])
  const positions = useMemo(() => ordered.map((p, i) => photoPos(p, i)), [ordered])
  const center: LatLng = positions[0] ?? [45.5, 6.5]

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '0.5px solid var(--slate)' }}>
      <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
        <AttributionControl prefix={false} position="bottomright" />
        <MapGestures />
        <DarkReliefTiles />
        {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: '#FF8A3D', weight: 2, opacity: 0.5, dashArray: '4 5' }} />}
        {ordered.map((p, i) => (
          <Marker key={p.id} position={positions[i]} icon={thumbIcon(p)} eventHandlers={{ click: () => onOpen(p.id) }} />
        ))}
        <Fit pts={positions} />
      </MapContainer>
    </div>
  )
}
