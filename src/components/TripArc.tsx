import { fmt } from '../lib/format'

interface Props {
  ridden: boolean[] // je Etappe gefahren?
  todayIndex: number // 0-basierte Etappe von heute, sonst -1
  dayLabel: string // z. B. "Tag 3/7" oder "Start in 6 Tagen"
  statusLabel: string // z. B. "heute", "Start 04.07.", "fertig"
  gefahrenKm: number
  totalKm: number
}

const P0: [number, number] = [14, 84]
const P1: [number, number] = [150, 8]
const P2: [number, number] = [286, 84]

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
    <div className="card" style={{ background: 'var(--ink-raised)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div>
          <span className="eyebrow">Fortschritt</span>
          <div className="disp" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{dayLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
            <span style={{ color: 'var(--signal)' }}>{fmt(gefahrenKm)}</span>
            <span className="muted"> / {fmt(totalKm)} km</span>
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{statusLabel}</div>
        </div>
      </div>

      <svg viewBox="0 0 300 96" style={{ width: '100%', height: 84, display: 'block', overflow: 'visible' }} aria-hidden="true">
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
