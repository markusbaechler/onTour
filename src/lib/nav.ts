import type { Cue, CueType, LatLng } from '../types'
import { fetchGpxTrack } from './gpx'

const R = 6_371_000 // Erdradius in Metern
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const la1 = rad(a[0])
  const la2 = rad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Kompass-Kurs von a nach b in Grad (0 = Nord, im Uhrzeigersinn). */
export function bearing(a: LatLng, b: LatLng): number {
  const la1 = rad(a[0])
  const la2 = rad(b[0])
  const dLng = rad(b[1] - a[1])
  const y = Math.sin(dLng) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Kumulierte Distanz (Meter ab Start) je Trackpunkt. */
export function cumulative(track: LatLng[]): number[] {
  const out = [0]
  for (let i = 1; i < track.length; i++) out.push(out[i - 1] + distanceM(track[i - 1], track[i]))
  return out
}

export interface Projection {
  point: LatLng // Fusspunkt auf der Route
  segment: number // Index des Startpunkts des naechsten Segments
  distAlong: number // Meter ab Start entlang der Route
  offRouteM: number // Abstand des GPS-Punkts zur Route in Metern
}

/** Projiziert eine Position auf die Polyline (naechstes Segment, Distanz entlang, Abweichung). */
export function projectOnTrack(pos: LatLng, track: LatLng[], cum: number[]): Projection {
  let best: Projection = { point: track[0] ?? pos, segment: 0, distAlong: 0, offRouteM: Infinity }
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]
    const b = track[i + 1]
    // lokale equirektangulaere Projektion (Meter), genuegt fuer kurze Segmente
    const ax = 0, ay = 0
    const bx = (b[1] - a[1]) * Math.cos(rad(a[0])) * (Math.PI / 180) * R
    const by = (b[0] - a[0]) * (Math.PI / 180) * R
    const px = (pos[1] - a[1]) * Math.cos(rad(a[0])) * (Math.PI / 180) * R
    const py = (pos[0] - a[0]) * (Math.PI / 180) * R
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    let t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const fx = ax + t * dx, fy = ay + t * dy
    const off = Math.hypot(px - fx, py - fy)
    if (off < best.offRouteM) {
      const foot: LatLng = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      best = { point: foot, segment: i, distAlong: cum[i] + distanceM(a, foot), offRouteM: off }
    }
  }
  return best
}

const fmtNum = new Intl.NumberFormat('de-CH')

/** Distanz fuer den Countdown: "300 m" / "1,2 km". */
export function navDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${fmtNum.format(Math.round(m / 100) / 10)} km`
}

const TYPE_TEXT: Record<CueType, string> = {
  depart: 'Start', arrive: 'Ziel erreicht',
  left: 'Links abbiegen', right: 'Rechts abbiegen',
  'slight-left': 'Leicht links', 'slight-right': 'Leicht rechts',
  'sharp-left': 'Scharf links', 'sharp-right': 'Scharf rechts',
  straight: 'Geradeaus', uturn: 'Wenden',
  'keep-left': 'Links halten', 'keep-right': 'Rechts halten',
  roundabout: 'Im Kreisel',
}

export function cueText(c: Cue): string {
  if (c.type === 'roundabout' && c.exit) return `${c.exit}. Ausfahrt`
  return c.text || TYPE_TEXT[c.type]
}

/** Manoever-Typ aus dem Richtungswechsel (Grad, + = rechts) ableiten. */
function typeFromTurn(turn: number): CueType {
  const a = Math.abs(turn)
  if (a < 18) return 'straight'
  if (a > 150) return 'uturn'
  if (turn > 0) return a < 45 ? 'slight-right' : a > 110 ? 'sharp-right' : 'right'
  return a < 45 ? 'slight-left' : a > 110 ? 'sharp-left' : 'left'
}

/**
 * Heuristische Cues direkt aus der Track-Geometrie (Demo-Fallback ohne Valhalla):
 * an jedem Knick mit relevantem Richtungswechsel ein Cue. Grob, aber lauffaehig.
 */
export function deriveCues(track: LatLng[]): Cue[] {
  if (track.length < 2) return []
  const cum = cumulative(track)
  const cues: Cue[] = [{ at: track[0], type: 'depart', text: TYPE_TEXT.depart, distFromStart: 0 }]
  // grob ausduennen, damit GPS-Rauschen keine Scheinabbiegungen erzeugt
  const minStep = 60 // Meter
  let last = 0
  const idx: number[] = [0]
  for (let i = 1; i < track.length; i++) {
    if (cum[i] - cum[last] >= minStep) { idx.push(i); last = i }
  }
  if (idx[idx.length - 1] !== track.length - 1) idx.push(track.length - 1)
  for (let k = 1; k < idx.length - 1; k++) {
    const prev = track[idx[k - 1]]
    const here = track[idx[k]]
    const next = track[idx[k + 1]]
    let turn = bearing(here, next) - bearing(prev, here)
    if (turn > 180) turn -= 360
    if (turn < -180) turn += 360
    const type = typeFromTurn(turn)
    if (type === 'straight') continue
    cues.push({ at: here, type, text: TYPE_TEXT[type], distFromStart: Math.round(cum[idx[k]]) })
  }
  cues.push({ at: track[track.length - 1], type: 'arrive', text: TYPE_TEXT.arrive, distFromStart: Math.round(cum[cum.length - 1]) })
  return cues
}

/**
 * Laedt das vorberechnete Cue Sheet (t{N}.cues.json). Fehlt es (Demo / noch keine
 * Valhalla-Pipeline gelaufen), werden Cues heuristisch aus dem GPX abgeleitet.
 */
export async function loadCues(base: string, day: number, gpxUrl?: string): Promise<{ cues: Cue[]; track: LatLng[]; source: 'precomputed' | 'heuristic' }> {
  const track = gpxUrl ? await fetchGpxTrack(`${base}${gpxUrl}`) : []
  try {
    const res = await fetch(`${base}roadbooks/t${day}.cues.json`)
    if (res.ok) {
      const cues = (await res.json()) as Cue[]
      if (Array.isArray(cues) && cues.length) return { cues, track, source: 'precomputed' }
    }
  } catch {
    /* fällt unten auf Heuristik zurück */
  }
  return { cues: deriveCues(track), track, source: 'heuristic' }
}
