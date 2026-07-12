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

type FF = import('@ffmpeg/ffmpeg').FFmpeg
type ToBlobURL = (url: string, mimeType: string) => Promise<string>
type FetchFile = (data: Blob) => Promise<Uint8Array>

// Single-Thread-Core (KEIN core-mt) – braucht KEIN SharedArrayBuffer, laeuft auf GitHub Pages
// ohne COOP/COEP. Zuerst SELBST gehostet (same-origin), sonst CDN-Fallbacks, alle gepinnt.
const CORE_VERSION = '0.12.10'
function coreSources(base: string): Array<{ name: string; url: string }> {
  return [
    { name: 'self', url: `${base}ffmpeg/` },
    { name: 'unpkg', url: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/` },
    { name: 'jsdelivr', url: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd/` },
  ]
}
const BUDGETS = { normal: { res: 720, fps: 20, maxSeconds: 60 }, low: { res: 540, fps: 20, maxSeconds: 30 } }

/** Feature-Check. Mobil NUR bei echtem Touch-Gerät (nicht bei schmalem Desktop-Fenster). */
export function renderCapability(): RenderCapability {
  if (typeof WebAssembly === 'undefined') return { ok: false, mobile: false, reason: 'WebAssembly ist in diesem Browser nicht verfügbar.' }
  const mobile = navigator.maxTouchPoints > 1 && /Android|iPhone|iPad/i.test(navigator.userAgent)
  return { ok: !mobile, mobile, reason: mobile ? 'Der MP4-Render braucht viel Speicher – am Desktop (Chrome/Firefox) empfohlen.' : undefined }
}

function dims(aspect: '9:16' | '16:9', res: number): { w: number; h: number } {
  const long = Math.round((res * 16) / 9)
  return aspect === '9:16' ? { w: res, h: long } : { w: long, h: res }
}

/** Core laden: self-host zuerst, dann CDNs. Jede gescheiterte URL wird geloggt/gemeldet. */
async function loadCore(ff: FF, toBlobURL: ToBlobURL, base: string): Promise<void> {
  let lastUrl = '', lastErr = ''
  for (const src of coreSources(base)) {
    const coreJs = `${src.url}ffmpeg-core.js`
    try {
      const coreURL = await toBlobURL(coreJs, 'text/javascript')
      const wasmURL = await toBlobURL(`${src.url}ffmpeg-core.wasm`, 'application/wasm')
      await ff.load({ coreURL, wasmURL })
      console.info(`[render] ffmpeg-core geladen via ${src.name}: ${src.url}`)
      return
    } catch (e) {
      lastUrl = coreJs; lastErr = (e as Error).message
      console.warn(`[render] core-load via ${src.name} fehlgeschlagen (${coreJs}):`, e)
    }
  }
  throw new Error(`ffmpeg-Core konnte nicht geladen werden. Zuletzt gescheitert: ${lastUrl} (${lastErr})`)
}

/** Mini-Encode (2 Frames) direkt nach load: prueft, ob der Core encodiert, und waehlt den Codec. */
async function selfTest(ff: FF, fetchFile: FetchFile): Promise<'mp4' | 'webm'> {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const cx = c.getContext('2d'); if (!cx) throw new Error('Canvas nicht verfügbar.')
  cx.fillStyle = '#FF8A3D'; cx.fillRect(0, 0, 64, 64)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.8))
  const bytes = await fetchFile(blob)
  await ff.writeFile('t_00001.jpg', bytes)
  await ff.writeFile('t_00002.jpg', bytes)
  const cleanup = async () => { for (const f of ['t_00001.jpg', 't_00002.jpg', 'selftest.mp4', 'selftest.webm']) await ff.deleteFile(f).catch(() => {}) }
  try {
    await ff.exec(['-framerate', '2', '-i', 't_%05d.jpg', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', 'selftest.mp4'])
    await cleanup(); return 'mp4'
  } catch {
    await ff.exec(['-framerate', '2', '-i', 't_%05d.jpg', '-t', '1', '-c:v', 'libvpx-vp9', '-b:v', '1M', 'selftest.webm'])
    await cleanup(); return 'webm'
  }
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

  await loadCore(ff, toBlobURL, import.meta.env.BASE_URL)
  const codec = await selfTest(ff, fetchFile)

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

    let data: Uint8Array
    if (codec === 'mp4') { await enc('libx264', 'aac', 'mp4', ['-preset', 'veryfast', '-movflags', '+faststart']); data = (await ff.readFile('out.mp4')) as Uint8Array }
    else { await enc('libvpx-vp9', 'libopus', 'webm', ['-b:v', '2M']); data = (await ff.readFile('out.webm')) as Uint8Array }

    const bytes = new Uint8Array(data.length); bytes.set(data)
    return { url: URL.createObjectURL(new Blob([bytes], { type: codec === 'mp4' ? 'video/mp4' : 'video/webm' })), type: codec }
  } catch (e) {
    if ((e as Error).message === 'cancelled') throw e
    console.error('render failed:', (e as Error).message, '| ffmpeg:', lastLog)
    throw new Error('Render fehlgeschlagen – wahrscheinlich zu viele Fotos oder zu lang. Reduziere die Auswahl oder rendere am Desktop.')
  } finally {
    try { ff.terminate() } catch { /* egal */ }
  }
}
