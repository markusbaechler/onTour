import { trip } from '../data/trip'
import { flatten, type KenBurns, type Storyboard } from './storyboard'
import { CROP } from './cloudinaryCrop'
import { toFrame } from './frame'
import { renderCaptionPng, renderRoutePng, renderTitleCardPng } from './overlays'
import type { StageStats } from './passes'
import type { Photo } from '../types'

export interface RenderResult { url: string; type: 'mp4' | 'webm' }
export interface RenderControl { cancelled: boolean }
export interface RenderOptions {
  storyboard: Storyboard
  photos: Photo[]
  stats: Record<string, StageStats>
  music: { blob: Blob; name: string }
  onPhase: (phase: 'frames' | 'render', progress: number) => void
  control?: RenderControl
}

const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
const FPS = 24
const MAX_SEGMENTS = 30
const ROUTE_SECONDS = 2.6

/** Feature-Check: WASM vorhanden und nicht mobil (Speicher). */
export function canRenderVideo(): { ok: boolean; reason?: string } {
  if (typeof WebAssembly === 'undefined') return { ok: false, reason: 'WebAssembly ist in diesem Browser nicht verfügbar.' }
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return { ok: false, reason: 'Der Render braucht viel Speicher – bitte am Desktop (Chrome/Firefox) rendern.' }
  return { ok: true }
}

interface Plan {
  t: 'photo' | 'title' | 'route'
  seconds: number; kb: KenBurns
  photo?: Photo; caption?: string; day?: number; overlayTitle?: boolean
  title?: string; subtitle?: string; stats?: string
  stageId?: string; label?: string
}
interface Seg { base: Blob; overlay?: Blob; seconds: number; kb: KenBurns }

function buildPlan(sb: Storyboard, photos: Photo[]): Plan[] {
  const items = flatten(sb, photos)
  const plan: Plan[] = []
  for (const it of items) {
    const seconds = Math.max(0.6, it.end - it.start)
    if (it.kind === 'photo' && it.photo) {
      plan.push({ t: 'photo', seconds, kb: it.kenBurns ?? 'in', photo: it.photo, caption: it.caption, day: it.day, overlayTitle: it.overlayTitle, title: it.title, subtitle: it.subtitle })
    } else if (it.kind === 'title') {
      plan.push({ t: 'title', seconds, kb: 'in', title: it.title, subtitle: it.subtitle, stats: it.stats })
      if (it.stageId) plan.push({ t: 'route', seconds: ROUTE_SECONDS, kb: 'in', stageId: it.stageId, label: [it.title, it.subtitle].filter(Boolean).join(' · ') })
    }
  }
  // Grenzen: erst Routen-Frames opfern, dann kappen (Outro behalten).
  let out = plan
  if (out.length > MAX_SEGMENTS) out = out.filter((p) => p.t !== 'route')
  if (out.length > MAX_SEGMENTS) out = [...out.slice(0, MAX_SEGMENTS - 1), out[out.length - 1]]
  return out
}

async function buildSegments(opts: RenderOptions, w: number, h: number): Promise<Seg[]> {
  const plan = buildPlan(opts.storyboard, opts.photos)
  const segs: Seg[] = []
  for (let i = 0; i < plan.length; i++) {
    if (opts.control?.cancelled) throw new Error('cancelled')
    const p = plan[i]
    try {
      if (p.t === 'photo' && p.photo) {
        const base = await toFrame(p.photo, w, h)
        const overlay = p.overlayTitle
          ? await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, overlay: true })
          : await renderCaptionPng(w, h, { day: p.day, caption: p.caption, author: p.photo.author })
        segs.push({ base, overlay, seconds: p.seconds, kb: p.kb })
      } else if (p.t === 'title') {
        segs.push({ base: await renderTitleCardPng(w, h, { title: p.title, subtitle: p.subtitle, stats: p.stats }), seconds: p.seconds, kb: p.kb })
      } else if (p.t === 'route' && p.stageId) {
        const stage = trip.stages.find((s) => s.id === p.stageId)
        const track = stage?.track ?? []
        const passes = (opts.stats[p.stageId]?.passes ?? []).map((x) => ({ lat: x.lat, lng: x.lng, name: x.name, altitude: x.altitude }))
        segs.push({ base: await renderRoutePng(w, h, track, passes, p.label), seconds: p.seconds, kb: p.kb })
      }
    } catch {
      // Segment nicht baubar (z. B. Bild-Ladefehler) -> ueberspringen, Render laeuft weiter.
    }
    opts.onPhase('frames', (i + 1) / plan.length)
  }
  return segs
}

