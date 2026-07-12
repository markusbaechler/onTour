import { trip } from '../data/trip'
import { collectPasses, type StageStats } from './passes'
import { dedupeKeep } from './phash'
import { snapSeconds } from './beats'
import type { ScoreEntry } from './photoScore'
import type { Aspect } from './cloudinaryCrop'
import type { Photo } from '../types'

export type KenBurns = 'in' | 'out' | 'l' | 'r'
export type SceneKind = 'intro' | 'chapter' | 'finale' | 'outro'
export interface Shot { photoId: string; seconds: number; caption: string; kenBurns: KenBurns }
export interface Scene { kind: SceneKind; title?: string; subtitle?: string; stats?: string; stageId?: string; titleSeconds?: number; shots: Shot[] }
export interface Storyboard { title: string; aspect: Aspect; scenes: Scene[]; musicName: string; bpm?: number; totalSeconds: number }

export interface TimelineItem {
  start: number; end: number
  kind: 'title' | 'photo'
  title?: string; subtitle?: string; stats?: string
  photo?: Photo; caption?: string; day?: number; stageId?: string; kenBurns?: KenBurns; overlayTitle?: boolean
}

const KB: KenBurns[] = ['in', 'out', 'l', 'r']
const stageOf = (photo: Photo | undefined) => trip.stages.find((s) => s.id === photo?.stageId)

/** Auto-Caption: eigene Caption > "T{day} · {from} → {to}". */
export function autoCaption(photo: Photo): string {
  const c = photo.caption?.trim()
  if (c) return c
  const st = stageOf(photo)
  return st ? `T${st.day} · ${st.from} → ${st.to}` : ''
}

/** Fotos je Etappe nach Score sortiert (Gleichstand chronologisch → gleichmaessig verteilt). */
export function rankStages(photos: Photo[], scores: Map<string, ScoreEntry>): Record<string, Photo[]> {
  const out: Record<string, Photo[]> = {}
  for (const s of trip.stages) {
    const list = photos.filter((p) => p.stageId === s.id)
    list.sort((a, b) => (scores.get(b.id)?.total ?? 0) - (scores.get(a.id)?.total ?? 0) || a.createdAt.localeCompare(b.createdAt))
    if (list.length) out[s.id] = list
  }
  return out
}

/** Vorschlags-Auswahl je Etappe: Top-N nach Dedup (nahe Duplikate raus). */
export function defaultSelection(photos: Photo[], scores: Map<string, ScoreEntry>, perStageMax = 3): Record<string, string[]> {
  const ranked = rankStages(photos, scores)
  const hashed = photos.filter((p) => scores.has(p.id)).map((p) => ({ id: p.id, hash: scores.get(p.id)!.hash, score: scores.get(p.id)!.total }))
  const keep = dedupeKeep(hashed, 8)
  const out: Record<string, string[]> = {}
  for (const [sid, list] of Object.entries(ranked)) {
    const kept = list.filter((p) => keep.has(p.id))
    out[sid] = (kept.length ? kept : list).slice(0, perStageMax).map((p) => p.id)
  }
  return out
}

interface GenOpts {
  photos: Photo[]
  stats: Record<string, StageStats>
  scores: Map<string, ScoreEntry>
  selection: Record<string, Array<{ photoId: string; caption: string }>>
  secPerShot?: number
  aspect?: Aspect
  musicName: string
  bpm?: number
}

