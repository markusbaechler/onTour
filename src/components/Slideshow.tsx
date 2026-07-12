import { useEffect, useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { TRACKS, trackUrl } from '../lib/music'
import { IcX, IcPlay } from './Icons'
import type { Photo } from '../types'

// EIGENSTAeNDIGE Diashow: ein Tap -> Vollbild, ALLE uebergebenen Fotos laufen automatisch mit
// Musik. Keine Kopplung ans Video-Studio, keine Kuratierung/Scores/Storyboard.

interface Props {
  photos: Photo[]
  title?: string
  onClose: () => void
}

const PHOTO_SEC = 2.5, TITLE_SEC = 1.5, CROSS = 0.5
const KB = ['sbp-kb-in', 'sbp-kb-out', 'sbp-kb-l', 'sbp-kb-r']

type Slide =
  | { type: 'photo'; photo: Photo; day?: number; start: number; end: number; kb: string }
  | { type: 'title'; day?: number; route: string; start: number; end: number }

export function Slideshow({ photos, title, onClose }: Props) {
  const slides = useMemo<Slide[]>(() => {
    const dayOf = (p: Photo) => trip.stages.find((s) => s.id === p.stageId)?.day
    const sorted = [...photos].sort((a, b) => (((dayOf(a) ?? 99) - (dayOf(b) ?? 99)) || a.createdAt.localeCompare(b.createdAt)))
    const out: Slide[] = []
    let t = 0, lastDay: number | undefined | null = null, kbi = 0
    for (const p of sorted) {
      const day = dayOf(p)
      if (day !== lastDay) {
        const st = trip.stages.find((s) => s.id === p.stageId)
        out.push({ type: 'title', day, route: st ? `${st.from} → ${st.to}` : '', start: t, end: t + TITLE_SEC })
        t += TITLE_SEC; lastDay = day
      }
      out.push({ type: 'photo', photo: p, day, start: t, end: t + PHOTO_SEC, kb: KB[kbi++ % KB.length] })
      t += PHOTO_SEC
    }
    return out
  }, [photos])
  const total = slides.length ? slides[slides.length - 1].end : 0

  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [ended, setEnded] = useState(false)
  const [muted, setMuted] = useState(false)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [audioSrc, setAudioSrc] = useState(() => trackUrl(import.meta.env.BASE_URL, TRACKS[0]))
  const raf = useRef<number | null>(null)
  const startRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number | null>(null)
  const touchX = useRef<number | null>(null)

  const fadeTo = (target: number, ms: number) => {
    const a = audioRef.current; if (!a) return
    if (fadeRef.current) window.clearInterval(fadeRef.current)
    const from = a.volume, steps = Math.max(1, Math.round(ms / 50)); let i = 0
    fadeRef.current = window.setInterval(() => { i++; a.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps))); if (i >= steps && fadeRef.current) { window.clearInterval(fadeRef.current); fadeRef.current = null } }, 50)
  }

  // Uhr
  useEffect(() => {
    if (!playing) { if (raf.current) cancelAnimationFrame(raf.current); return }
    startRef.current = performance.now() - t * 1000
    const loop = () => {
      const now = (performance.now() - startRef.current) / 1000
      if (now >= total) { setT(total); setPlaying(false); setEnded(true); fadeTo(0, 500); return }
      setT(now); raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // Musik: beim Oeffnen starten (User-Tap = Autoplay ok), Fade-in
  useEffect(() => {
    const a = audioRef.current; if (a) { a.volume = 0; void a.play().catch(() => {}); fadeTo(1, 1500) }
    return () => { if (fadeRef.current) window.clearInterval(fadeRef.current); audioRef.current?.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Play/Pause + Ende an die Musik koppeln
  useEffect(() => { const a = audioRef.current; if (!a) return; if (playing && !ended) void a.play().catch(() => {}); else a.pause() }, [playing, ended])
  useEffect(() => { const a = audioRef.current; if (a) a.muted = muted }, [muted])
  useEffect(() => { if (playing && !ended) audioRef.current?.play().catch(() => {}) /* eslint-disable-next-line */ }, [audioSrc])

  const close = () => { audioRef.current?.pause(); onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') seek(-1); else if (e.key === 'ArrowRight') seek(1); else if (e.key === ' ') setPlaying((v) => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, t, ended])

  const seekTo = (target: number) => { const c = Math.max(0, Math.min(total, target)); setT(c); startRef.current = performance.now() - c * 1000; setEnded(false) }
  const curIndex = Math.max(0, slides.findIndex((s) => t >= s.start && t < s.end))
  // Bei 2.5s-Takt die naechsten ZWEI Fotos vorladen -> kein Crossfade auf ein ladendes Bild.
  useEffect(() => {
    let n = 0
    for (let k = curIndex + 1; k < slides.length && n < 2; k++) { const s = slides[k]; if (s.type === 'photo') { const im = new Image(); im.src = s.photo.url; n++ } }
  }, [curIndex, slides])
  const seek = (dir: -1 | 1) => { const i = curIndex; if (dir < 0) seekTo(slides[Math.max(0, i - 1)]?.start ?? 0); else seekTo(i + 1 < slides.length ? slides[i + 1].start : total) }
  const restart = () => { setEnded(false); seekTo(0); setPlaying(true); const a = audioRef.current; if (a) { a.volume = 0; void a.play().catch(() => {}); fadeTo(1, 800) } }
  const center = () => { if (ended) restart(); else setPlaying((v) => !v) }

  if (!slides.length) return null
  const cur = slides[curIndex]
  const crossActive = curIndex + 1 < slides.length && cur.end - t < CROSS
  const nextAlpha = crossActive ? 1 - (cur.end - t) / CROSS : 0

  const renderSlide = (s: Slide, key: string, opacity: number) => {
    const dur = s.end - s.start
    if (s.type === 'photo' && !failed.has(s.photo.id)) return (
      <img key={key} className={`sbp-img ${s.kb}`} style={{ animationDuration: `${dur}s`, opacity }} src={s.photo.url} alt=""
        onError={() => setFailed((f) => new Set(f).add((s as { photo: Photo }).photo.id))} />
    )
    return (
      <div key={key} style={{ position: 'absolute', inset: 0, background: 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10%', opacity }}>
        {s.type === 'title' && <>
          <div className="sbp-eyebrow">{s.day ? `Tag ${s.day}` : ''}</div>
          <div className="sbp-title">{s.day ? `T${s.day}` : ''}</div>
          <div className="sbp-sub">{s.route}</div>
        </>}
      </div>
    )
  }

  return (
    <div style={overlay}>
      {/* Fortschritt oben */}
      <div style={progRow}>
        {slides.map((s, i) => (
          <span key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: 'rgba(242,241,245,.25)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', background: 'var(--snow)', width: `${i < curIndex ? 100 : i === curIndex ? Math.min(100, ((t - s.start) / Math.max(0.001, s.end - s.start)) * 100) : 0}%` }} />
          </span>
        ))}
      </div>

      <div style={{ position: 'absolute', inset: 0 }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => { if (touchX.current == null) return; const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 45) seek(dx < 0 ? 1 : -1); touchX.current = null }}
      >
        {renderSlide(cur, `slide-${curIndex}`, 1)}
        {crossActive && renderSlide(slides[curIndex + 1], `slide-${curIndex + 1}`, nextAlpha)}

        {/* Caption */}
        {cur.type === 'photo' && !failed.has(cur.photo.id) && (
          <div className="sbp-caption">
            {cur.day != null && <span className="sbp-cap-day">T{cur.day}</span>}
            {cur.photo.caption && <div className="sbp-cap-text">{cur.photo.caption}</div>}
            <div className="sbp-cap-author">{cur.photo.author}</div>
          </div>
        )}

        {/* Tap-Zonen: links zurueck, Mitte Pause/Play, rechts vor */}
        <button aria-label="Zurück" onClick={() => seek(-1)} style={zone(0)} />
        <button aria-label={playing ? 'Pause' : 'Play'} onClick={center} style={zone(1)} />
        <button aria-label="Weiter" onClick={() => seek(1)} style={zone(2)} />
      </div>

      {title && <div style={titleTag}>{title}</div>}
      <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Ton an' : 'Ton aus'} style={{ ...hudBtn, left: 12 }}>{muted ? '🔇' : '🔊'}</button>
      <button onClick={close} aria-label="Schliessen" style={{ ...hudBtn, right: 12 }}><IcX size={22} /></button>
      {!playing && !ended && <div style={pausePill}>Pause</div>}

      {ended && (
        <div style={endCard}>
          <div className="sbp-title" style={{ fontSize: 34 }}>Diashow zu Ende</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn" onClick={restart}><IcPlay size={18} /> Nochmal</button>
            <button className="btn ghost" onClick={close}>Schliessen</button>
          </div>
        </div>
      )}

      <audio ref={audioRef} src={audioSrc} loop preload="auto" onError={() => setAudioSrc(trackUrl(import.meta.env.BASE_URL, TRACKS[1]))} />
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 95, background: '#000', overflow: 'hidden' }
const progRow: React.CSSProperties = { position: 'absolute', top: 8, left: 0, right: 0, zIndex: 4, display: 'flex', gap: 3, padding: '0 12px' }
function zone(pos: 0 | 1 | 2): React.CSSProperties {
  return { position: 'absolute', top: 0, bottom: 0, left: `${pos * 33.34}%`, width: '33.33%', background: 'none', border: 'none', cursor: 'pointer', zIndex: 3 }
}
const hudBtn: React.CSSProperties = { position: 'absolute', top: 12, zIndex: 5, background: 'rgba(14,13,17,.7)', border: '0.5px solid var(--slate)', borderRadius: 10, color: 'var(--snow)', padding: 8, display: 'flex', cursor: 'pointer', fontSize: 16 }
const titleTag: React.CSSProperties = { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 5, color: 'var(--snow)', fontSize: 13, fontFamily: 'var(--font-mono)', background: 'rgba(14,13,17,.6)', padding: '4px 10px', borderRadius: 999 }
const pausePill: React.CSSProperties = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 4, color: 'var(--snow)', fontFamily: 'var(--font-mono)', fontSize: 13, background: 'rgba(14,13,17,.6)', padding: '6px 14px', borderRadius: 999, pointerEvents: 'none' }
const endCard: React.CSSProperties = { position: 'absolute', inset: 0, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,7,10,.86)' }
