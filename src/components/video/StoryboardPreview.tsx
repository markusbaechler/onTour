import { useEffect, useMemo, useRef, useState } from 'react'
import { flatten, type Storyboard } from '../../lib/storyboard'
import { smartCropUrl } from '../../lib/cloudinaryCrop'
import { TRACKS, trackUrl } from '../../lib/music'
import { IcX, IcPlay } from '../Icons'
import type { Photo } from '../../types'

interface Props {
  storyboard: Storyboard
  photos: Photo[]
  musicUrl?: string
  musicLabel?: string
  base?: string
  onClose: () => void
}

const KB_CLASS: Record<string, string> = { in: 'sbp-kb-in', out: 'sbp-kb-out', l: 'sbp-kb-l', r: 'sbp-kb-r' }

/** DOM-Vorschau: echte <img>-Sequenz mit CSS-Ken-Burns + Caption/Titelkarten, synchron zu <audio>. */
export function StoryboardPreview({ storyboard, photos, musicUrl, musicLabel, base, onClose }: Props) {
  const items = useMemo(() => flatten(storyboard, photos), [storyboard, photos])
  const total = storyboard.totalSeconds
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [audioSrc, setAudioSrc] = useState(musicUrl)
  const [trackIdx, setTrackIdx] = useState(-1) // -1 = uebergebener Track (musicLabel)
  const raf = useRef<number | null>(null)
  const start = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const curTrackLabel = trackIdx >= 0 ? TRACKS[trackIdx].label : (musicLabel ?? 'Musik')
  const cycleTrack = () => { if (!base) return; const next = (trackIdx + 1) % TRACKS.length; setTrackIdx(next); setAudioSrc(trackUrl(base, TRACKS[next])) }
  // Track gewechselt -> neue Quelle weiterspielen
  useEffect(() => { if (playing) audioRef.current?.play().catch(() => {}) /* eslint-disable-next-line */ }, [audioSrc])
  const previewCrop = storyboard.aspect === '9:16' ? { w: 720, h: 1280 } : { w: 1280, h: 720 }

  useEffect(() => {
    if (!playing) { if (raf.current) cancelAnimationFrame(raf.current); return }
    start.current = performance.now() - t * 1000
    const audio = audioRef.current
    if (audio) { try { audio.currentTime = t % (audio.duration || total || 1) } catch { /* egal */ } void audio.play().catch(() => {}) }
    const loop = () => {
      const now = (performance.now() - start.current) / 1000
      if (now >= total) { setT(total); setPlaying(false); audioRef.current?.pause(); return }
      setT(now)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  const idx = Math.max(0, items.findIndex((it) => t >= it.start && t < it.end))
  const item = items[idx] ?? items[items.length - 1]
  const dur = item ? item.end - item.start : 1
  const isPhoto = item?.kind === 'photo' && item.photo && !failed.has(item.photo.id)

  const toggle = () => {
    if (t >= total) { setT(0); setPlaying(true); return }
    setPlaying((v) => !v)
  }

  return (
    <div style={overlay}>
      <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={22} /></button>
      <div className="sbp-stage" style={{ aspectRatio: storyboard.aspect === '9:16' ? '9 / 16' : '16 / 9' }}>
        {isPhoto && item?.photo ? (
          <img
            key={idx}
            className={`sbp-img ${KB_CLASS[item.kenBurns ?? 'in']}`}
            style={{ animationDuration: `${dur}s` }}
            src={smartCropUrl(item.photo.url, previewCrop.w, previewCrop.h)}
            alt=""
            onError={() => item.photo && setFailed((s) => new Set(s).add(item.photo!.id))}
          />
        ) : (
          <div className="sbp-titlecard">
            {item?.stats && <div className="sbp-eyebrow">{item.day ? `Tag ${item.day}` : ''}</div>}
            <div className="sbp-title">{item?.title}</div>
            {item?.subtitle && <div className="sbp-sub">{item.subtitle}</div>}
            {item?.stats && <div className="sbp-stats">{item.stats}</div>}
          </div>
        )}

        {item?.overlayTitle && (
          <div className="sbp-introcard">
            <div className="sbp-eyebrow">{item.subtitle}</div>
            <div className="sbp-title" style={{ fontSize: 40 }}>{item.title}</div>
          </div>
        )}

        {isPhoto && (item?.caption || item?.day != null) && (
          <div className="sbp-caption">
            {item?.day != null && <span className="sbp-cap-day">T{item.day}</span>}
            {item?.caption && <div className="sbp-cap-text">{item.caption}</div>}
            {item?.photo && <div className="sbp-cap-author">{item.photo.author}</div>}
          </div>
        )}
      </div>

      <div style={{ width: 'min(92vw, 420px)', marginTop: 14 }}>
        <div style={{ height: 4, background: 'var(--slate)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${(t / (total || 1)) * 100}%`, height: '100%', background: 'var(--signal)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <button className="btn ghost" onClick={toggle} style={{ minHeight: 40 }}>
            <IcPlay size={16} /> {t >= total ? 'Nochmal' : playing ? 'Pause' : 'Play'}
          </button>
          {base && (
            <button onClick={cycleTrack} className="pill" style={{ background: 'var(--ink-2)', cursor: 'pointer' }} title="Track wechseln">
              ♪ {curTrackLabel.length > 18 ? curTrackLabel.slice(0, 17) + '…' : curTrackLabel}
            </button>
          )}
          <span className="mono muted" style={{ fontSize: 12 }}>{t.toFixed(1)} / {total.toFixed(1)} s</span>
        </div>
      </div>

      {audioSrc && <audio ref={audioRef} src={audioSrc} loop preload="auto" />}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 90, background: 'var(--ink)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: 'max(16px, env(safe-area-inset-top)) 16px',
}
const closeBtn: React.CSSProperties = { position: 'absolute', top: 12, right: 12, background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 10, color: 'var(--snow)', padding: 8, display: 'flex', cursor: 'pointer' }
