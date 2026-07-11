import type { LatLng } from '../../types'

export interface FlyoverPass { lat: number; lng: number; name: string; altitude: number }
export interface Flyover {
  pts: Array<[number, number]>
  passes: Array<{ x: number; y: number; frac: number; name: string; altitude: number }>
}

/** Projiziert einen Etappen-Track (und seine Paesse) fit-to-bounds auf die W×H-Flaeche. */
export function buildFlyover(track: LatLng[], passes: FlyoverPass[], W: number, H: number, pad = 90): Flyover {
  if (track.length < 2) return { pts: [], passes: [] }
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [la, ln] of track) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln) }
  const midLat = (minLat + maxLat) / 2, midLng = (minLng + maxLng) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const geoW = Math.max(1e-6, (maxLng - minLng) * kx)
  const geoH = Math.max(1e-6, maxLat - minLat)
  const scale = Math.min((W - 2 * pad) / geoW, (H - 2 * pad) / geoH)
  const cx = W / 2, cy = H / 2
  const project = (la: number, ln: number): [number, number] => [cx + (ln - midLng) * kx * scale, cy - (la - midLat) * scale]

  const pts = track.map(([la, ln]) => project(la, ln))
  const n = track.length
  const nearestFrac = (la: number, ln: number): number => {
    let best = Infinity, bi = 0
    for (let i = 0; i < n; i++) { const d = (track[i][0] - la) ** 2 + (track[i][1] - ln) ** 2; if (d < best) { best = d; bi = i } }
    return bi / (n - 1)
  }
  return {
    pts,
    passes: passes.map((p) => { const [x, y] = project(p.lat, p.lng); return { x, y, frac: nearestFrac(p.lat, p.lng), name: p.name, altitude: p.altitude } }),
  }
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

/** Zeichnet die Route bis `progress` (0..1), Paesse leuchten auf, Label kinetisch. */
export function drawFlyover(ctx: CanvasRenderingContext2D, fly: Flyover, progress: number) {
  const n = fly.pts.length
  if (n < 2) return
  const p = Math.min(1, Math.max(0, progress))
  const upto = Math.max(1, Math.floor(p * (n - 1)))
  const line = new Path2D()
  line.moveTo(fly.pts[0][0], fly.pts[0][1])
  for (let i = 1; i <= upto; i++) line.lineTo(fly.pts[i][0], fly.pts[i][1])

  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(255,138,61,0.16)'; ctx.lineWidth = 12; ctx.stroke(line)
  ctx.strokeStyle = '#FF8A3D'; ctx.lineWidth = 3.5; ctx.stroke(line)

  const head = fly.pts[upto]
  ctx.beginPath(); ctx.arc(head[0], head[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()
  ctx.beginPath(); ctx.arc(head[0], head[1], 11, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,138,61,0.6)'; ctx.lineWidth = 2; ctx.stroke()

  for (const pass of fly.passes) {
    if (p < pass.frac) continue
    const since = p - pass.frac
    ctx.beginPath(); ctx.arc(pass.x, pass.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#6BD5E1'; ctx.fill()
    ctx.beginPath(); ctx.arc(pass.x, pass.y, 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(107,213,225,0.5)'; ctx.lineWidth = 6; ctx.stroke()
    if (since < 0.18) {
      const a = easeOut(since / 0.12)
      ctx.globalAlpha = a
      const dy = (1 - a) * 10
      ctx.fillStyle = '#F2F1F5'
      ctx.font = '700 26px "Space Grotesk", system-ui, sans-serif'
      ctx.fillText(pass.name, pass.x + 12, pass.y - 6 - dy)
      ctx.fillStyle = '#6BD5E1'
      ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace'
      ctx.fillText(`${Math.round(pass.altitude)} m`, pass.x + 12, pass.y + 16 - dy)
      ctx.globalAlpha = 1
    }
  }
}
