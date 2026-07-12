import { buildTimeline, renderRange } from './frameRenderer'
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
  maxSeconds?: number // Wunschlaenge; hart auf das Budget (170s) gedeckelt
  onPhase: (phase: 'frames' | 'render', progress: number, detail?: string) => void
  control?: RenderControl
}
export interface RenderCapability { ok: boolean; mobile: boolean; reason?: string }

type FF = import('@ffmpeg/ffmpeg').FFmpeg
type ToBlobURL = (url: string, mimeType: string) => Promise<string>
type FetchFile = (data: Blob) => Promise<Uint8Array>

// Single-Thread-Core (KEIN core-mt) – kein SharedArrayBuffer noetig. ESM-Variante, weil der
// (Vite-gebundelte) Worker den Core per import() laedt. Self-hosted zuerst, dann CDN-Fallbacks.
const CORE_VERSION = '0.12.10'
function coreSources(base: string): Array<{ name: string; url: string }> {
  return [
    { name: 'self', url: `${base}ffmpeg/` },
    { name: 'unpkg', url: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/` },
    { name: 'jsdelivr', url: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/` },
  ]
}
// Chunk-Encoding: nie alle Frames gleichzeitig im FS -> lange Videos (bis 170s) ohne WASM-OOM.
const BUDGETS = { normal: { res: 720, fps: 20, maxSeconds: 170 }, low: { res: 540, fps: 20, maxSeconds: 40 } }
const CHUNK_FRAMES = 400 // ~20s bei 20fps

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
    } catch (e) { lastUrl = coreJs; lastErr = (e as Error).message; console.warn(`[render] core-load via ${src.name} fehlgeschlagen (${coreJs}):`, e) }
  }
  throw new Error(`ffmpeg-Core konnte nicht geladen werden. Zuletzt gescheitert: ${lastUrl} (${lastErr})`)
}

/** Mini-Encode (2 Frames) nach load: prueft Encode-Faehigkeit und waehlt den Codec. */
async function selfTest(ff: FF, fetchFile: FetchFile): Promise<'mp4' | 'webm'> {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const cx = c.getContext('2d'); if (!cx) throw new Error('Canvas nicht verfügbar.')
  cx.fillStyle = '#FF8A3D'; cx.fillRect(0, 0, 64, 64)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.8))
  const bytes = await fetchFile(blob)
  await ff.writeFile('t_00001.jpg', new Uint8Array(bytes)) // frische Kopie je writeFile (Transfer!)
  await ff.writeFile('t_00002.jpg', new Uint8Array(bytes))
  const cleanup = async () => { for (const f of ['t_00001.jpg', 't_00002.jpg', 'selftest.mp4', 'selftest.webm']) await ff.deleteFile(f).catch(() => {}) }
  try { await ff.exec(['-framerate', '2', '-i', 't_%05d.jpg', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', 'selftest.mp4']); await cleanup(); return 'mp4' }
  catch { await ff.exec(['-framerate', '2', '-i', 't_%05d.jpg', '-t', '1', '-c:v', 'libvpx-vp9', '-b:v', '1M', 'selftest.webm']); await cleanup(); return 'webm' }
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  if (typeof WebAssembly === 'undefined') throw new Error('WebAssembly ist in diesem Browser nicht verfügbar.')
  const budget = BUDGETS[opts.budget ?? 'normal']
  const { w, h } = dims(opts.storyboard.aspect, budget.res)

  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')
  const ff = new FFmpeg()
  let lastLog = '', renderLabel = ''
  ff.on('log', ({ message }: { message: string }) => { lastLog = message })
  ff.on('progress', ({ progress }: { progress: number }) => opts.onPhase('render', Math.max(0, Math.min(0.999, progress)), renderLabel))

  await loadCore(ff, toBlobURL, import.meta.env.BASE_URL)
  const codec = await selfTest(ff, fetchFile)
  const partExt = codec === 'mp4' ? 'mp4' : 'webm'
  const vcodec = codec === 'mp4' ? 'libx264' : 'libvpx-vp9'
  const acodec = codec === 'mp4' ? 'aac' : 'libopus'

  try {
    const maxSeconds = Math.min(opts.maxSeconds ?? budget.maxSeconds, budget.maxSeconds)
    const tl = await buildTimeline({ storyboard: opts.storyboard, photos: opts.photos, stats: opts.stats, w, h, fps: budget.fps, maxSeconds, control: opts.control })
    const { totalFrames, fps } = tl
    const chunks = Math.max(1, Math.ceil(totalFrames / CHUNK_FRAMES))
    const parts: string[] = []

    for (let c = 0; c < chunks; c++) {
      if (opts.control?.cancelled) throw new Error('cancelled')
      const from = c * CHUNK_FRAMES, to = Math.min(totalFrames, (c + 1) * CHUNK_FRAMES)
      const n = to - from
      const label = `Chunk ${c + 1}/${chunks}`
      await renderRange(tl, from, to,
        async (name, blob) => { await ff.writeFile(name, new Uint8Array(await fetchFile(blob))) },
        (gi) => opts.onPhase('frames', (gi + 1) / totalFrames, label),
        opts.control,
      )
      renderLabel = label
      const part = `part_${String(c).padStart(2, '0')}.${partExt}`
      const extra = codec === 'mp4' ? ['-preset', 'veryfast'] : ['-b:v', '2M']
      await ff.exec(['-framerate', String(fps), '-i', 'frame_%05d.jpg', '-t', (n / fps).toFixed(3), '-c:v', vcodec, ...extra, '-pix_fmt', 'yuv420p', '-r', String(fps), '-an', part])
      parts.push(part)
      for (let i = 1; i <= n; i++) await ff.deleteFile(`frame_${String(i).padStart(5, '0')}.jpg`).catch(() => {})
    }

    const audioName = `audio.${(opts.music.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3'}`
    await ff.writeFile(audioName, new Uint8Array(await fetchFile(opts.music.blob)))
    await ff.writeFile('list.txt', new TextEncoder().encode(parts.map((p) => `file '${p}'`).join('\n')))
    const total = totalFrames / fps
    const fade = Math.max(0, total - 2.5).toFixed(2)
    renderLabel = 'Zusammenfügen'
    const finalExtra = codec === 'mp4' ? ['-movflags', '+faststart'] : []
    await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-i', audioName, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', acodec, ...finalExtra, '-af', `afade=t=out:st=${fade}:d=2.5`, '-t', total.toFixed(2), '-shortest', `out.${partExt}`])
    const data = (await ff.readFile(`out.${partExt}`)) as Uint8Array
    for (const p of parts) await ff.deleteFile(p).catch(() => {})

    const bytes = new Uint8Array(data.length); bytes.set(data)
    return { url: URL.createObjectURL(new Blob([bytes], { type: codec === 'mp4' ? 'video/mp4' : 'video/webm' })), type: codec }
  } catch (e) {
    if ((e as Error).message === 'cancelled') throw e
    console.error('render failed:', (e as Error).message, '| ffmpeg:', lastLog)
    throw new Error('Render fehlgeschlagen – wahrscheinlich zu viele Fotos oder zu lang. Reduziere die Auswahl/Länge oder rendere am Desktop.')
  } finally {
    try { ff.terminate() } catch { /* egal */ }
  }
}
