import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Polyline, Marker, Popup, AttributionControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DarkReliefTiles } from './MapTiles'
import { IcX } from './Icons'
import { fmt } from '../lib/format'
import type { LatLng, Stage } from '../types'
import type { StagePass } from '../lib/passes'

const startIcon = L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#FF8A3D;border:2px solid #0E0D11;box-shadow:0 0 0 1px #FF8A3D"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
const endIcon = L.divIcon({ className: '', html: '<div style="width:15px;height:15px;border-radius:50%;background:#0E0D11;border:2.5px solid #6BD5E1"></div>', iconSize: [15, 15], iconAnchor: [7.5, 7.5] })
const passIcon = L.divIcon({ className: '', html: '<div style="width:15px;height:15px;border-radius:50%;background:#FF8A3D;border:2px solid #0E0D11;box-shadow:0 0 0 2px rgba(255,138,61,.35)"></div>', iconSize: [15, 15], iconAnchor: [7.5, 7.5] })

interface Props {
  title: string
  stages: Stage[]
  tracks?: Record<string, LatLng[]>
  passes: StagePass[]
  initialPass?: StagePass
  onClose: () => void
}

const keyOf = (p: StagePass) => `${p.stageId}-${p.distFromStart}-${p.name}`

/** Vollbild-Karte: interaktiv (Ziehen + Zoom), alle Etappen-Linien, Start/Ziel und
 *  klickbare Pass-Pins mit Popup. Chip-Leiste fliegt zum Pass und oeffnet dessen Popup. */
export function MapModal({ title, stages, tracks, passes, initialPass, onClose }: Props) {
  const [map, setMap] = useState<L.Map | null>(null)
  const markerRefs = useRef<Record<string, L.Marker>>({})

  const lines = useMemo(
    () => stages.map((s) => ({ id: s.id, pts: tracks?.[s.id]?.length ? tracks[s.id] : s.track ?? [s.start, s.end] })),
    [stages, tracks],
  )
  const allPoints = useMemo(() => lines.flatMap((l) => l.pts), [lines])
  const center: LatLng = allPoints[0] ?? [44.7, 6.4]
  const last = stages[stages.length - 1]

  const focusPass = useCallback((p: StagePass) => {
    if (!map) return
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 12), { duration: 0.7 })
    const m = markerRefs.current[keyOf(p)]
    if (m) window.setTimeout(() => m.openPopup(), 320)
  }, [map])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Karte bereit -> Groesse neu messen, einpassen, ggf. auf initialPass fliegen.
  useEffect(() => {
    if (!map) return
    map.invalidateSize()
    if (allPoints.length) map.fitBounds(L.latLngBounds(allPoints.map((p) => L.latLng(p[0], p[1]))), { padding: [40, 40] })
    if (initialPass) window.setTimeout(() => focusPass(initialPass), 380)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  return (
    <div style={overlay}>
      <div style={header}>
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">Karte</span>
          <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        </div>
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={22} /></button>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapContainer ref={setMap} center={center} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom attributionControl={false}>
          <AttributionControl prefix={false} position="bottomright" />
          <DarkReliefTiles />
          {lines.map((l) => (
            <Polyline key={`g-${l.id}`} positions={l.pts} pathOptions={{ color: '#FF8A3D', weight: 8, opacity: 0.14, lineCap: 'round', lineJoin: 'round' }} />
          ))}
          {lines.map((l) => (
            <Polyline key={`m-${l.id}`} positions={l.pts} pathOptions={{ color: '#FF8A3D', weight: 2.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
          ))}
          {stages.map((s) => <Marker key={`s-${s.id}`} position={s.start} icon={startIcon} />)}
          {last && <Marker position={last.end} icon={endIcon} />}
          {passes.map((p) => (
            <Marker key={keyOf(p)} position={[p.lat, p.lng]} icon={passIcon} ref={(m) => { if (m) markerRefs.current[keyOf(p)] = m }}>
              <Popup>
                <div className="map-pop-name">{p.name}</div>
                <div className="map-pop-meta">{fmt(p.altitude)} m · T{p.day} · bei {Math.round(p.distFromStart / 1000)} km</div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {passes.length > 0 && (
        <div style={chipBar}>
          {passes.map((p) => (
            <button key={keyOf(p)} onClick={() => focusPass(p)} style={chip}>
              <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700 }}>T{p.day}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{p.name}</span>
              <span className="mono" style={{ color: 'var(--glacier)' }}>{fmt(p.altitude)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, background: 'var(--ink)',
  display: 'flex', flexDirection: 'column', maxWidth: 'var(--shell)', margin: '0 auto',
}
const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  padding: 'max(12px, env(safe-area-inset-top)) 14px 12px', borderBottom: '0.5px solid var(--slate)',
}
const closeBtn: React.CSSProperties = { background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 10, color: 'var(--snow)', padding: 8, display: 'flex', cursor: 'pointer', flexShrink: 0 }
const chipBar: React.CSSProperties = {
  display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
  borderTop: '0.5px solid var(--slate)', background: 'var(--ink)', WebkitOverflowScrolling: 'touch',
}
const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
  background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 999,
  padding: '8px 12px', fontSize: 13, color: 'var(--snow)', cursor: 'pointer',
}
