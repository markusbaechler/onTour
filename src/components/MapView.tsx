import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng, Stage } from '../types'

const startIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#FF8A3D;border:2px solid #0E0D11;box-shadow:0 0 0 1px #FF8A3D"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

function colIcon(label: string) {
  return L.divIcon({
    className: '',
    html: `<div class="col-marker">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 18],
  })
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const b = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])))
    map.fitBounds(b, { padding: [28, 28] })
  }, [map, points])
  return null
}

interface Props {
  stages: Stage[]
  /** optionale echte Tracks (z. B. aus hochgeladenem GPX), Key = stageId */
  tracks?: Record<string, LatLng[]>
  height?: number
}

export function MapView({ stages, tracks, height = 260 }: Props) {
  const lines = useMemo(
    () => stages.map((s) => ({ id: s.id, pts: tracks?.[s.id]?.length ? tracks[s.id] : s.track ?? [s.start, s.end] })),
    [stages, tracks],
  )
  const allPoints = useMemo(() => lines.flatMap((l) => l.pts), [lines])
  const center: LatLng = allPoints[0] ?? [44.7, 6.4]

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '0.5px solid var(--slate)' }}>
      <MapContainer center={center} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        {lines.map((l, i) => (
          <Polyline key={l.id} positions={l.pts} pathOptions={{ color: '#FF8A3D', weight: 3, opacity: 0.9 - i * 0.04 }} />
        ))}
        {stages.map((s) => (
          <Marker key={s.id} position={s.start} icon={startIcon} />
        ))}
        {stages.map((s) =>
          s.cols.map((c, j) => {
            const t = tracks?.[s.id]?.length ? tracks[s.id] : s.track ?? [s.start, s.end]
            const pos = t[Math.min(Math.floor((t.length - 1) * ((j + 1) / (s.cols.length + 1))), t.length - 1)]
            return <Marker key={`${s.id}-c${j}`} position={pos} icon={colIcon(`${c.altitude} m`)} />
          }),
        )}
        <FitBounds points={allPoints} />
      </MapContainer>
    </div>
  )
}