function zoomExpr(kb: KenBurns, frames: number): string {
  const step = (0.14 / Math.max(1, frames)).toFixed(6)
  // l/r robust auf in/out abgebildet
  if (kb === 'out' || kb === 'r') return `if(lte(on,1),1.14,max(zoom-${step},1.0))`
  return `min(zoom+${step},1.14)`
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const chk = canRenderVideo()
  if (!chk.ok) throw new Error(chk.reason ?? 'Render nicht möglich.')
  const { w, h } = CROP[opts.storyboard.aspect]

  const segs = await buildSegments(opts, w, h)
  if (!segs.length) throw new Error('Keine Segmente zum Rendern.')
  if (opts.control?.cancelled) throw new Error('cancelled')

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')
  const ff = new FFmpeg()
  let curIndex = 0
  ff.on('progress', ({ progress }: { progress: number }) => {
    const p = Math.max(0, Math.min(1, progress))
    opts.onPhase('render', Math.min(0.999, (curIndex + p) / (segs.length + 1)))
  })
  await ff.load({ coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm') })

  try {
    for (let i = 0; i < segs.length; i++) {
      if (opts.control?.cancelled) throw new Error('cancelled')
      curIndex = i
      const seg = segs[i]
      const baseName = `b${i}.${seg.base.type.includes('jpeg') ? 'jpg' : 'png'}`
      await ff.writeFile(baseName, await fetchFile(seg.base))
      const frames = Math.max(1, Math.round(seg.seconds * FPS))
      const zp = `scale=${w}:${h},setsar=1,zoompan=z='${zoomExpr(seg.kb, frames)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`
      const args = ['-loop', '1', '-t', seg.seconds.toFixed(3), '-i', baseName]
      let fc = `[0:v]${zp}[v]`
      if (seg.overlay) {
        const ovName = `o${i}.png`
        await ff.writeFile(ovName, await fetchFile(seg.overlay))
        args.push('-i', ovName)
        fc = `[0:v]${zp}[bg];[bg][1:v]overlay=0:0[v]`
      }
      args.push('-filter_complex', fc, '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-an', `s${i}.mp4`)
      await ff.exec(args)
      await ff.deleteFile(baseName).catch(() => {})
      if (seg.overlay) await ff.deleteFile(`o${i}.png`).catch(() => {})
    }

    const list = segs.map((_, i) => `file 's${i}.mp4'`).join('\n')
    await ff.writeFile('list.txt', new TextEncoder().encode(list))
    const audioName = `audio.${(opts.music.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3'}`
    await ff.writeFile(audioName, await fetchFile(opts.music.blob))
    const total = segs.reduce((a, s) => a + s.seconds, 0)
    const fadeStart = Math.max(0, total - 2).toFixed(2)
    curIndex = segs.length

    let type: 'mp4' | 'webm' = 'mp4'
    let data: Uint8Array
    const mux = (vcodec: string, acodec: string, ext: string, extra: string[]) =>
      ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-i', audioName, '-map', '0:v', '-map', '1:a', '-c:v', vcodec, ...extra, '-c:a', acodec, '-af', `afade=t=out:st=${fadeStart}:d=2`, '-t', total.toFixed(2), `out.${ext}`])
    try {
      await mux('copy', 'aac', 'mp4', ['-movflags', '+faststart'])
      data = (await ff.readFile('out.mp4')) as Uint8Array
    } catch {
      // Fallback: neu enkodieren als webm (falls copy/mp4 scheitert)
      await mux('libvpx-vp9', 'libopus', 'webm', ['-b:v', '2M'])
      data = (await ff.readFile('out.webm')) as Uint8Array
      type = 'webm'
    }
    const bytes = new Uint8Array(data.length)
    bytes.set(data)
    const blob = new Blob([bytes], { type: type === 'mp4' ? 'video/mp4' : 'video/webm' })
    return { url: URL.createObjectURL(blob), type }
  } finally {
    try { ff.terminate() } catch { /* egal */ }
  }
}
