import type { LatLng } from '../types'

// Animierter Karten-Flyover fuer die Kapitelszene: Projektion einmal vorberechnet, Track auf
// ~300 Punkte vereinfacht (RDP), pro Frame progressiv gezeichnet. Fonts/Farben wie die App.

const INK = '#0E0D11', SIGNAL = '#FF8A3D', GLACIER = '#6BD5E1'
const DISP = '"Space Grotesk", system-ui, sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const R = 6_371_000, rad = (d: number) => (d * Math.PI) / 180

export interface FlyoverPass { lat: number; lng: number; frac: number; name: string; altitude: number }
export interface Flyover {
  pts: LatLng[]; cum: number[]; totalM: number
  minLat: number; maxLat: number; minLng: number; maxLng: number; midLat: number; midLng: number; kx: number
  midPoint: LatLng; passes: FlyoverPass[]
}

function segM(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
function perp(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b[1] - a[1], dy = b[0] - a[0], l2 = dx * dx + dy * dy
  if (l2 === 0) return Math.hypot(p[1] - a[1], p[0] - a[0])
  let t = ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[1] - (a[1] + t * dx), p[0] - (a[0] + t * dy))
}
function rdp(pts: LatLng[], eps: number): LatLng[] {
  if (pts.length < 3) return pts
  let idx = -1, dmax = 0
  for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i } }
  if (dmax > eps && idx > 0) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps))
  return [pts[0], pts[pts.length - 1]]
}

export function buildFlyover(track: LatLng[], rawPasses: Array<{ lat: number; lng: number; name: string; altitude: number; distFromStart: number }>, totalDistM: number): Flyover {
  let pts = track.length > 320 ? rdp(track, 0.0004) : track.slice()
  if (pts.length > 320) { const step = pts.length / 300; const s: LatLng[] = []; for (let i = 0; i < pts.length; i += step) s.push(pts[Math.floor(i)]); s.push(pts[pts.length - 1]); pts = s }
  if (pts.length < 2) pts = track.slice(0, 2)
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + segM(pts[i - 1], pts[i]))
  const totalM = cum[cum.length - 1] || 1
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [la, ln] of pts) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln) }
  const midLat = (minLat + maxLat) / 2, midLng = (minLng + maxLng) / 2, kx = Math.cos(rad(midLat))
  const midPoint = pointAt(pts, cum, totalM / 2)
  const passes = rawPasses.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, altitude: p.altitude, frac: Math.max(0, Math.min(1, p.distFromStart / (totalDistM || totalM))) }))
  return { pts, cum, totalM, minLat, maxLat, minLng, maxLng, midLat, midLng, kx, midPoint, passes }
}

function pointAt(pts: LatLng[], cum: number[], dist: number): LatLng {
  let i = 1
  while (i < cum.length && cum[i] < dist) i++
  if (i >= cum.length) return pts[pts.length - 1]
  const seg = cum[i] - cum[i - 1] || 1
  const t = (dist - cum[i - 1]) / seg
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
}
const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

