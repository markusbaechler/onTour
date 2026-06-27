import { useMemo } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { IcCheck, IcCircle, IcRoute } from '../components/Icons'
import { fmt, km, hm, dateRange } from '../lib/format'
import { actualFor } from '../lib/store'
import type { Actual } from '../types'

export function Overview({ actuals, onOpenStage }: { actuals: Actual[]; onOpenStage: (id: string) => void }) {
  const totals = useMemo(() => {
    const km_ = trip.stages.reduce((s, x) => s + x.plannedKm, 0)
    const hm_ = trip.stages.reduce((s, x) => s + x.plannedAscent, 0)
    const cols = trip.stages.reduce((s, x) => s + x.cols.length, 0)
    return { km_, hm_, cols }
  }, [])

  const ridden = actuals.filter((a) => a.ridden).length

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <span className="eyebrow">{trip.title} · {trip.subtitle}</span>
        <IcRoute size={20} />
      </div>

      <h1 className="h1">{trip.title}</h1>
      <p className="muted" style={{ margin: '6px 0 16px' }}>
        {dateRange(trip.startDate, trip.endDate)} · {trip.riders.length} Fahrer
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div className="stat"><div className="num" style={{ color: 'var(--signal)' }}>{fmt(totals.km_)}</div><div className="lbl">Kilometer</div></div>
        <div className="stat"><div className="num" style={{ color: 'var(--glacier)' }}>{fmt(totals.hm_)}</div><div className="lbl">Höhenmeter</div></div>
        <div className="stat"><div className="num">{totals.cols}</div><div className="lbl">Cols</div></div>
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
          const top = s.cols.reduce((m, c) => (c.altitude > m.altitude ? c : m), s.cols[0])
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
