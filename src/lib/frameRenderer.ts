import { trip } from '../data/trip'
import { flatten, type KenBurns, type Storyboard } from './storyboard'
import { smartCropUrl } from './cloudinaryCrop'
import { renderCaptionPng, renderTitleCardPng } from './overlays'
import { buildFlyover, drawFlyoverFrame, type Flyover } from './flyover'
import type { StageStats } from './passes'
import type { Photo } from '../types'

// Zeichnet die Bildspur auf einem Canvas (Ken-Burns, Crossfade, Titelkarten, Caption-Overlays,
// animierter Karten-Flyover). Zweistufig, damit render.ts in Chunks encodieren kann:
//  buildTimeline() laedt einmalig alle Layer-Assets; renderRange() rendert einen Frame-Bereich.

const CROSS = 0.4
const ROUTE_SECONDS = 6.5 // Dauer der animierten Flyover-Kapitelszene
const INK = '#0E0D11'

export interface BuildJob {
  storyboard: Storyboard; photos: Photo[]; stats: Record<string, StageStats>
  w: number; h: number; fps: number; maxSeconds: number; control?: { cancelled: boolean }
}
export interface Timeline {
  layers: Layer[]; durationSec: number; totalFrames: number; fps: number; w: number; h: number
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D
}

interface PlanItem {
  kind: 'photo' | 'card' | 'route'; seconds: number; kb: KenBurns
  photo?: Photo; caption?: string; day?: number; overlayTitle?: boolean
  title?: string; subtitle?: string; stats?: string; stageId?: string
}
interface Layer {
  start: number; end: number; kind: 'photo' | 'card' | 'flyover'; kb: KenBurns
  base?: HTMLImageElement; overlay?: HTMLImageElement
  fly?: { fly: Flyover; kmTotal: number; passCount: number }
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('image')); img.src = url })
}
async function blobToImg(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try { return await loadImg(url) } finally { setTimeout(() => URL.revokeObjectURL(url), 0) }
}

function buildPlan(sb: Storyboard, photos: Photo[]): PlanItem[] {
  const plan: PlanItem[] = []
  for (const it of flatten(sb, photos)) {
    const seconds = Math.max(0.6, it.end - it.start)
    if (it.kind === 'photo' && it.photo) plan.push({ kind: 'photo', seconds, kb: it.kenBurns ?? 'in', photo: it.photo, caption: it.caption, day: it.day, overlayTitle: it.overlayTitle, title: it.title, subtitle: it.subtitle })
    else if (it.kind === 'title') {
      plan.push({ kind: 'card', seconds, kb: 'in', title: it.title, subtitle: it.subtitle, stats: it.stats })
      if (it.stageId) plan.push({ kind: 'route', seconds: ROUTE_SECONDS, kb: 'in', stageId: it.stageId })
    }
  }
  return plan
}

function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, kb: KenBurns, p: number) {
  const ir = img.width / img.height, cr = w / h
  let bw: number, bh: number
  if (ir > cr) { bh = h; bw = h * ir } else { bw = w; bh = w / ir }
  let zoom = 1.0, panx = 0
  if (kb === 'in') zoom = 1.0 + 0.08 * p
  else if (kb === 'out') zoom = 1.08 - 0.08 * p
  else { zoom = 1.06; panx = (kb === 'l' ? 1 : -1) * 0.04 * w * (0.5 - p) * 2 }
  const dw = bw * zoom, dh = bh * zoom
  ctx.drawImage(img, (w - dw) / 2 + panx, (h - dh) / 2, dw, dh)
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, p: number, alpha: number) {
  ctx.globalAlpha = alpha
  if (layer.kind === 'flyover' && layer.fly) {
    try { drawFlyoverFrame(ctx, w, h, layer.fly.fly, Math.max(0, Math.min(1, p)), { durationSec: layer.end - layer.start, kmTotal: layer.fly.kmTotal, passCount: layer.fly.passCount }) }
    catch { ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h) }
  } else if (layer.base) {
    drawKenBurns(ctx, layer.base, w, h, layer.kb, Math.max(0, Math.min(1, p)))
    if (layer.overlay) ctx.drawImage(layer.overlay, 0, 0, w, h)
  }
  ctx.globalAlpha = 1
}

