import type { Comment, Photo, Reaction } from '../types'
import { aHash } from './phash'

export interface ScoreParts { engagement: number; sharpness: number; exposure: number; colorfulness: number }
export interface ScoreEntry { total: number; parts: ScoreParts; hash: bigint }
export interface ScoreOptions { onProgress?: (done: number, total: number) => void }

// Engagement ist das Hauptsignal; die Pixel-Heuristiken tragen, wenn (noch) keine
// Reaktionen da sind.
const W = { engagement: 0.55, sharpness: 0.20, exposure: 0.15, colorfulness: 0.10 }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('img'))
    img.src = url
  })
}

function drawSmall(img: HTMLImageElement, canvas: HTMLCanvasElement): ImageData | null {
  const max = 256
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

function laplacianVar(d: Uint8ClampedArray, w: number, h: number): number {
  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]
  let mean = 0, n = 0
  const lap = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; lap[i] = -4 * g[i] + g[i - 1] + g[i + 1] + g[i - w] + g[i + w]; mean += lap[i]; n++ }
  if (n === 0) return 0
  mean /= n
  let v = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const dd = lap[y * w + x] - mean; v += dd * dd }
  return v / n
}

function colorfulness(d: Uint8ClampedArray): number {
  const rg: number[] = [], yb: number[] = []
  let mrg = 0, myb = 0, n = 0
  for (let p = 0; p < d.length; p += 4) { const a = d[p] - d[p + 1]; const c = 0.5 * (d[p] + d[p + 1]) - d[p + 2]; rg.push(a); yb.push(c); mrg += a; myb += c; n++ }
  if (n === 0) return 0
  mrg /= n; myb /= n
  let vrg = 0, vyb = 0
  for (let i = 0; i < n; i++) { vrg += (rg[i] - mrg) ** 2; vyb += (yb[i] - myb) ** 2 }
  return Math.sqrt(vrg / n + vyb / n) + 0.3 * Math.sqrt(mrg * mrg + myb * myb)
}

function exposure(d: Uint8ClampedArray): number {
  let sum = 0, n = 0, dark = 0, bright = 0
  for (let p = 0; p < d.length; p += 4) { const l = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255; sum += l; n++; if (l < 0.03) dark++; if (l > 0.97) bright++ }
  if (n === 0) return 0
  const centered = 1 - Math.min(1, Math.abs(sum / n - 0.45) / 0.45)
  return Math.max(0, centered - (dark + bright) / n)
}

function hashOf(img: HTMLImageElement, canvas: HTMLCanvasElement): bigint {
  canvas.width = 8; canvas.height = 8
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0n
  ctx.drawImage(img, 0, 0, 8, 8)
  const d = ctx.getImageData(0, 0, 8, 8).data
  const gray: number[] = []
  for (let p = 0; p < d.length; p += 4) gray.push(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2])
  return aHash(gray)
}

const norm = (v: number, lo: number, hi: number) => (hi <= lo ? 0.5 : Math.min(1, Math.max(0, (v - lo) / (hi - lo))))

interface Raw { id: string; engagement: number; sharp: number; expo: number; color: number; hash: bigint; hadReactions: boolean }

/**
 * Bewertet jedes Foto (0..1): Engagement (Haupt) + Schaerfe, Belichtung, Farbigkeit.
 * Robust bei duenner Datenlage – ohne Reaktionen tragen allein die Pixel-Heuristiken.
 */
export async function scorePhotos(photos: Photo[], comments: Comment[], reactions: Reaction[], opts: ScoreOptions = {}): Promise<Map<string, ScoreEntry>> {
  const metricCanvas = document.createElement('canvas')
  const hashCanvas = document.createElement('canvas')
  const raws: Raw[] = []
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    const rc = reactions.filter((r) => r.photoId === p.id).length
    const cc = comments.filter((c) => c.photoId === p.id).length
    let sharp = 0, expo = 0.5, color = 0, hash = 0n
    try {
      const img = await loadImage(p.url)
      const data = drawSmall(img, metricCanvas)
      if (data) { sharp = laplacianVar(data.data, data.width, data.height); expo = exposure(data.data); color = colorfulness(data.data) }
      hash = hashOf(img, hashCanvas)
    } catch { /* Bild nicht ladbar: Engagement zaehlt weiter */ }
    raws.push({ id: p.id, engagement: rc + 1.5 * cc, sharp, expo, color, hash, hadReactions: rc + cc > 0 })
    if ((i + 1) % 3 === 0 || i === photos.length - 1) { opts.onProgress?.(i + 1, photos.length); await new Promise((r) => setTimeout(r, 0)) }
  }

  const eng = raws.map((r) => r.engagement), shp = raws.map((r) => r.sharp), col = raws.map((r) => r.color)
  const engLo = Math.min(...eng), engHi = Math.max(...eng)
  const shpLo = Math.min(...shp), shpHi = Math.max(...shp)
  const colLo = Math.min(...col), colHi = Math.max(...col)
  const anyEngagement = raws.some((r) => r.hadReactions)

  const out = new Map<string, ScoreEntry>()
  for (const r of raws) {
    const parts: ScoreParts = { engagement: norm(r.engagement, engLo, engHi), sharpness: norm(r.sharp, shpLo, shpHi), exposure: Math.min(1, Math.max(0, r.expo)), colorfulness: norm(r.color, colLo, colHi) }
    // Ohne jegliche Reaktionen die Engagement-Gewichtung auf die Heuristiken umlegen.
    let total: number
    if (anyEngagement) total = parts.engagement * W.engagement + parts.sharpness * W.sharpness + parts.exposure * W.exposure + parts.colorfulness * W.colorfulness
    else { const s = W.sharpness + W.exposure + W.colorfulness; total = (parts.sharpness * W.sharpness + parts.exposure * W.exposure + parts.colorfulness * W.colorfulness) / s }
    out.set(r.id, { total, parts, hash: r.hash })
  }
  return out
}
