import { useEffect, useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { dateRange } from '../lib/format'
import { collectPasses, type StageStats } from '../lib/passes'
import { scorePhotos, type ScoreEntry } from '../lib/photoScore'
import { curate } from '../lib/curate'
import { decodeAudioFile, detectBeats, createPlayback } from '../lib/audio'
import { modelReachable } from '../lib/aesthetic'
import { smartCropUrl } from '../lib/cloudinary'
import { buildFlyover, drawFlyover, type Flyover } from './video/mapScene'
import { IcX, IcFilm } from './Icons'
import type { Comment, Photo, Reaction } from '../types'

interface Props {
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
  stats: Record<string, StageStats>
  onClose: () => void
}

type Scope = 'all' | string
type Mode = 'cinema' | 'simple'
const W = 1280, H = 720, CROSS = 420
const SEC_OPTIONS = [1.8, 2.5, 4]

const AudioCtor: typeof AudioContext | undefined =
  typeof AudioContext !== 'undefined' ? AudioContext
  : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

// ---- gemeinsame Zeichenhilfen ------------------------------------------------
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = url
  })
}
function pickMime(): string {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m
  return ''
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number) {
  const ir = img.width / img.height, cr = W / H
  let w: number, h: number
  if (ir > cr) { h = H * scale; w = h * ir } else { w = W * scale; h = w / ir }
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
}
function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}
function drawCaption(ctx: CanvasRenderingContext2D, day: number, caption: string | undefined, author: string, alpha: number) {
  const g = ctx.createLinearGradient(0, H - 320, 0, H)
  g.addColorStop(0, 'rgba(8,7,10,0)'); g.addColorStop(1, 'rgba(8,7,10,0.9)')
  ctx.fillStyle = g; ctx.fillRect(0, H - 320, W, 320)
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#FF8A3D'; ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif'
  ctx.fillText(`T${day}`, 56, H - 118)
  if (caption) { ctx.fillStyle = '#F2F1F5'; ctx.font = '600 40px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(clip(ctx, caption, W - 112), 56, H - 74) }
  ctx.fillStyle = '#A8A6B2'; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.fillText(author, 56, H - 40)
  ctx.globalAlpha = 1
}
function drawTitle(ctx: CanvasRenderingContext2D, big: string, small: string, sub: string, alpha: number, bg?: HTMLImageElement, kb = 1) {
  ctx.fillStyle = '#0E0D11'; ctx.fillRect(0, 0, W, H)
  if (bg) { ctx.globalAlpha = 0.5; drawCover(ctx, bg, kb); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(8,7,10,0.5)'; ctx.fillRect(0, 0, W, H) }
  ctx.globalAlpha = alpha
  ctx.textAlign = 'center'
  ctx.fillStyle = '#A8A6B2'; ctx.font = '400 26px Inter, system-ui, sans-serif'; ctx.fillText(small.toUpperCase(), W / 2, H / 2 - 70)
  ctx.fillStyle = '#F2F1F5'; ctx.font = '700 76px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(big, W / 2, H / 2 + 6)
  ctx.fillStyle = '#FF8A3D'; ctx.font = '500 28px Inter, system-ui, sans-serif'; ctx.fillText(sub, W / 2, H / 2 + 66)
  ctx.textAlign = 'left'; ctx.globalAlpha = 1
}
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

// ---- Kino-Timeline -----------------------------------------------------------
type Shot =
  | { kind: 'title'; start: number; end: number; big: string; small: string; sub: string; bg?: HTMLImageElement }
  | { kind: 'daycard'; start: number; end: number; day: number; route: string; date: string }
  | { kind: 'flyover'; start: number; end: number; fly: Flyover; day: number; route: string }
  | { kind: 'stats'; start: number; end: number; km: number; passes: number; col: string }
  | { kind: 'photo'; start: number; end: number; img: HTMLImageElement; caption?: string; author: string; day: number; hard: boolean; punch: boolean }

export function VideoBuilder({ photos, comments, reactions, stats, onClose }: Props) {
  const supported = useMemo(() => typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && !!pickMime(), [])
  const stagesWithPhotos = useMemo(() => trip.stages.filter((s) => photos.some((p) => p.stageId === s.id)), [photos])

  const [mode, setMode] = useState<Mode>('cinema')
  const [scope, setScope] = useState<Scope>('all')
  const [secs, setSecs] = useState(2.5)
  const [target, setTarget] = useState<number | null>(null) // null = an Musiklaenge
  const [useAI, setUseAI] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [sub, setSub] = useState('')
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const cancelled = useRef(false)
  const rafRef = useRef<number | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioRef = useRef<AudioContext | null>(null)
  const urlRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => { modelReachable().then(setAiReady).catch(() => setAiReady(false)) }, [])
  useEffect(() => () => {
    cancelled.current = true
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop() } catch { /* egal */ }
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    try { audioRef.current?.close() } catch { /* egal */ }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const photosForScope = (): Photo[] => {
    const byTime = (a: Photo, b: Photo) => a.createdAt.localeCompare(b.createdAt)
    if (scope === 'all') return trip.stages.flatMap((s) => photos.filter((p) => p.stageId === s.id).sort(byTime))
    return photos.filter((p) => p.stageId === scope).sort(byTime)
  }

  function fail(msg: string) { setPhase('error'); setErrorMsg(msg) }

  function finishRecording(chunks: BlobPart[]) {
    if (cancelled.current) return
    const blob = new Blob(chunks, { type: 'video/webm' })
    const url = URL.createObjectURL(blob)
    urlRef.current = url; setVideoUrl(url); setPhase('done'); setProgress(1)
    const a = document.createElement('a')
    a.href = url; a.download = `bbz-cannonball-${mode}-${scope === 'all' ? 'tour' : scope}.webm`
    document.body.appendChild(a); a.click(); a.remove()
  }

  function startRecorder(canvas: HTMLCanvasElement, audioStream?: MediaStream): { rec: MediaRecorder; chunks: BlobPart[] } {
    const video = canvas.captureStream(30)
    const tracks = [...video.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])]
    const merged = new MediaStream(tracks)
    streamsRef.current = [video, merged]
    const mime = pickMime()
    const rec = mime ? new MediaRecorder(merged, { mimeType: mime }) : new MediaRecorder(merged)
    recorderRef.current = rec
    const chunks: BlobPart[] = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    return { rec, chunks }
  }

  // ---------- EINFACH (Diashow, kein Ton) ----------
  async function buildSimple() {
    setPhase('working'); setSub('Rendere'); setProgress(0); setVideoUrl(null); setErrorMsg('')
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    const list = photosForScope()
    const frames: Array<{ img: HTMLImageElement; caption?: string; author: string; day: number }> = []
    for (const p of list) {
      try { frames.push({ img: await loadImage(smartCropUrl(p.url, W, H)), caption: p.caption, author: p.author, day: trip.stages.find((s) => s.id === p.stageId)?.day ?? 0 }) }
      catch { /* Bild ueberspringen */ }
    }
    if (cancelled.current) return
    if (!frames.length) return fail('Bilder konnten nicht geladen werden.')
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return fail('Canvas nicht verfügbar.')
    const { rec, chunks } = startRecorder(canvas)
    rec.onstop = () => { streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); finishRecording(chunks) }
    const slot = secs * 1000, INTRO = 1400, OUTRO = 1600
    const total = INTRO + frames.length * slot + OUTRO
    rec.start(); const t0 = performance.now()
    const tick = () => {
      if (cancelled.current) return
      const t = performance.now() - t0
      ctx.fillStyle = '#0E0D11'; ctx.fillRect(0, 0, W, H)
      if (t < INTRO) drawTitle(ctx, trip.title, trip.subtitle, dateRange(trip.startDate, trip.endDate), Math.min(1, ease(t / 500)))
      else if (t >= INTRO + frames.length * slot) drawTitle(ctx, 'Merci!', trip.title, trip.riders.join(' · '), Math.min(1, (t - INTRO - frames.length * slot) / 500))
      else {
        const local = t - INTRO, i = Math.min(frames.length - 1, Math.floor(local / slot)), into = local - i * slot, p = into / slot
        if (i > 0 && into < CROSS) drawCover(ctx, frames[i - 1].img, 1.08)
        const a = i > 0 ? Math.min(1, into / CROSS) : 1
        ctx.globalAlpha = a; drawCover(ctx, frames[i].img, 1 + 0.08 * p); ctx.globalAlpha = 1
        drawCaption(ctx, frames[i].day, frames[i].caption, frames[i].author, a)
      }
      setProgress(Math.min(1, t / total))
      if (t >= total) { try { rec.stop() } catch { /* egal */ } return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // ---------- KINO ----------
  async function buildCinema() {
    if (!musicFile) return fail('Bitte einen Musik-Track hochladen.')
    if (!AudioCtor) return fail('Audio wird von diesem Browser nicht unterstützt.')
    setPhase('working'); setProgress(0.02); setVideoUrl(null); setErrorMsg('')
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }

    // 1) Musik + Beats
    setSub('Musik & Beats')
    const audioCtx = new AudioCtor(); audioRef.current = audioCtx
    let buffer: AudioBuffer, beats: number[]
    try { const dec = await decodeAudioFile(musicFile, audioCtx); buffer = dec.buffer; const bi = await detectBeats(buffer); beats = bi.beats }
    catch { return fail('Musik konnte nicht gelesen werden.') }
    if (cancelled.current) return
    const musicDur = buffer.duration

    // 2) Fotos bewerten
    setSub('Analysiere Fotos')
    const list = photosForScope()
    const scored = await scorePhotos(list, comments, reactions, { useAI: useAI && aiReady, onProgress: (d, t) => setProgress(0.05 + 0.3 * (d / t)) })
    if (cancelled.current) return

    // 3) Kuratieren
    setSub('Kuratiere'); setProgress(0.38)
    const targetSec = target ?? Math.min(musicDur, 120)
    const groups = curate(scored, list, { perStageMax: 3, targetSeconds: targetSec })
    if (!groups.length) return fail('Keine geeigneten Fotos gefunden.')

    // Hero = global bestes Foto
    const hero = list.slice().sort((a, b) => (scored.get(b.id)?.total ?? 0) - (scored.get(a.id)?.total ?? 0))[0]
    const need = new Map<string, string>() // id -> url
    for (const g of groups) for (const p of g) need.set(p.id, smartCropUrl(p.url, W, H))
    if (hero) need.set(hero.id, smartCropUrl(hero.url, W, H))
    const imgs = new Map<string, HTMLImageElement>()
    await Promise.all([...need].map(async ([id, url]) => { try { imgs.set(id, await loadImage(url)) } catch { /* skip */ } }))
    if (cancelled.current) return

    // 4) Timeline aus Beats bauen
    const shots = buildTimeline(groups, scored, imgs, hero ? imgs.get(hero.id) : undefined, beats, musicDur)
    if (!shots.length) return fail('Zu wenig Material für den Kino-Schnitt.')

    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return fail('Canvas nicht verfügbar.')
    setSub('Rendere (Echtzeit)')

    const { source, dest } = createPlayback(audioCtx, buffer)
    const { rec, chunks } = startRecorder(canvas, dest.stream)
    rec.onstop = () => { streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); try { source.stop() } catch { /* egal */ } finishRecording(chunks) }
    const totalMs = shots[shots.length - 1].end
    rec.start()
    try { await audioCtx.resume() } catch { /* egal */ }
    try { source.start(0) } catch { /* egal */ }
    const t0 = performance.now()
    const tick = () => {
      if (cancelled.current) return
      const t = performance.now() - t0
      drawCinemaFrame(ctx, shots, t)
      setProgress(0.45 + 0.55 * Math.min(1, t / totalMs))
      if (t >= totalMs) { try { rec.stop() } catch { /* egal */ } return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const working = phase === 'working'
  const canBuild = mode === 'simple' ? stagesWithPhotos.length > 0 : !!musicFile

  return (
    <div onClick={working ? undefined : onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={sheet}>
        <div style={handle} />
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">Video erstellen</span>
        <h1 className="h1" style={{ fontSize: 21, marginTop: 6, marginBottom: 14 }}>Roadtrip-Video</h1>

        {!supported ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Dein Browser unterstützt die Videoaufnahme nicht (häufig iOS-Safari). Öffne das
            Fotobuch am Desktop (Chrome/Firefox), um ein Video zu erstellen.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <Chip active={mode === 'cinema'} onClick={() => setMode('cinema')} disabled={working}>Kino</Chip>
              <Chip active={mode === 'simple'} onClick={() => setMode('simple')} disabled={working}>Einfach</Chip>
            </div>

            <Label>Umfang</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              <Chip active={scope === 'all'} onClick={() => setScope('all')} disabled={working}>Ganze Tour</Chip>
              {stagesWithPhotos.map((s) => <Chip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)} disabled={working}>T{s.day}</Chip>)}
            </div>

            {mode === 'cinema' ? (
              <>
                <Label>Musik (Pflicht)</Label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: working ? 'default' : 'pointer' }}>
                  <span className="btn ghost" style={{ fontSize: 13 }}>Track wählen</span>
                  <span className="mono muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{musicFile ? musicFile.name : 'keine Datei'}</span>
                  <input type="file" accept="audio/*" disabled={working} onChange={(e) => setMusicFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>

                <Label>Ziel-Länge</Label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  <Chip active={target === null} onClick={() => setTarget(null)} disabled={working}>Auto</Chip>
                  <Chip active={target === 60} onClick={() => setTarget(60)} disabled={working}>60s</Chip>
                  <Chip active={target === 90} onClick={() => setTarget(90)} disabled={working}>90s</Chip>
                </div>

                {aiReady ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13 }}>
                    <input type="checkbox" checked={useAI} disabled={working} onChange={(e) => setUseAI(e.target.checked)} />
                    KI-Ästhetik (NIMA) für die Bildauswahl nutzen
                  </label>
                ) : (
                  <div className="mono muted" style={{ fontSize: 11, marginBottom: 16 }}>KI-Ästhetik: Heuristik-Modus (kein Modell geladen)</div>
                )}
              </>
            ) : (
              <>
                <Label>Sekunden pro Bild</Label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                  {SEC_OPTIONS.map((v) => <Chip key={v} active={secs === v} onClick={() => setSecs(v)} disabled={working}>{v}s</Chip>)}
                </div>
              </>
            )}

            {(working || phase === 'done') && (
              <>
                {working && <div className="mono muted" style={{ fontSize: 11, marginBottom: 6 }}>{sub}…</div>}
                <div style={{ height: 6, background: 'var(--ink-2)', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--signal)', transition: 'width .15s linear' }} />
                </div>
              </>
            )}
            {phase === 'error' && <p style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>}
            {videoUrl && phase === 'done' && <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 12, marginBottom: 14, background: '#000' }} />}

            <button className="btn" style={{ width: '100%' }} disabled={working || !canBuild} onClick={mode === 'cinema' ? buildCinema : buildSimple}>
              <IcFilm size={18} /> {working ? `${sub}… ${Math.round(progress * 100)}%` : phase === 'done' ? 'Erneut erstellen' : 'Video erstellen'}
            </button>
            {phase === 'done' && <div className="mono muted" style={{ fontSize: 11, marginTop: 8, textAlign: 'center' }}>Video heruntergeladen (.webm)</div>}
          </>
        )}
        <canvas ref={canvasRef} width={W} height={H} style={{ display: 'none' }} />
      </div>
    </div>
  )

  // ---- Timeline-Bau (nutzt trip/stats aus Closure) ----
  function buildTimeline(groups: Photo[][], scored: Map<string, ScoreEntry>, imgs: Map<string, HTMLImageElement>, hero: HTMLImageElement | undefined, beats: number[], musicDur: number): Shot[] {
    const shots: Shot[] = []
    let bi = 0
    const beatTime = (i: number) => (beats[Math.min(i, beats.length - 1)] ?? i * 0.5)
    const room = (hold: number) => bi + hold < beats.length && beatTime(bi + hold) < musicDur
    const push = (hold: number, make: (s: number, e: number) => Shot) => { const s = beatTime(bi) * 1000, e = beatTime(bi + hold) * 1000; shots.push(make(s, e)); bi += hold }

    push(6, (s, e) => ({ kind: 'title', start: s, end: e, big: trip.title, small: trip.subtitle, sub: dateRange(trip.startDate, trip.endDate), bg: hero }))

    for (const g of groups) {
      const stage = trip.stages.find((st) => st.id === g[0].stageId)
      if (!stage || !room(2)) break
      const route = `${stage.from} → ${stage.to}`
      const date = new Date(trip.startDate); date.setDate(date.getDate() + stage.day - 1)
      const dateStr = date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
      push(2, (s, e) => ({ kind: 'daycard', start: s, end: e, day: stage.day, route, date: dateStr }))
      if (room(5)) {
        const track = stage.track ?? [stage.start, stage.end]
        const passes = (stats[stage.id]?.passes ?? []).map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, altitude: p.altitude }))
        const fly = buildFlyover(track, passes, W, H)
        push(5, (s, e) => ({ kind: 'flyover', start: s, end: e, fly, day: stage.day, route }))
      }
      g.forEach((p, j) => {
        const img = imgs.get(p.id)
        if (!img || !room(1)) return
        const sc = scored.get(p.id)?.total ?? 0
        const hold = j === 0 || sc > 0.66 ? 2 : 1
        const hard = bi % 4 === 0
        push(hold, (s, e) => ({ kind: 'photo', start: s, end: e, img, caption: p.caption, author: p.author, day: stage.day, hard, punch: hard && sc > 0.6 }))
      })
    }

    if (room(6)) {
      const km = trip.stages.reduce((a, s) => a + (stats[s.id]?.km ?? s.plannedKm), 0)
      const all = collectPasses(stats)
      const top = all.reduce((m, p) => (p.altitude > m.altitude ? p : m), all[0] ?? { name: '—', altitude: 0 })
      push(6, (s, e) => ({ kind: 'stats', start: s, end: e, km, passes: all.length, col: `${top.name} · ${Math.round(top.altitude)} m` }))
    }
    if (room(4)) push(4, (s, e) => ({ kind: 'title', start: s, end: e, big: 'Merci!', small: trip.title, sub: trip.riders.join(' · ') }))
    return shots
  }

  function drawCinemaFrame(ctx: CanvasRenderingContext2D, shots: Shot[], t: number) {
    let i = shots.findIndex((s) => t >= s.start && t < s.end)
    if (i < 0) i = shots.length - 1
    const shot = shots[i]
    const dur = Math.max(1, shot.end - shot.start)
    const lp = Math.min(1, Math.max(0, (t - shot.start) / dur))
    ctx.fillStyle = '#0E0D11'; ctx.fillRect(0, 0, W, H)

    if (shot.kind === 'title') {
      const a = Math.min(1, ease(lp / 0.25)) * Math.min(1, ease((1 - lp) / 0.2 + 0.001))
      drawTitle(ctx, shot.big, shot.small, shot.sub, Math.max(0.15, a), shot.bg, 1 + 0.06 * lp)
    } else if (shot.kind === 'daycard') {
      const a = easeOut(lp / 0.25)
      ctx.globalAlpha = a
      ctx.fillStyle = '#FF8A3D'; ctx.font = '700 120px "Space Grotesk", system-ui, sans-serif'
      ctx.fillText(`Tag ${shot.day}`, 64, H / 2 - (1 - a) * 20)
      ctx.fillStyle = '#F2F1F5'; ctx.font = '600 44px "Space Grotesk", system-ui, sans-serif'
      ctx.fillText(clip(ctx, shot.route, W - 128), 64, H / 2 + 60)
      ctx.fillStyle = '#A8A6B2'; ctx.font = '400 26px "JetBrains Mono", ui-monospace, monospace'
      ctx.fillText(shot.date, 64, H / 2 + 110)
      ctx.globalAlpha = 1
    } else if (shot.kind === 'flyover') {
      drawFlyover(ctx, shot.fly, easeOut(lp))
      ctx.fillStyle = '#FF8A3D'; ctx.font = '700 26px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(`T${shot.day}`, 56, 64)
      ctx.fillStyle = '#F2F1F5'; ctx.font = '500 26px Inter, system-ui, sans-serif'; ctx.fillText(clip(ctx, shot.route, W - 200), 96, 64)
    } else if (shot.kind === 'stats') {
      const a = easeOut(lp / 0.3)
      ctx.globalAlpha = a; ctx.textAlign = 'center'
      ctx.fillStyle = '#A8A6B2'; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.fillText('DIE TOUR IN ZAHLEN', W / 2, 150)
      ctx.fillStyle = '#FF8A3D'; ctx.font = '700 96px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(`${shot.km} km`, W / 2, 300)
      ctx.fillStyle = '#F2F1F5'; ctx.font = '700 60px "Space Grotesk", system-ui, sans-serif'; ctx.fillText(`${shot.passes} Pässe`, W / 2, 400)
      ctx.fillStyle = '#6BD5E1'; ctx.font = '500 30px Inter, system-ui, sans-serif'; ctx.fillText(`höchster: ${shot.col}`, W / 2, 470)
      ctx.textAlign = 'left'; ctx.globalAlpha = 1
    } else {
      const prev = shots[i - 1]
      const crossing = prev && prev.kind === 'photo' && !shot.hard && (t - shot.start) < CROSS
      if (crossing && prev.kind === 'photo') drawCover(ctx, prev.img, 1.09)
      const a = crossing ? Math.min(1, (t - shot.start) / CROSS) : 1
      const punch = shot.punch && lp < 0.2 ? 1 + 0.12 * (1 - lp / 0.2) : 1
      ctx.globalAlpha = a
      ctx.filter = 'contrast(1.05) saturate(1.1)'
      drawCover(ctx, shot.img, (1 + 0.09 * lp) * punch)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      vignette(ctx)
      drawCaption(ctx, shot.day, shot.caption, shot.author, a)
    }
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="lbl" style={{ display: 'block', marginBottom: 8, color: 'var(--mist)', fontSize: 11 }}>{children}</span>
}
function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: active ? 'var(--signal)' : 'var(--ink-2)', color: active ? '#1a0e04' : 'var(--snow)',
      border: `0.5px solid ${active ? 'var(--signal)' : 'var(--slate)'}`, borderRadius: 999, padding: '8px 14px',
      fontSize: 13, fontWeight: active ? 700 : 400, cursor: disabled ? 'default' : 'pointer', opacity: disabled && !active ? 0.6 : 1,
    }}>{children}</button>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(8,7,10,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const sheet: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 'var(--shell)', background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))', maxHeight: '90vh', overflowY: 'auto' }
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
const closeBtn: React.CSSProperties = { position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 6 }
