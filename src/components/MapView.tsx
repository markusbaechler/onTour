import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Polyline, Marker, AttributionControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DarkReliefTiles } from './MapTiles'
import type { LatLng, Stage } from '../types'

const startIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#FF8A3D;border:2px solid #0E0D11;box-shadow:0 0 0 1px #FF8A3D"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const endIcon = L.divIcon({
  className: '',
  html: '<div style="width:13px;height:13px;border-radius:50%;background:#0E0D11;border:2.5px solid #6BD5E1"></div>',
  iconSize: [13, 13],
  iconAnchor: [6.5, 6.5],
})

// Pass = kleiner Punkt ohne Text (Details stehen in den Etappen-Badges).
const passIcon = L.divIcon({
  className: '',
  html: '<div style="width:7px;height:7px;border-radius:50%;background:#FF8A3D;box-shadow:0 0 0 2px rgba(255,138,61,.22)"></div>',
  iconSize: [7, 7],
  iconAnchor: [3.5, 3.5],
})

// Hervorgehobener Pass: leuchtet + pulsiert (beim Klick in der Liste).
const glowIcon = L.divIcon({
  className: '',
  html: '<div class="map-pass-glow"><div class="core"></div></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function FitBounds({ points, sig }: { points: LatLng[]; sig: string }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    const b = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])))
    map.fitBounds(b, { padding: [28, 28] })
    // sig (Etappen-Inhalt) als Dep: laeuft nur bei echter Routenaenderung,
    // damit ein flyTo zum hervorgehobenen Pass nicht zurueckgesetzt wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig])
  return null
}

/** Fliegt zum hervorgehobenen Pass; beim Deaktivieren wieder raus auf die ganze Etappe. */
function FlyController({ pos, points }: { pos?: LatLng | null; points: LatLng[] }) {
  const map = useMap()
  const had = useRef(false)
  useEffect(() => {
    if (pos) {
      map.flyTo(pos, Math.max(map.getZoom(), 10), { duration: 0.6 })
      had.current = true
    } else if (had.current) {
      had.current = false
      if (points.length) map.flyToBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))), { padding: [28, 28], duration: 0.6 })
    }
    // points bewusst nicht als Dep: sonst wuerde jeder Re-Render erneut fliegen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pos])
  return null
}

interface Props {
  stages: Stage[]
  /** optionale echte Tracks (z. B. aus hochgeladenem GPX), Key = stageId */
  tracks?: Record<string, LatLng[]>
  /** Pass-Positionen als dezente Punkte (nur Detail-/Etappenkarte) */
  passes?: LatLng[]
  /** hervorgehobener Pass (leuchtet + Karte pant dorthin) */
  highlight?: LatLng | null
  height?: number
}

export function MapView({ stages, tracks, passes, highlight, height = 260 }: Props) {
  const lines = useMemo(
    () => stages.map((s) => ({ id: s.id, pts: tracks?.[s.id]?.length ? tracks[s.id] : s.track ?? [s.start, s.end] })),
    [stages, tracks],
  )
  const allPoints = useMemo(() => lines.flatMap((l) => l.pts), [lines])
  const fitSig = lines.map((l) => `${l.id}:${l.pts.length}`).join('|')
  const center: LatLng = allPoints[0] ?? [44.7, 6.4]
  const last = stages[stages.length - 1]

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '0.5px solid var(--slate)' }}>
      <MapContainer center={center} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
        <AttributionControl prefix={false} position="bottomright" />
        <DarkReliefTiles />
        {/* dezenter Glow unter der Route */}
        {lines.map((l) => (
          <Polyline key={`g-${l.id}`} positions={l.pts} pathOptions={{ color: '#FF8A3D', weight: 8, opacity: 0.14, lineCap: 'round', lineJoin: 'round' }} />
        ))}
        {lines.map((l, i) => (
          <Polyline key={`m-${l.id}`} positions={l.pts} pathOptions={{ color: '#FF8A3D', weight: 2.5, opacity: 0.95 - i * 0.03, lineCap: 'round', lineJoin: 'round' }} />
        ))}
        {/* Etappen-Start/Ziel statt ueberlappender Col-Labels */}
        {stages.map((s) => (
          <Marker key={`s-${s.id}`} position={s.start} icon={startIcon} />
        ))}
        {last && <Marker position={last.end} icon={endIcon} />}
        {/* Pass-Punkte nur auf der Detailkarte */}
        {passes?.map((p, i) => (
          <Marker key={`p-${i}`} position={p} icon={passIcon} />
        ))}
        {highlight && <Marker position={highlight} icon={glowIcon} zIndexOffset={1000} />}
        <FitBounds points={allPoints} sig={fitSig} />
        <FlyController pos={highlight} points={allPoints} />
      </MapContainer>
    </div>
  )
}
