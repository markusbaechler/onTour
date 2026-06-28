import { fmt, km as fmtKm, hm as fmtHm } from '../lib/format'
import { IcX } from './Icons'
import type { StageStats } from '../lib/passes'
import type { Stage } from '../types'

interface Props {
  stage: Stage
  stats?: StageStats
  onClose: () => void
}

/** Bottom-Sheet mit gefuelltem Hoehenprofil aus GPX + Kennzahlen (keine Bewertung). */
export function ProfileModal({ stage, stats, onClose }: Props) {
  const profile = stats?.profile ?? []
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={sheet}>
        <div style={handle} />
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">Höhenprofil · T{stage.day}</span>
        <h1 className="h1" style={{ fontSize: 21, marginTop: 6, marginBottom: 14 }}>{stage.from} → {stage.to}</h1>

        <ProfileChart profile={profile} />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Stat value={`${fmtKm(stats?.km ?? stage.plannedKm)}`} label="Distanz" />
          <Stat value={`${fmtHm(stats?.ascent ?? stage.plannedAscent)}`} label="Anstieg" accent="var(--glacier)" />
          <Stat value={`${fmt(stats?.highest ?? 0)} m`} label="Höchster" />
          <Stat value={`${stats?.passes.length ?? 0}`} label="Pässe" accent="var(--signal)" />
        </div>
      </div>
    </div>
  )
}

function ProfileChart({ profile, height = 140 }: { profile: { d: number; e: number }[]; height?: number }) {
  if (profile.length < 2) return <div style={{ height, background: 'var(--ink-2)', borderRadius: 12 }} />
  const w = 320
  const es = profile.map((p) => p.e)
  const min = Math.min(...es)
  const max = Math.max(...es)
  const range = max - min || 1
  const x = (i: number) => (i / (profile.length - 1)) * w
  const y = (e: number) => height - ((e - min) / range) * (height - 16) - 8
  const line = profile.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.e).toFixed(1)}`).join(' ')
  const area = `${line} L${w},${height} L0,${height} Z`
  return (
    <div style={{ position: 'relative', background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 12, padding: '6px 0 0' }}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id="prof-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,138,61,.30)" />
            <stop offset="1" stopColor="rgba(255,138,61,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#prof-fill)" />
        <path d={line} fill="none" stroke="var(--signal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="mono muted" style={{ position: 'absolute', top: 6, left: 10, fontSize: 10 }}>{fmt(max)} m</span>
      <span className="mono muted" style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 10 }}>{fmt(min)} m</span>
    </div>
  )
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="stat" style={{ textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: accent }}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,7,10,.7)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
}
const sheet: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 'var(--shell)',
  background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)',
  borderRadius: '20px 20px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))',
}
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
const closeBtn: React.CSSProperties = { position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 6 }
