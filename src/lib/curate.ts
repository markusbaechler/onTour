import { trip } from '../data/trip'
import { dedupeKeep } from './phash'
import type { ScoreEntry } from './photoScore'
import type { Photo } from '../types'

interface CurateOptions { perStageMax?: number; targetSeconds?: number }

const SECONDS_PER_PHOTO = 2.2 // grobe Schaetzung fuer die Zeitbudget-Begrenzung

/**
 * Waehlt die besten Fotos je Etappe aus (nach Score), entfernt nahe Duplikate, sorgt dass
 * JEDE Etappe mit Fotos vertreten ist und begrenzt grob auf die Zielzeit. Ergebnis:
 * Fotos gruppiert nach Etappe (chronologisch), Etappen in Tour-Reihenfolge.
 */
export function curate(scored: Map<string, ScoreEntry>, photos: Photo[], opts: CurateOptions = {}): Photo[][] {
  const perStageMax = opts.perStageMax ?? 3
  const scoreOf = (p: Photo) => scored.get(p.id)?.total ?? 0

  // Duplikate global entfernen (Cluster-Bestes bleibt).
  const hashed = photos.filter((p) => scored.has(p.id)).map((p) => ({ id: p.id, hash: scored.get(p.id)!.hash, score: scored.get(p.id)!.total }))
  const keep = dedupeKeep(hashed, 8)

  let curated = trip.stages
    .map((s) => photos.filter((p) => p.stageId === s.id && keep.has(p.id)))
    .map((g) => {
      const topIds = new Set([...g].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, perStageMax).map((p) => p.id))
      return g.filter((p) => topIds.has(p.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
    .filter((g) => g.length > 0)

  if (opts.targetSeconds && opts.targetSeconds > 0) {
    const budget = Math.max(curated.length, Math.floor(opts.targetSeconds / SECONDS_PER_PHOTO))
    const total = () => curated.reduce((a, g) => a + g.length, 0)
    // Immer das global schwaechste Foto aus einer Etappe mit >1 Bildern entfernen.
    while (total() > budget) {
      let gi = -1, pi = -1, worst = Infinity
      curated.forEach((g, i) => { if (g.length <= 1) return; g.forEach((p, j) => { const sc = scoreOf(p); if (sc < worst) { worst = sc; gi = i; pi = j } }) })
      if (gi < 0) break
      curated[gi].splice(pi, 1)
    }
    curated = curated.filter((g) => g.length > 0)
  }

  return curated
}
