import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { clock, timeAgo } from '../lib/format'
import { isFresh } from '../lib/store'
import { avatarInitial } from '../lib/viewer'
import type { LatLng, RiderLocation } from '../types'

function riderIcon(loc: RiderLocation) {
  const fresh = isFresh(loc)
  const color = fresh ? '#FF8A3D' : '#6b6976'
  const labelColor = fresh ? '#FF8A3D' : '#8A8896'
  const label = fresh ? timeAgo(loc.at) : clock(loc.at)
  const glow = fresh ? 'box-shadow:0 0 0 4px rgba(255,138,61,.25);' : ''
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:26px;height:26px;border-radius:50%;background:${color};color:#0E0D11;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;${glow}">${avatarInitial(loc.rider)}</div>
      <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${labelColor};margin-top:2px;background:rgba(14,13,17,.8);padding:1px 4px;border-radius:4px;white-space:nowrap">${label}</span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function Fit({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) { map.setView(points[0], 12); return }
    map.fitBounds(L.latLngBounds(points.map((p) => L.latLng(p[0], p[1]))), { padding: [40, 40], maxZoom: 13 })
  }, [map, points])
  return null
}

interface Props {
  riders: RiderLocation[]
  route?: LatLng[]
  height?: number
}

export function LiveMap({ riders, route = [], height = 228 }: Props) {
  const riderPts = useMemo<LatLng[]>(() => riders.map((r) => [r.lat, r.lng]), [riders])
  const fit = riderPts.length ? riderPts : route
  const center: LatLng = fit[0] ?? [44.7, 6.4]

  return (
    <div style={{ height, borderRadius: 12, overflow: 'hidden', border: '0.5px solid var(--slate)' }}>
      <MapContainer center={center} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={19}
        />
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2a2935', weight: 4 }} />}
        {riders.map((r) => (
          <Marker key={r.rider} position={[r.lat, r.lng]} icon={riderIcon(r)} />
        ))}
        <Fit points={fit} />
      </MapContainer>
    </div>
  )
}
