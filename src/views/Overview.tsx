import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { Avatar } from '../components/Avatar'
import { IdentityPicker } from '../components/IdentityPicker'
import { IcCheck, IcCircle } from '../components/Icons'
import { fmt, km, hm, dateRange } from '../lib/format'
import { actualFor } from '../lib/store'
import type { StageStats } from '../lib/passes'
import type { Actual } from '../types'

interface Props {
  actuals: Actual[]
  stats: Record<string, StageStats>
  onOpenStage: (id: string) => void
  viewerName: string
  onChangeName: (name: string) => void
}

export function Overview({ actuals, stats, onOpenStage, viewerName, onChangeName }: Props) {
  const [switching, setSwitching] = useState(false)
  // Distanz/Hoehe/Pass-Anzahl aus dem GPX (sobald geladen), sonst Soll aus trip.ts.
  const totals = useMemo(() => {
    const ready = trip.stages.every((s) => stats[s.id])
    if (ready) return {
      km_: trip.stages.reduce((a, s) => a + stats[s.id].km, 0),
      hm_: trip.stages.reduce((a, s) => a + stats[s.id].ascent, 0),
      cols: trip.stages.reduce((a, s) => a + stats[s.id].passes.length, 0),
    }
    return {
      km_: trip.stages.reduce((s, x) => s + x.plannedKm, 0),
      hm_: trip.stages.reduce((s, x) => s + x.plannedAscent, 0),
      cols: trip.stages.reduce((s, x) => s + x.cols.length, 0),
    }
  }, [stats])

  const ridden = actuals.filter((a) => a.ridden).length

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 18 }}>
        <span className="eyebrow">{trip.title} · {trip.subtitle}</span>
        <button
          onClick={() => setSwitching(true)}
          aria-label="Identität wechseln"
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 999, padding: '4px 10px 4px 4px', color: 'var(--snow)', cursor: 'pointer' }}
        >
          <Avatar name={viewerName} size={22} />
          <span style={{ fontSize: 12, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewerName}</span>
        </button>
      </div>

      {switching && (
        <IdentityPicker
          current={viewerName}
          onPick={(n) => { onChangeName(n); setSwitching(false) }}
          onClose={() => setSwitching(false)}
        />
      )}

      <h1 className="h1">{trip.title}</h1>
      <p className="muted" style={{ margin: '6px 0 16px' }}>
        {dateRange(trip.startDate, trip.endDate)} · {trip.riders.length} Fahrer
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="stat"><div className="num" style={{ color: 'var(--signal)' }}>{fmt(totals.km_)}</div><div className="lbl">Kilometer</div></div>
        <div className="stat"><div className="num" style={{ color: 'var(--glacier)' }}>{fmt(totals.hm_)}</div><div className="lbl">Höhenmeter</div></div>
        <div className="stat"><div className="num">{totals.cols}</div><div className="lbl">Pässe</div></div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <MapView stages={trip.stages} height={240} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="h2">Etappen</span>
        <span className="muted" style={{ fontSize: 12 }}>{ridden}/{trip.stages.length} gefahren</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trip.stages.map((s) => {
          const a = actualFor(actuals, s.id)
          const passes = stats[s.id]?.passes
          const top = passes?.length
            ? passes.reduce((m, p) => (p.altitude > m.altitude ? p : m))
            : (s.cols.length ? s.cols.reduce((m, c) => (c.altitude > m.altitude ? c : m), s.cols[0]) : undefined)
          return (
            <button key={s.id} className="row" onClick={() => onOpenStage(s.id)}>
              <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 12 }}>T{s.day}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.from} → {s.to}
                </div>
                <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{km(s.plannedKm)} · {hm(s.plannedAscent)}</div>
              </div>
              {top && <ColBadge col={top} />}
              {a?.ridden ? <IcCheck size={18} /> : <IcCircle size={18} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
