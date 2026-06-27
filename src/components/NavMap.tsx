import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../types'

function Recenter({ pos, zoom }: { pos: LatLng; zoom: number }) {
  const map = useMap()
  useEffect(() => { map.setView(pos, zoom, { animate: false }) }, [map, pos, zoom])
  return null
}

interface Props {
  track: LatLng[]
  pos: LatLng
  heading: number
  height?: number
}

/**
 * Heading-up-Karte fuer den On-Bike-Player: das Fahrzeug bleibt fix in der Mitte,
 * die Karte dreht sich unter ihm (CSS-Rotation des Kartencontainers, hochskaliert,
 * damit keine leeren Ecken entstehen). MapLibre-GL-Vektor-Tiles waeren der
 * Fidelity-Upgrade (offline), brauchen aber eine Style-/Tile-Quelle.
 */
export function NavMap({ track, pos, heading, height = 300 }: Props) {
  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', background: '#111017' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `rotate(${-heading}deg) scale(1.5)`, transformOrigin: '50% 50%', transition: 'transform .2s linear' }}>
        <MapContainer
          center={pos}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" maxZoom={19} />
          {track.length > 1 && (
            <>
              <Polyline positions={track} pathOptions={{ color: '#2a2935', weight: 11, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline positions={track} pathOptions={{ color: '#FF8A3D', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
            </>
          )}
          <Recenter pos={pos} zoom={15} />
        </MapContainer>
      </div>

      {/* Fahrzeug fix in der Mitte, zeigt nach oben (Fahrtrichtung) */}
      <div style={{ position: 'absolute', left: '50%', top: '58%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <path d="M15,2 L26,26 L15,20 L4,26 Z" fill="#6BD5E1" stroke="#0E0D11" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>

      <span className="mono" style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 9, color: '#55545e', pointerEvents: 'none' }}>© OSM · CARTO</span>
    </div>
  )
}
