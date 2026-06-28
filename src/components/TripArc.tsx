import { fmt } from '../lib/format'

interface Props {
  ridden: boolean[] // je Etappe gefahren?
  todayIndex: number // 0-basierte Etappe von heute, sonst -1
  dayLabel: string // z. B. "Tag 3/7" oder "Start in 6 Tagen"
  statusLabel: string // z. B. "heute", "Start 04.07.", "fertig"
  gefahrenKm: number
  totalKm: number
}

const P0: [number, number] = [12, 50]
const P1: [number, number] = [150, 12]
const P2: [number, number] = [288, 50]

function point(t: number): [number, number] {
  const u = 1 - t
  return [
    u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0],
    u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1],
  ]
}

/** Trip-Arc: Fortschrittsbogen mit einem Punkt je Etappe, „heute" markiert. */
export function TripArc({ ridden, todayIndex, dayLabel, statusLabel, gefahrenKm, totalKm }: Props) {
  const n = ridden.length
  const f = totalKm > 0 ? Math.min(1, gefahrenKm / totalKm) : 0
  const arcPath = `M${P0[0]},${P0[1]} Q${P1[0]},${P1[1]} ${P2[0]},${P2[1]}`

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <span className="eyebrow">Fortschritt</span>
          <div className="disp" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{dayLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--signal)' }}>{fmt(gefahrenKm)}</span>
            <span className="muted"> / {fmt(totalKm)} km</span>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{statusLabel}</div>
        </div>
      </div>

      <svg viewBox="0 0 300 58" style={{ width: '100%', height: 50, display: 'block', overflow: 'visible' }} aria-hidden="true">
        <path d={arcPath} fill="none" stroke="var(--slate-strong)" strokeWidth="3" strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray={`${f} 1`} />
        {ridden.map((done, i) => {
          const t = n > 1 ? i / (n - 1) : 0
          const [x, y] = point(t)
          const today = i === todayIndex
          return (
            <g key={i}>
              {today && <circle cx={x} cy={y} r={9} fill="none" stroke="var(--glacier)" strokeWidth="2" opacity={0.5} />}
              <circle cx={x} cy={y} r={today ? 5 : 4} fill={today ? 'var(--glacier)' : done ? 'var(--signal)' : 'var(--ink-2)'} stroke={done || today ? 'none' : 'var(--slate-strong)'} strokeWidth="1.5" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
