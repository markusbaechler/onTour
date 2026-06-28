import { useEffect, useMemo } from 'react'
import { MapContainer, Polyline, Marker, AttributionControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DarkReliefTiles } from './MapTiles'
import { clock, timeAgo } from '../lib/format'
import { isFresh } from '../lib/store'
import { avatarInitial } from '../lib/viewer'
import type { LatLng, RiderLocation } from '../types'

function riderIcon(loc: RiderLocation) {
  const fresh = isFresh(loc)
  const color = fresh ? '#FF8A3D' : '#6b6976'
  const labelColor = fresh ? '#FF8A3D' : '#8A8896'
  const label = fresh ? timeAgo(loc.at) : clock(loc.at)
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div class="${fresh ? 'live-pulse' : ''}" style="position:relative;width:26px;height:26px">
        <div style="position:relative;z-index:1;width:26px;height:26px;border-radius:50%;background:${color};color:#0E0D11;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid #0E0D11">${avatarInitial(loc.rider)}</div>
      </div>
      <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${labelColor};margin-top:3px;background:rgba(14,13,17,.8);padding:1px 4px;border-radius:4px;white-space:nowrap">${label}</span>
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
      <MapContainer center={center} zoom={9} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
        <AttributionControl prefix={false} position="bottomright" />
        <DarkReliefTiles />
        {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#2a2935', weight: 4 }} />}
        {riders.map((r) => (
          <Marker key={r.rider} position={[r.lat, r.lng]} icon={riderIcon(r)} />
        ))}
        <Fit points={fit} />
      </MapContainer>
    </div>
  )
}
