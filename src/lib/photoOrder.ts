import { trip } from '../data/trip'
import type { Photo } from '../types'

const dayOf = (p: Photo) => trip.stages.find((s) => s.id === p.stageId)?.day ?? 99
const timeKey = (p: Photo) => p.takenAt ?? p.createdAt

/**
 * KANONISCHE Foto-Sortierung – ueberall verwenden (Fotobuch, Diashow, Video/Storyboard).
 * Reihenfolge: Etappentag, dann orderKey (falls gesetzt) > takenAt (EXIF) > createdAt (Upload).
 */
export function sortPhotos(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) =>
    (dayOf(a) - dayOf(b)) ||
    ((a.orderKey ?? Number.POSITIVE_INFINITY) - (b.orderKey ?? Number.POSITIVE_INFINITY)) ||
    timeKey(a).localeCompare(timeKey(b)))
}
