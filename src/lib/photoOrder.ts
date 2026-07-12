import { trip } from '../data/trip'
import type { Photo } from '../types'

const dayOf = (p: Photo) => trip.stages.find((s) => s.id === p.stageId)?.day ?? 99
const timeMs = (p: Photo) => { const t = Date.parse(p.takenAt ?? p.createdAt); return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t }

/**
 * KANONISCHE Foto-Sortierung – ueberall verwenden (Fotobuch, Diashow, Video/Storyboard).
 * Erst nach Etappentag gruppieren, dann INNERHALB der Etappe typsicher ordnen:
 *   - haben ALLE Fotos einen orderKey (manuell fixiert)  -> rein numerisch nach orderKey
 *   - sonst                                              -> orderKey ignorieren, nach Zeit
 *     (takenAt ?? createdAt, als ms; ungueltige Daten ans Ende)
 * Nie number (orderKey) gegen string (ISO) vergleichen -> kein "springt nach oben"-Bug.
 */
export function sortPhotos(photos: Photo[]): Photo[] {
  const byDay = new Map<number, Photo[]>()
  for (const p of photos) {
    const d = dayOf(p)
    const list = byDay.get(d); if (list) list.push(p); else byDay.set(d, [p])
  }
  const out: Photo[] = []
  for (const d of [...byDay.keys()].sort((a, b) => a - b)) out.push(...orderWithinStage(byDay.get(d)!))
  return out
}

/** Ordnung innerhalb EINER Etappe – siehe sortPhotos. Immer gleiche Wertetypen im Vergleich. */
function orderWithinStage(list: Photo[]): Photo[] {
  const allKeyed = list.every((p) => p.orderKey != null)
  if (allKeyed) return [...list].sort((a, b) => (a.orderKey! - b.orderKey!))
  return [...list].sort((a, b) => timeMs(a) - timeMs(b))
}
