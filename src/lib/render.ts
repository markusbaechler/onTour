import { renderFrames } from './frameRenderer'
import type { Storyboard } from './storyboard'
import type { StageStats } from './passes'
import type { Photo } from '../types'

export interface RenderResult { url: string; type: 'mp4' | 'webm' }
export interface RenderControl { cancelled: boolean }
export interface RenderOptions {
  storyboard: Storyboard
  photos: Photo[]
  stats: Record<string, StageStats>
  music: { blob: Blob; name: string }
  budget?: 'normal' | 'low'
  onPhase: (phase: 'frames' | 'render', progress: number) => void
  control?: RenderControl
}
export interface RenderCapability { ok: boolean; mobile: boolean; reason?: string }

// Single-Thread-Core (KEIN core-mt) – braucht KEIN SharedArrayBuffer, laeuft daher auch auf
// GitHub Pages ohne COOP/COEP. Gepinnte Version, per toBlobURL geladen.
const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
const BUDGETS = { normal: { res: 720, fps: 20, maxSeconds: 60 }, low: { res: 540, fps: 20, maxSeconds: 30 } }

/** Feature-Check. crossOriginIsolated wird NICHT vorausgesetzt (ST-Core). */
export function renderCapability(): RenderCapability {
  if (typeof WebAssembly === 'undefined') return { ok: false, mobile: false, reason: 'WebAssembly ist in diesem Browser nicht verfügbar.' }
  const ua = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const lowMem = typeof mem === 'number' && mem <= 4
  const mobile = ua || (small && lowMem)
  return { ok: !mobile, mobile, reason: mobile ? 'Der MP4-Render braucht viel Speicher – am Desktop (Chrome/Firefox) empfohlen.' : undefined }
}

function dims(aspect: '9:16' | '16:9', res: number): { w: number; h: number } {
  const long = Math.round((res * 16) / 9)
  return aspect === '9:16' ? { w: res, h: long } : { w: long, h: res }
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly ist in diesem Browser nicht verfügbar.')
  const budget = BUDGETS[opts.budget ?? 'normal']
  const { w, h } = dims(opts.storyboard.aspect, budget.res)

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')
  const ff = new FFmpeg()
  let lastLog = ''
  ff.on('log', ({ message }: { message: string }) => { lastLog = message })
  ff.on('progress', ({ progress }: { progress: number }) => opts.onPhase('render', Math.max(0, Math.min(0.999, progress))))

  try { await ff.load({ coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm') }) }
  catch (e) { console.error('ffmpeg load failed:', e); throw new Error('ffmpeg-Core konnte nicht geladen werden (Netzwerk/CDN blockiert?).') }

  try {
    const { frameCount, fps } = await renderFrames({
      storyboard: opts.storyboard, photos: opts.photos, stats: opts.stats,
      w, h, fps: budget.fps, maxSeconds: budget.maxSeconds, control: opts.control,
      onProgress: (d, t) => opts.onPhase('frames', t ? d / t : 0),
      writeFrame: async (name, blob) => { await ff.writeFile(name, await fetchFile(blob)) },
    })
    if (opts.control?.cancelled) throw new Error('cancelled')

    const audioName = `audio.${(opts.music.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3'}`
    await ff.writeFile(audioName, await fetchFile(opts.music.blob))
    const total = frameCount / fps
    const fade = Math.max(0, total - 2).toFixed(2)
    const enc = (vc: string, ac: string, ext: string, extra: string[]) =>
      ff.exec(['-framerate', String(fps), '-i', 'frame_%05d.jpg', '-i', audioName, '-map', '0:v', '-map', '1:a', '-c:v', vc, ...extra, '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', ac, '-af', `afade=t=out:st=${fade}:d=2`, '-t', total.toFixed(2), '-shortest', `out.${ext}`])

    let type: 'mp4' | 'webm' = 'mp4'
    let data: Uint8Array
    try {
      await enc('libx264', 'aac', 'mp4', ['-preset', 'veryfast', '-movflags', '+faststart'])
      data = (await ff.readFile('out.mp4')) as Uint8Array
    } catch (e) {
      console.warn('libx264/mp4 fehlgeschlagen, versuche vp9/webm. ffmpeg:', lastLog, e)
      await enc('libvpx-vp9', 'libopus', 'webm', ['-b:v', '2M'])
      data = (await ff.readFile('out.webm')) as Uint8Array
      type = 'webm'
    }
    const bytes = new Uint8Array(data.length); bytes.set(data)
    return { url: URL.createObjectURL(new Blob([bytes], { type: type === 'mp4' ? 'video/mp4' : 'video/webm' })), type }
  } catch (e) {
    if ((e as Error).message === 'cancelled') throw e
    console.error('render failed:', (e as Error).message, '| ffmpeg:', lastLog)
    throw new Error('Render fehlgeschlagen – wahrscheinlich zu viele Fotos oder zu lang. Reduziere die Auswahl oder rendere am Desktop.')
  } finally {
    try { ff.terminate() } catch { /* egal */ }
  }
}
