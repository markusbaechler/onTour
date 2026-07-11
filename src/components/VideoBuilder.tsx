import { useEffect, useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { IcX, IcFilm } from './Icons'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  onClose: () => void
}

type Scope = 'all' | string // 'all' oder stageId
interface Frame { img: HTMLImageElement; caption?: string; author: string; day: number }

const W = 1280, H = 720
const INTRO = 1600, OUTRO = 1900, CROSS = 550 // ms
const SEC_OPTIONS = [1.8, 2.5, 4]

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed'))
    img.src = url
  })
}

function pickMime(): string {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/** Bildschirmfuellend zeichnen (cover) mit Ken-Burns-Zoomfaktor. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number) {
  const ir = img.width / img.height
  const cr = W / H
  let w: number, h: number
  if (ir > cr) { h = H * scale; w = h * ir } else { w = W * scale; h = w / ir }
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

function drawCaption(ctx: CanvasRenderingContext2D, f: Frame, alpha: number) {
  const g = ctx.createLinearGradient(0, H - 320, 0, H)
  g.addColorStop(0, 'rgba(8,7,10,0)')
  g.addColorStop(1, 'rgba(8,7,10,0.9)')
  ctx.fillStyle = g
  ctx.fillRect(0, H - 320, W, 320)
  ctx.globalAlpha = alpha
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FF8A3D'
  ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif'
  ctx.fillText(`T${f.day}`, 56, H - 118)
  if (f.caption) {
    ctx.fillStyle = '#F2F1F5'
    ctx.font = '600 40px "Space Grotesk", system-ui, sans-serif'
    ctx.fillText(clipText(ctx, f.caption, W - 112), 56, H - 74)
  }
  ctx.fillStyle = '#A8A6B2'
  ctx.font = '400 24px Inter, system-ui, sans-serif'
  ctx.fillText(f.author, 56, H - 40)
  ctx.globalAlpha = 1
}

function drawTitle(ctx: CanvasRenderingContext2D, big: string, small: string, sub: string, alpha: number) {
  ctx.fillStyle = '#0E0D11'
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = alpha
  ctx.textAlign = 'center'
  ctx.fillStyle = '#A8A6B2'
  ctx.font = '400 26px Inter, system-ui, sans-serif'
  ctx.fillText(small.toUpperCase(), W / 2, H / 2 - 70)
  ctx.fillStyle = '#F2F1F5'
  ctx.font = '700 76px "Space Grotesk", system-ui, sans-serif'
  ctx.fillText(big, W / 2, H / 2 + 6)
  ctx.fillStyle = '#FF8A3D'
  ctx.font = '500 28px Inter, system-ui, sans-serif'
  ctx.fillText(sub, W / 2, H / 2 + 66)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)

export function VideoBuilder({ photos, onClose }: Props) {
  const supported = useMemo(() => typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && !!pickMime(), [])
  const stagesWithPhotos = useMemo(() => trip.stages.filter((s) => photos.some((p) => p.stageId === s.id)), [photos])

  const [scope, setScope] = useState<Scope>('all')
  const [secs, setSecs] = useState(2.5)
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const cancelled = useRef(false)
  const rafRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const urlRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => () => {
    cancelled.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop() } catch { /* egal */ }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  function photosForScope(): Photo[] {
    const byTime = (a: Photo, b: Photo) => a.createdAt.localeCompare(b.createdAt)
    if (scope === 'all') return trip.stages.flatMap((s) => photos.filter((p) => p.stageId === s.id).sort(byTime))
    return photos.filter((p) => p.stageId === scope).sort(byTime)
  }

  async function build() {
    if (!supported) return
    setPhase('working'); setProgress(0); setVideoUrl(null); setErrorMsg('')
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }

    const list = photosForScope()
    const loaded = await Promise.allSettled(list.map(async (p) => {
      const img = await loadImage(p.url)
      const day = trip.stages.find((s) => s.id === p.stageId)?.day ?? 0
      return { img, caption: p.caption, author: p.author, day } as Frame
    }))
    if (cancelled.current) return
    const frames = loaded.filter((r): r is PromiseFulfilledResult<Frame> => r.status === 'fulfilled').map((r) => r.value)
    if (frames.length === 0) { setPhase('error'); setErrorMsg('Bilder konnten nicht geladen werden.'); return }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) { setPhase('error'); setErrorMsg('Canvas nicht verfügbar.'); return }

    const stream = canvas.captureStream(30)
    streamRef.current = stream
    const mime = pickMime()
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorderRef.current = recorder
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (cancelled.current) return
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setVideoUrl(url)
      setPhase('done')
      setProgress(1)
      // Auto-Download
      const a = document.createElement('a')
      a.href = url
      a.download = `bbz-cannonball-${scope === 'all' ? 'tour' : scope}.webm`
      document.body.appendChild(a); a.click(); a.remove()
    }

    const slot = secs * 1000
    const total = INTRO + frames.length * slot + OUTRO
    recorder.start()
    const t0 = performance.now()
    let lastProg = 0

    const frameAt = (t: number) => {
      ctx.fillStyle = '#0E0D11'; ctx.fillRect(0, 0, W, H)
      if (t < INTRO) {
        drawTitle(ctx, trip.title, trip.subtitle, dateHint(), Math.min(1, ease(t / 500)))
        return
      }
      const endShow = INTRO + frames.length * slot
      if (t >= endShow) {
        const op = Math.min(1, (t - endShow) / 500)
        drawTitle(ctx, 'Merci!', trip.title, trip.riders.join(' · '), op)
        return
      }
      const local = t - INTRO
      const i = Math.min(frames.length - 1, Math.floor(local / slot))
      const into = local - i * slot
      const p = into / slot
      // Vorheriges Bild unter dem Crossfade
      if (i > 0 && into < CROSS) {
        drawCover(ctx, frames[i - 1].img, 1.08)
      }
      const a = i > 0 ? Math.min(1, into / CROSS) : 1
      ctx.globalAlpha = a
      drawCover(ctx, frames[i].img, 1 + 0.08 * p)
      ctx.globalAlpha = 1
      drawCaption(ctx, frames[i], a)
    }

    const tick = () => {
      if (cancelled.current) return
      const t = performance.now() - t0
      frameAt(t)
      const pr = Math.min(1, t / total)
      if (pr - lastProg > 0.01) { lastProg = pr; setProgress(pr) }
      if (t >= total) { try { recorder.stop() } catch { /* egal */ } return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function dateHint(): string {
    const s = new Date(trip.startDate)
    return s.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })
  }

  const working = phase === 'working'

  return (
    <div onClick={working ? undefined : onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={sheet}>
        <div style={handle} />
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">Video erstellen</span>
        <h1 className="h1" style={{ fontSize: 21, marginTop: 6, marginBottom: 14 }}>Slideshow als Video</h1>

        {!supported ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Dein Browser unterstützt die Videoaufnahme leider nicht (häufig iOS-Safari).
            Öffne das Fotobuch am Desktop (Chrome/Firefox), um ein Video zu erstellen.
          </p>
        ) : (
          <>
            <span className="lbl" style={{ display: 'block', marginBottom: 8, color: 'var(--mist)', fontSize: 11 }}>Umfang</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              <Chip active={scope === 'all'} onClick={() => setScope('all')} disabled={working}>Ganze Tour</Chip>
              {stagesWithPhotos.map((s) => (
                <Chip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)} disabled={working}>T{s.day}</Chip>
              ))}
            </div>

            <span className="lbl" style={{ display: 'block', marginBottom: 8, color: 'var(--mist)', fontSize: 11 }}>Sekunden pro Bild</span>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {SEC_OPTIONS.map((v) => (
                <Chip key={v} active={secs === v} onClick={() => setSecs(v)} disabled={working}>{v}s</Chip>
              ))}
            </div>

            {(working || phase === 'done') && (
              <div style={{ height: 6, background: 'var(--ink-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--signal)', transition: 'width .15s linear' }} />
              </div>
            )}
            {phase === 'error' && <p style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>}

            {videoUrl && phase === 'done' && (
              <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 12, marginBottom: 14, background: '#000' }} />
            )}

            <button className="btn" style={{ width: '100%' }} disabled={working} onClick={build}>
              <IcFilm size={18} /> {working ? `Rendere… ${Math.round(progress * 100)}%` : phase === 'done' ? 'Neu erstellen' : 'Video erstellen'}
            </button>
            {phase === 'done' && <div className="mono muted" style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}>Video wurde heruntergeladen (.webm)</div>}
          </>
        )}
        <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? 'var(--signal)' : 'var(--ink-2)',
        color: active ? '#1a0e04' : 'var(--snow)',
        border: `0.5px solid ${active ? 'var(--signal)' : 'var(--slate)'}`,
        borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled && !active ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(8,7,10,.7)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
}
const sheet: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 'var(--shell)',
  background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)',
  borderRadius: '20px 20px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))',
  maxHeight: '90vh', overflowY: 'auto',
}
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
const closeBtn: React.CSSProperties = { position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 6 }
