import type { ProfilePoint } from '../lib/passes'

/** Gefuelltes Mini-Hoehenprofil (Sparkline) aus GPX-Profildaten. */
export function Sparkline({ profile, height = 44 }: { profile: ProfilePoint[]; height?: number }) {
  if (profile.length < 2) return <div style={{ height, background: 'var(--ink-2)', borderRadius: 8 }} />
  const w = 300
  const es = profile.map((p) => p.e)
  const min = Math.min(...es)
  const range = Math.max(...es) - min || 1
  const pts = profile.map((p, i) => {
    const x = (i / (profile.length - 1)) * w
    const y = height - ((p.e - min) / range) * (height - 6) - 3
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,138,61,.35)" />
          <stop offset="1" stopColor="rgba(255,138,61,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="var(--signal)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
