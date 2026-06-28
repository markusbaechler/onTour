import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'
import { fmt } from '../lib/format'

interface Props {
  base: string
  title: string
  subtitle: string
  days: number
  km: number
  passes: number
  riders: string[]
  onEnter: () => void
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const h = () => setReduce(m.matches)
    m.addEventListener?.('change', h)
    return () => m.removeEventListener?.('change', h)
  }, [])
  return reduce
}

/**
 * Vollbild-Intro vor der App. Hintergrund-Foto mit Ken-Burns + Verlauf, Parallax
 * (Hintergrund langsamer als Text) ueber Scroll-/Touch-Eingabe -> progress 0..1,
 * nur transform/opacity. Runterscrollen/Swipe oder Tap/Pfeil blendet in die App.
 * Erscheint nur einmal pro Session. prefers-reduced-motion: statisch, sofort rein.
 */
export function Hero({ base, title, subtitle, days, km, passes, riders, onEnter }: Props) {
  const reduce = usePrefersReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const acc = useRef(0)
  const leftRef = useRef(false)
  const touchY = useRef<number | null>(null)

  function dismiss() {
    if (leftRef.current) return
    leftRef.current = true
    setLeaving(true)
    try { sessionStorage.setItem('hero-seen', '1') } catch { /* ignore */ }
    window.setTimeout(onEnter, reduce ? 0 : 450)
  }

  function advance(delta: number) {
    if (reduce) { dismiss(); return }
    acc.current = Math.min(1, Math.max(0, acc.current + delta))
    setProgress(acc.current)
    if (acc.current >= 0.82) dismiss()
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); advance(e.deltaY / 650) }
    const onTouchStart = (e: TouchEvent) => { touchY.current = e.touches[0].clientY }
    const onTouchMove = (e: TouchEvent) => {
      if (touchY.current == null) return
      const dy = touchY.current - e.touches[0].clientY
      touchY.current = e.touches[0].clientY
      if (dy > 0) e.preventDefault()
      advance(dy / 420)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  const p = reduce ? 0 : progress
  const bgY = p * -55 // Hintergrund langsamer
  const contentY = p * -150 // Text schneller
  const contentOpacity = 1 - p * 1.1

  return (
    <div
      ref={ref}
      onClick={dismiss}
      role="button"
      aria-label="In die App"
      style={{
        position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden', background: 'var(--ink)',
        opacity: leaving ? 0 : 1, transition: 'opacity .45s ease', cursor: 'pointer', touchAction: 'none',
      }}
    >
      {/* Hintergrund (Parallax langsam) */}
      <div style={{ position: 'absolute', inset: 0, transform: `translate3d(0, ${bgY}px, 0)`, willChange: 'transform' }}>
        <img
          className={reduce ? undefined : 'hero-kenburns'}
          src={`${base}hero.jpg`}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none' }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(8,7,10,.20) 0%, rgba(8,7,10,.30) 42%, rgba(14,13,17,.94) 100%)' }} />
      </div>

      {/* Inhalt (Parallax schnell) */}
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', padding: '0 22px 11vh',
          maxWidth: 'var(--shell)', margin: '0 auto',
          transform: `translate3d(0, ${contentY}px, 0)`, opacity: Math.max(0, contentOpacity),
          willChange: 'transform, opacity',
        }}
      >
        <span className="eyebrow">{subtitle}</span>
        <h1 className="disp" style={{ fontWeight: 700, fontSize: 'clamp(34px, 11vw, 52px)', letterSpacing: '-0.5px', margin: '8px 0 12px', lineHeight: 1.02 }}>{title}</h1>
        <div className="mono" style={{ fontSize: 14, color: 'var(--snow)', letterSpacing: 0.3 }}>
          {days} Tage <span style={{ color: 'var(--mist)' }}>·</span> {fmt(km)} km <span style={{ color: 'var(--mist)' }}>·</span> {passes} Pässe
        </div>

        {/* 3 Fahrer als ueberlappende Punkte */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
          {riders.map((r, i) => (
            <div key={r} style={{ marginLeft: i ? -10 : 0, border: '2px solid var(--ink)', borderRadius: '50%', display: 'flex' }}>
              <Avatar name={r} size={34} />
            </div>
          ))}
          <span className="mono muted" style={{ fontSize: 12, marginLeft: 10 }}>{riders.join(' · ')}</span>
        </div>
      </div>

      {/* Reinscrollen-Pfeil */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '3vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--snow)', opacity: Math.max(0, 1 - p * 2), pointerEvents: 'none' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: 2, color: 'var(--mist)' }}>REINSCROLLEN</span>
        <svg className={reduce ? undefined : 'hero-arrow-bounce'} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}