/** Baut aus Tour-Metadaten + (evtl. editierter) Auswahl das Storyboard – deterministisch. */
export function generateStoryboard(scope: 'all' | string, opts: GenOpts): Storyboard {
  const { photos, stats, scores, selection, musicName, bpm } = opts
  const aspect: Aspect = opts.aspect ?? '9:16'
  const shotSec = snapSeconds(opts.secPerShot ?? 2.6, bpm)
  const titleSec = snapSeconds(2.4, bpm)
  const byId = new Map(photos.map((p) => [p.id, p]))
  const stages = scope === 'all' ? trip.stages : trip.stages.filter((s) => s.id === scope)
  const scopePhotos = photos.filter((p) => stages.some((s) => s.id === p.stageId))
  let kb = 0
  const nextKb = (): KenBurns => KB[kb++ % KB.length]

  const scenes: Scene[] = []

  // Intro über bestem Hero
  const ranked = [...scopePhotos].sort((a, b) => (scores.get(b.id)?.total ?? 0) - (scores.get(a.id)?.total ?? 0))
  const hero = ranked[0]
  if (hero) scenes.push({ kind: 'intro', title: trip.title, subtitle: trip.subtitle, titleSeconds: Math.max(shotSec, snapSeconds(3, bpm)), shots: [{ photoId: hero.id, seconds: Math.max(shotSec, snapSeconds(3, bpm)), caption: '', kenBurns: 'in' }] })

  // Kapitel je Etappe mit Auswahl
  for (const s of stages) {
    const sel = selection[s.id]
    if (!sel || sel.length === 0) continue
    const km = stats[s.id]?.km ?? s.plannedKm
    const passes = stats[s.id]?.passes.length ?? s.cols.length
    scenes.push({
      kind: 'chapter', title: `T${s.day}`, subtitle: `${s.from} → ${s.to}`, stats: `${km} km · ${passes} Pässe`, stageId: s.id, titleSeconds: titleSec,
      shots: sel.filter((x) => byId.has(x.photoId)).map((x) => ({ photoId: x.photoId, seconds: shotSec, caption: x.caption, kenBurns: nextKb() })),
    })
  }

  // Finale (nur ganze Tour): Zahlen + Best-of
  if (scope === 'all') {
    const totalKm = trip.stages.reduce((a, s) => a + (stats[s.id]?.km ?? s.plannedKm), 0)
    const all = collectPasses(stats)
    const top = all.reduce<{ name: string; altitude: number }>((m, p) => (p.altitude > m.altitude ? p : m), { name: '—', altitude: 0 })
    const bestOf = ranked.slice(0, 4)
    scenes.push({
      kind: 'finale', title: 'Die Tour in Zahlen', stats: `${totalKm} km · ${all.length} Pässe · höchster: ${top.name} ${Math.round(top.altitude)} m`, titleSeconds: snapSeconds(3, bpm),
      shots: bestOf.map((p) => ({ photoId: p.id, seconds: shotSec, caption: autoCaption(p), kenBurns: nextKb() })),
    })
  }

  // Outro
  scenes.push({ kind: 'outro', title: 'Merci!', subtitle: trip.riders.join(' · '), titleSeconds: titleSec, shots: [] })

  const totalSeconds = scenes.reduce((a, sc) => a + sceneSeconds(sc), 0)
  return { title: trip.title, aspect, scenes, musicName, bpm, totalSeconds }
}

function sceneSeconds(sc: Scene): number {
  if (sc.kind === 'intro') return sc.shots.reduce((a, s) => a + s.seconds, 0) || (sc.titleSeconds ?? 0)
  const head = sc.kind === 'chapter' || sc.kind === 'finale' || sc.kind === 'outro' ? (sc.titleSeconds ?? 0) : 0
  return head + sc.shots.reduce((a, s) => a + s.seconds, 0)
}

/** Storyboard zu einer flachen, getimten Item-Liste (fuer Vorschau, SRT, Export). */
export function flatten(sb: Storyboard, photos: Photo[]): TimelineItem[] {
  const byId = new Map(photos.map((p) => [p.id, p]))
  const dayOf = (id: string) => stageOf(byId.get(id))?.day
  const items: TimelineItem[] = []
  let t = 0
  const push = (dur: number, part: Omit<TimelineItem, 'start' | 'end'>) => { items.push({ start: t, end: t + dur, ...part }); t += dur }

  for (const sc of sb.scenes) {
    if (sc.kind === 'intro') {
      const shot = sc.shots[0]
      if (shot) push(shot.seconds, { kind: 'photo', photo: byId.get(shot.photoId), title: sc.title, subtitle: sc.subtitle, overlayTitle: true, kenBurns: shot.kenBurns })
      else push(sc.titleSeconds ?? 2.4, { kind: 'title', title: sc.title, subtitle: sc.subtitle })
    } else if (sc.kind === 'outro') {
      push(sc.titleSeconds ?? 2.4, { kind: 'title', title: sc.title, subtitle: sc.subtitle })
    } else {
      push(sc.titleSeconds ?? 2.4, { kind: 'title', title: sc.title, subtitle: sc.subtitle, stats: sc.stats, stageId: sc.stageId })
      for (const shot of sc.shots) {
        const p = byId.get(shot.photoId)
        if (!p) continue
        push(shot.seconds, { kind: 'photo', photo: p, caption: shot.caption, day: dayOf(shot.photoId), stageId: p.stageId, kenBurns: shot.kenBurns })
      }
    }
  }
  return items
}
