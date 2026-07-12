import { trip } from '../data/trip'
import type { StageStats } from './passes'
import type { LatLng, Photo } from '../types'

// Intelligente Etappen-Zuordnung anhand EXIF (Aufnahmedatum + GPS). NUR Vorschlaege –
// das Uebernehmen passiert im Review. Fetcht das ORIGINALbild (photo.url, unveraendert),
// da verkleinernde Transformationen EXIF strippen koennen.

export type AssignReason = 'gps' | 'date'
export interface PhotoAnalysis {
  photoId: string; currentStageId: string
  takenAt?: string; takenLabel?: string // EXIF-Aufnahmezeit, nur wenn neu/abweichend (Backfill)
  suggestion?: { stageId: string; reason: AssignReason; evidence: string } // nur wenn Etappe wechselt
}
export interface AnalyzeResult { results: PhotoAnalysis[]; unbestimmt: number; analyzed: number }

const MAX_GPS_KM = 15
const pad2 = (n: number) => String(n).padStart(2, '0')

function projectXY(lat: number, lng: number, lat0: number): [number, number] {
  return [lng * 111.32 * Math.cos((lat0 * Math.PI) / 180), lat * 110.574] // km
}
function segDistKm(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function pointToTrackKm(lat: number, lng: number, track: LatLng[]): number {
  if (track.length < 2) return Infinity
  const [px, py] = projectXY(lat, lng, lat)
  let min = Infinity, prev = projectXY(track[0][0], track[0][1], lat)
  for (let i = 1; i < track.length; i++) {
    const cur = projectXY(track[i][0], track[i][1], lat)
    const d = segDistKm(px, py, prev[0], prev[1], cur[0], cur[1])
    if (d < min) min = d
    prev = cur
  }
  return min
}
function simplify(track: LatLng[], max = 200): LatLng[] {
  if (track.length <= max) return track
  const step = track.length / max, out: LatLng[] = []
  for (let i = 0; i < track.length; i += step) out.push(track[Math.floor(i)])
  out.push(track[track.length - 1])
  return out
}

/** EXIF-Datum -> Etappe. Aufnahmen 00:00–04:00 zaehlen zum Vortag. Ausserhalb der Tour: null. */
function dateStage(d: Date): { stageId: string; day: number } | null {
  const start = new Date(trip.startDate); start.setHours(0, 0, 0, 0)
  const day = new Date(d)
  const early = day.getHours() < 4
  day.setHours(0, 0, 0, 0)
  if (early) day.setDate(day.getDate() - 1)
  const idx = Math.round((day.getTime() - start.getTime()) / 86_400_000)
  if (idx < 0 || idx >= trip.stages.length) return null
  const s = trip.stages[idx]
  return { stageId: s.id, day: s.day }
}

export async function analyzeAssignments(
  photos: Photo[],
  _stats: Record<string, StageStats>,
  planTracks: Record<string, LatLng[]> = {},
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<AnalyzeResult> {
  const { parse } = await import('exifr')
  const stageTracks = trip.stages.map((s) => ({ id: s.id, day: s.day, track: simplify(planTracks[s.id]?.length ? planTracks[s.id] : (s.track ?? [s.start, s.end])) }))

  const results: PhotoAnalysis[] = []
  let unbestimmt = 0
  const tick = (i: number) => { if ((i + 1) % 6 === 0 || i === photos.length - 1) { opts.onProgress?.(i + 1, photos.length); return new Promise((r) => setTimeout(r, 0)) } return Promise.resolve() }

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    let lat: number | undefined, lng: number | undefined, date: Date | undefined
    try {
      const ex = await parse(p.url, { tiff: true, exif: true, gps: true })
      if (ex) { lat = ex.latitude; lng = ex.longitude; date = ex.DateTimeOriginal instanceof Date ? ex.DateTimeOriginal : undefined }
    } catch { /* CORS / kein EXIF */ }
    if ((lat == null || lng == null) && p.lat != null && p.lng != null) { lat = p.lat; lng = p.lng }
    const hasGps = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)

    if (!hasGps && !date) { unbestimmt++; await tick(i); continue }

    // takenAt-Backfill: nur wenn EXIF-Datum vorhanden UND anders als gespeichert.
    let takenAt: string | undefined, takenLabel: string | undefined
    if (date) {
      const iso = date.toISOString()
      if (iso !== p.takenAt) { takenAt = iso; takenLabel = `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}. ${pad2(date.getHours())}:${pad2(date.getMinutes())}` }
    }

    // Vorschlag (GPS schlaegt Datum)
    let gps: { stageId: string; day: number; evidence: string } | null = null
    if (hasGps) {
      let best = Infinity, bestStage: { id: string; day: number } | null = null
      for (const st of stageTracks) { const d = pointToTrackKm(lat!, lng!, st.track); if (d < best) { best = d; bestStage = st } }
      if (bestStage && best <= MAX_GPS_KM) gps = { stageId: bestStage.id, day: bestStage.day, evidence: `GPS ${best.toFixed(1)} km an T${bestStage.day}-Route` }
    }
    let dt: { stageId: string; day: number; evidence: string } | null = null
    if (date) { const ds = dateStage(date); if (ds) dt = { stageId: ds.stageId, day: ds.day, evidence: `aufgenommen ${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}. = T${ds.day}` } }
    const chosen = gps ?? dt
    let suggestion: PhotoAnalysis['suggestion']
    if (chosen && chosen.stageId !== p.stageId) suggestion = { stageId: chosen.stageId, reason: gps ? 'gps' : 'date', evidence: chosen.evidence }

    if (takenAt || suggestion) results.push({ photoId: p.id, currentStageId: p.stageId, takenAt, takenLabel, suggestion })
    await tick(i)
  }
  return { results, unbestimmt, analyzed: photos.length }
}

/** Etappentag zu stageId (fuer Labels in der Review-UI). */
export function stageDayOf(stageId: string): number | undefined {
  return trip.stages.find((s) => s.id === stageId)?.day
}