/** Zeichnet EINEN Flyover-Frame bei Fortschritt p (0..1). */
export function drawFlyoverFrame(ctx: CanvasRenderingContext2D, w: number, h: number, fly: Flyover, p: number, opts: { durationSec: number; kmTotal: number; passCount: number }) {
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h)
  const e = easeIO(Math.max(0, Math.min(1, p)))
  const pad = 0.13 * w
  const geoW = Math.max(1e-6, (fly.maxLng - fly.minLng) * fly.kx), geoH = Math.max(1e-6, fly.maxLat - fly.minLat)
  const scale = Math.min((w - 2 * pad) / geoW, (h - 2 * pad) / geoH) * (1 + 0.16 * e)
  const cLat = lerp(fly.midLat, fly.midPoint[0], 0.38 * e), cLng = lerp(fly.midLng, fly.midPoint[1], 0.38 * e)
  const proj = (la: number, ln: number): [number, number] => [w / 2 + (ln - cLng) * fly.kx * scale, h / 2 - (la - cLat) * scale]
  const P = fly.pts.map(([la, ln]) => proj(la, ln))

  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // schwache Gesamtroute
  ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.strokeStyle = 'rgba(255,138,61,0.10)'; ctx.lineWidth = 3; ctx.stroke()

  // progressiv gezeichnete Route bis zum Fahrer
  const dist = Math.max(0, Math.min(1, p)) * fly.totalM
  let idx = 1
  while (idx < fly.cum.length && fly.cum[idx] < dist) idx++
  const driver = proj(...pointAt(fly.pts, fly.cum, dist))
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1])
  for (let i = 1; i < idx; i++) ctx.lineTo(P[i][0], P[i][1])
  ctx.lineTo(driver[0], driver[1])
  ctx.strokeStyle = 'rgba(255,138,61,0.20)'; ctx.lineWidth = 11; ctx.stroke()
  ctx.strokeStyle = SIGNAL; ctx.lineWidth = 3.5; ctx.stroke()

  // Pass-Punkte (erreichte)
  for (const pass of fly.passes) {
    if (p < pass.frac) continue
    const [x, y] = proj(pass.lat, pass.lng)
    ctx.beginPath(); ctx.arc(x, y, w * 0.006, 0, Math.PI * 2); ctx.fillStyle = GLACIER; ctx.fill()
  }

  // Labels nacheinander (max 2), Seite alternierend, mit Leader-Line
  const dur = Math.max(1, opts.durationSec)
  const fIn = 0.3 / dur, hold = 1.5 / dur, fOut = 0.5 / dur
  const active = fly.passes
    .map((pass, i) => ({ pass, i, since: p - pass.frac }))
    .filter((a) => a.since >= 0 && a.since <= fIn + hold + fOut)
    .sort((a, b) => b.since - a.since).slice(0, 2)
  for (const a of active) {
    const alpha = a.since < fIn ? a.since / fIn : a.since < fIn + hold ? 1 : Math.max(0, 1 - (a.since - fIn - hold) / fOut)
    const [x, y] = proj(a.pass.lat, a.pass.lng)
    const side = a.i % 2 === 0 ? 1 : -1
    labelColSign(ctx, w, x, y, side, a.pass.name, a.pass.altitude, alpha)
  }

  // leuchtender Fahrer-Punkt (ueber allem)
  ctx.globalAlpha = 1
  ctx.beginPath(); ctx.arc(driver[0], driver[1], w * 0.012, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,138,61,0.25)'; ctx.fill()
  ctx.beginPath(); ctx.arc(driver[0], driver[1], w * 0.007, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill()

  // km-Zaehler unten links
  ctx.fillStyle = SIGNAL; ctx.font = `700 ${Math.round(w * 0.03)}px ${MONO}`; ctx.textAlign = 'left'
  ctx.fillText(`${Math.round(opts.kmTotal * Math.min(1, p))} km`, w * 0.06, h * 0.93)

  // Tageszahlen am Ende
  if (p > 0.82) {
    ctx.globalAlpha = Math.min(1, (p - 0.82) / 0.14)
    ctx.textAlign = 'center'; ctx.fillStyle = GLACIER; ctx.font = `500 ${Math.round(w * 0.03)}px ${MONO}`
    ctx.fillText(`${opts.kmTotal} km · ${opts.passCount} Pässe`, w / 2, h * 0.12)
    ctx.textAlign = 'left'; ctx.globalAlpha = 1
  }
}

function labelColSign(ctx: CanvasRenderingContext2D, w: number, x: number, y: number, side: number, name: string, altitude: number, alpha: number) {
  ctx.globalAlpha = alpha
  const nameF = Math.round(w * 0.02), altF = Math.round(w * 0.026)
  ctx.font = `700 ${altF}px ${MONO}`
  const tw = Math.max(ctx.measureText(`${Math.round(altitude)} m`).width, (() => { ctx.font = `700 ${nameF}px ${DISP}`; return ctx.measureText(name.toUpperCase()).width })())
  const boxW = tw + w * 0.03, boxH = w * 0.075
  const gap = w * 0.05
  const bx = side > 0 ? x + gap : x - gap - boxW
  const by = y - boxH / 2
  ctx.strokeStyle = 'rgba(255,138,61,0.5)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx + (side > 0 ? 0 : boxW), y); ctx.stroke()
  ctx.fillStyle = 'rgba(29,26,22,0.92)'; roundRect(ctx, bx, by, boxW, boxH, w * 0.012); ctx.fill()
  ctx.strokeStyle = '#43351f'; ctx.lineWidth = 1.5; roundRect(ctx, bx, by, boxW, boxH, w * 0.012); ctx.stroke()
  ctx.textAlign = 'left'
  ctx.fillStyle = SIGNAL; ctx.font = `700 ${nameF}px ${DISP}`; ctx.fillText(name.toUpperCase(), bx + w * 0.015, by + boxH * 0.42)
  ctx.fillStyle = GLACIER; ctx.font = `700 ${altF}px ${MONO}`; ctx.fillText(`${Math.round(altitude)} m`, bx + w * 0.015, by + boxH * 0.82)
  ctx.globalAlpha = 1
}