/** Alle Layer-Assets laden (Bilder, Flyover-Projektion), Timing berechnen, auf maxSeconds kappen. */
export async function buildTimeline(job: BuildJob): Promise<Timeline> {
  const { w, h, fps } = job
  const plan = buildPlan(job.storyboard, job.photos)
  const layers: Layer[] = []
  let t = 0
  for (const p of plan) {
    if (job.control?.cancelled) throw new Error('cancelled')
    if (t >= job.maxSeconds) break
    const seconds = Math.min(p.seconds, job.maxSeconds - t)
    try {
      if (p.kind === 'photo' && p.photo) {
        let base: HTMLImageElement
        try { base = await loadImg(smartCropUrl(p.photo.url, w, h)) }
        catch { base = await blobToImg(await renderTitleCardPng(w, h, { title: p.caption ?? '', subtitle: p.day ? `T${p.day}` : '' })) }
        const overlay = p.overlayTitle
          ? await blobToImg(await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, overlay: true }))
          : await blobToImg(await renderCaptionPng(w, h, { day: p.day, caption: p.caption, author: p.photo.author }))
        layers.push({ start: t, end: t + seconds, kind: 'photo', base, overlay, kb: p.kb })
      } else if (p.kind === 'card') {
        layers.push({ start: t, end: t + seconds, kind: 'card', base: await blobToImg(await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, stats: p.stats })), kb: p.kb })
      } else if (p.kind === 'route' && p.stageId) {
        const stage = trip.stages.find((s) => s.id === p.stageId)
        const track = stage?.track ?? []
        const stats = job.stats[p.stageId]
        const passes = stats?.passes ?? []
        if (track.length < 2) continue
        const fly = buildFlyover(track, passes.map((x) => ({ lat: x.lat, lng: x.lng, name: x.name, altitude: x.altitude, distFromStart: x.distFromStart })), (stats?.km ?? 0) * 1000)
        layers.push({ start: t, end: t + seconds, kind: 'flyover', kb: p.kb, fly: { fly, kmTotal: stats?.km ?? 0, passCount: passes.length } })
      } else continue
      t += seconds
    } catch { /* Layer nicht baubar -> ueberspringen */ }
  }
  if (!layers.length) throw new Error('Keine Bilder für den Render.')
  const durationSec = layers[layers.length - 1].end
  const totalFrames = Math.max(1, Math.round(durationSec * fps))
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar.')
  return { layers, durationSec, totalFrames, fps, w, h, canvas, ctx }
}

/** Rendert Frames [fromFrame, toFrame) und schreibt sie (lokal 1-basiert benannt) via writeFrame. */
export async function renderRange(tl: Timeline, fromFrame: number, toFrame: number, writeFrame: (name: string, blob: Blob) => Promise<void>, onFrame: (globalIndex: number) => void, control?: { cancelled: boolean }): Promise<void> {
  const { ctx, w, h, fps, layers, canvas } = tl
  const toBlob = (): Promise<Blob> => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.8))
  let li = 0
  for (let f = fromFrame; f < toFrame; f++) {
    if (control?.cancelled) throw new Error('cancelled')
    const t = f / fps
    while (li < layers.length - 1 && t >= layers[li].end) li++
    const layer = layers[li]
    ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h)
    const p = (t - layer.start) / Math.max(0.001, layer.end - layer.start)
    drawLayer(ctx, layer, w, h, p, 1)
    const toEnd = layer.end - t
    if (li + 1 < layers.length && toEnd < CROSS) drawLayer(ctx, layers[li + 1], w, h, 0, 1 - toEnd / CROSS)
    await writeFrame(`frame_${String(f - fromFrame + 1).padStart(5, '0')}.jpg`, await toBlob())
    onFrame(f)
  }
}
