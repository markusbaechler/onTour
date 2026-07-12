import { trip } from '../data/trip'
import { flatten, type KenBurns, type Storyboard } from './storyboard'
import { smartCropUrl } from './cloudinaryCrop'
import { renderCaptionPng, renderRoutePng, renderTitleCardPng } from './overlays'
import type { StageStats } from './passes'
import type { Photo } from '../types'

// Erzeugt die komplette Bildspur als JPEG-Frame-Sequenz auf einem Canvas (Ken-Burns,
// Crossfade, Titelkarten, Caption-/Routen-Overlays) und schreibt jeden Frame SOFORT ins
// ffmpeg-FS – kein Halten aller Frames im RAM. ffmpeg encodiert danach nur noch.

const CROSS = 0.4
const ROUTE_SECONDS = 2.6

export interface FrameJob {
  storyboard: Storyboard
  photos: Photo[]
  stats: Record<string, StageStats>
  w: number; h: number; fps: number; maxSeconds: number
  writeFrame: (name: string, blob: Blob) => Promise<void>
  onProgress: (done: number, total: number) => void
  control?: { cancelled: boolean }
}
export interface FrameResult { frameCount: number; durationSec: number; fps: number }

interface PlanItem {
  kind: 'photo' | 'card' | 'route'; seconds: number; kb: KenBurns
  photo?: Photo; caption?: string; day?: number; overlayTitle?: boolean
  title?: string; subtitle?: string; stats?: string; stageId?: string; label?: string
}
interface Layer { start: number; end: number; base: HTMLImageElement; isPhoto: boolean; overlay?: HTMLImageElement; kb: KenBurns }

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
      if (it.stageId) plan.push({ kind: 'route', seconds: ROUTE_SECONDS, kb: 'in', stageId: it.stageId, label: [it.title, it.subtitle].filter(Boolean).join(' · ') })
    }
  }
  return plan
}

async function toLayers(job: FrameJob, plan: PlanItem[]): Promise<Layer[]> {
  const { w, h } = job
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
        catch { base = await blobToImg(await renderTitleCardPng(w, h, { title: p.caption ?? '', subtitle: `T${p.day ?? ''}` })) }
        const overlay = p.overlayTitle
          ? await blobToImg(await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, overlay: true }))
          : await blobToImg(await renderCaptionPng(w, h, { day: p.day, caption: p.caption, author: p.photo.author }))
        layers.push({ start: t, end: t + seconds, base, isPhoto: true, overlay, kb: p.kb })
      } else if (p.kind === 'card') {
        layers.push({ start: t, end: t + seconds, base: await blobToImg(await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, stats: p.stats })), isPhoto: false, kb: p.kb })
      } else if (p.kind === 'route' && p.stageId) {
        const stage = trip.stages.find((s) => s.id === p.stageId)
        const track = stage?.track ?? []
        const passes = (job.stats[p.stageId]?.passes ?? []).map((x) => ({ lat: x.lat, lng: x.lng, name: x.name, altitude: x.altitude }))
        layers.push({ start: t, end: t + seconds, base: await blobToImg(await renderRoutePng(w, h, track, passes, p.label)), isPhoto: false, kb: p.kb })
      } else continue
      t += seconds
    } catch { /* Layer nicht baubar -> ueberspringen */ }
  }
  return layers
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
  drawKenBurns(ctx, layer.base, w, h, layer.kb, Math.max(0, Math.min(1, p)))
  if (layer.overlay) ctx.drawImage(layer.overlay, 0, 0, w, h)
  ctx.globalAlpha = 1
}

/** Rendert alle Frames und schreibt sie via job.writeFrame ins ffmpeg-FS. */
export async function renderFrames(job: FrameJob): Promise<FrameResult> {
  const { w, h, fps } = job
  const plan = buildPlan(job.storyboard, job.photos)
  const layers = await toLayers(job, plan)
  if (!layers.length) throw new Error('Keine Bilder für den Render.')
  const duration = layers[layers.length - 1].end
  const totalFrames = Math.max(1, Math.round(duration * fps))

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar.')
  const toBlob = (): Promise<Blob> => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.8))

  let li = 0
  for (let f = 0; f < totalFrames; f++) {
    if (job.control?.cancelled) throw new Error('cancelled')
    const t = f / fps
    while (li < layers.length - 1 && t >= layers[li].end) li++
    const layer = layers[li]
    ctx.fillStyle = '#0E0D11'; ctx.fillRect(0, 0, w, h)
    const p = (t - layer.start) / Math.max(0.001, layer.end - layer.start)
    drawLayer(ctx, layer, w, h, p, 1)
    // Crossfade in die naechste Ebene
    const toEnd = layer.end - t
    if (li + 1 < layers.length && toEnd < CROSS) drawLayer(ctx, layers[li + 1], w, h, 0, 1 - toEnd / CROSS)
    const name = `frame_${String(f + 1).padStart(5, '0')}.jpg`
    await job.writeFrame(name, await toBlob())
    if (f % 4 === 0 || f === totalFrames - 1) job.onProgress(f + 1, totalFrames)
  }
  return { frameCount: totalFrames, durationSec: duration, fps }
}
