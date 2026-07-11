import type { Comment, Photo, Reaction } from '../types'
import { aHash } from './phash'
import { aiAvailable, initAesthetic, scoreAesthetic } from './aesthetic'

export interface ScoreParts {
  engagement: number
  sharpness: number
  colorfulness: number
  exposure: number
  ai: number | null
}
export interface ScoreEntry { total: number; parts: ScoreParts; hash: bigint }
export interface ScoreOptions {
  onProgress?: (done: number, total: number) => void
  useAI?: boolean
}

const W = { engagement: 0.45, sharpness: 0.15, colorfulness: 0.12, exposure: 0.10, ai: 0.18 }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('img'))
    img.src = url
  })
}

/** Bild in einen kleinen Canvas zeichnen (max. 256 px), Seitenverhaeltnis erhalten. */
function drawSmall(img: HTMLImageElement, canvas: HTMLCanvasElement): ImageData | null {
  const max = 256
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
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
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x
    lap[i] = -4 * g[i] + g[i - 1] + g[i + 1] + g[i - w] + g[i + w]
    mean += lap[i]; n++
  }
  if (n === 0) return 0
  mean /= n
  let v = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const d2 = lap[y * w + x] - mean; v += d2 * d2 }
  return v / n
}

/** Hasler-Suesstrunk-Colorfulness. */
function colorfulness(d: Uint8ClampedArray): number {
  let mrg = 0, myb = 0, n = 0
  const rg: number[] = [], yb: number[] = []
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2]
    const a = r - g
    const c = 0.5 * (r + g) - b
    rg.push(a); yb.push(c); mrg += a; myb += c; n++
  }
  if (n === 0) return 0
  mrg /= n; myb /= n
  let vrg = 0, vyb = 0
  for (let i = 0; i < n; i++) { vrg += (rg[i] - mrg) ** 2; vyb += (yb[i] - myb) ** 2 }
  const stdRoot = Math.sqrt(vrg / n + vyb / n)
  const meanRoot = Math.sqrt(mrg * mrg + myb * myb)
  return stdRoot + 0.3 * meanRoot // typ. 0..120
}

/** Belichtungsguete: nahe mittlerer Luminanz gut, Strafe fuer Clipping. */
function exposure(d: Uint8ClampedArray): number {
  let sum = 0, n = 0, dark = 0, bright = 0
  for (let p = 0; p < d.length; p += 4) {
    const l = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255
    sum += l; n++
    if (l < 0.03) dark++
    if (l > 0.97) bright++
  }
  if (n === 0) return 0
  const mean = sum / n
  const centered = 1 - Math.min(1, Math.abs(mean - 0.45) / 0.45)
  const clip = (dark + bright) / n
  return Math.max(0, centered - clip)
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

interface Raw { id: string; engagement: number; sharp: number; color: number; expo: number; ai: number | null; hash: bigint }

/**
 * Bewertet jedes Foto (0..1) als gewichtete Summe aus Engagement, Schaerfe, Farbigkeit,
 * Belichtung und optionaler KI-Aesthetik. Verarbeitet in Chunks (UI bleibt reaktiv).
 */
export async function scorePhotos(
  photos: Photo[],
  comments: Comment[],
  reactions: Reaction[],
  opts: ScoreOptions = {},
): Promise<Map<string, ScoreEntry>> {
  const { onProgress, useAI } = opts
  const metricCanvas = document.createElement('canvas')
  const hashCanvas = document.createElement('canvas')

  let ai = false
  if (useAI) ai = await initAesthetic().catch(() => false)
  const withAI = ai && aiAvailable()

  const raws: Raw[] = []
  const CHUNK = 3
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]
    const engagement = reactions.filter((r) => r.photoId === p.id).length + 1.5 * comments.filter((c) => c.photoId === p.id).length
    let sharp = 0, color = 0, expo = 0.5, aiScore: number | null = null, hash = 0n
    try {
      const img = await loadImage(p.url)
      const data = drawSmall(img, metricCanvas)
      if (data) {
        sharp = laplacianVar(data.data, data.width, data.height)
        color = colorfulness(data.data)
        expo = exposure(data.data)
      }
      hash = hashOf(img, hashCanvas)
      if (withAI) aiScore = scoreAesthetic(img)
    } catch {
      // Bild nicht ladbar (CORS/offline): neutrale Pixelwerte, Engagement zaehlt weiter.
    }
    raws.push({ id: p.id, engagement, sharp, color, expo, ai: aiScore, hash })
    if ((i + 1) % CHUNK === 0 || i === photos.length - 1) {
      onProgress?.(i + 1, photos.length)
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  // Min-Max-Normierung je Metrik ueber das Set.
  const engVals = raws.map((r) => r.engagement)
  const shpVals = raws.map((r) => r.sharp)
  const colVals = raws.map((r) => r.color)
  const engLo = Math.min(...engVals), engHi = Math.max(...engVals)
  const shpLo = Math.min(...shpVals), shpHi = Math.max(...shpVals)
  const colLo = Math.min(...colVals), colHi = Math.max(...colVals)

  const anyAI = raws.some((r) => r.ai != null)
  const wsum = anyAI ? 1 : (W.engagement + W.sharpness + W.colorfulness + W.exposure)
  const scale = anyAI ? 1 : 1 / wsum

  const out = new Map<string, ScoreEntry>()
  for (const r of raws) {
    const parts: ScoreParts = {
      engagement: norm(r.engagement, engLo, engHi),
      sharpness: norm(r.sharp, shpLo, shpHi),
      colorfulness: norm(r.color, colLo, colHi),
      exposure: Math.min(1, Math.max(0, r.expo)),
      ai: r.ai,
    }
    let total = (parts.engagement * W.engagement + parts.sharpness * W.sharpness + parts.colorfulness * W.colorfulness + parts.exposure * W.exposure) * scale
    if (anyAI && parts.ai != null) total += parts.ai * W.ai
    out.set(r.id, { total, parts, hash: r.hash })
  }
  return out
}
