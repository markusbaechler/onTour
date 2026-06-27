import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { RiddenToggle } from '../components/RiddenToggle'
import { fmt, km, hm } from '../lib/format'
import { actualFor } from '../lib/store'
import type { Actual } from '../types'

function Delta({ planned, actual, unit }: { planned: number; actual?: number; unit: string }) {
  if (actual == null) return <span className="muted mono" style={{ fontSize: 12 }}>–</span>
  const d = actual - planned
  const cls = Math.abs(d) < planned * 0.03 ? 'plan' : d > 0 ? 'warn' : 'ok'
  return (
    <span className={`pill ${cls}`}>
      {d > 0 ? '+' : ''}{fmt(d)} {unit}
    </span>
  )
}

export function SollIst({ actuals, onUpsert }: { actuals: Actual[]; onUpsert: (a: Actual) => void }) {
  const [edit, setEdit] = useState<string | null>(null)

  const setRidden = (stageId: string, ridden: boolean) => {
    const prev = actualFor(actuals, stageId)
    onUpsert({ ...prev, stageId, ridden })
  }

  const totals = useMemo(() => {
    const pKm = trip.stages.reduce((s, x) => s + x.plannedKm, 0)
    const pHm = trip.stages.reduce((s, x) => s + x.plannedAscent, 0)
    const aKm = trip.stages.reduce((s, x) => s + (actualFor(actuals, x.id)?.actualKm ?? 0), 0)
    const aHm = trip.stages.reduce((s, x) => s + (actualFor(actuals, x.id)?.actualAscent ?? 0), 0)
    return { pKm, pHm, aKm, aHm }
  }, [actuals])

  return (
    <div className="view">
      <span className="eyebrow">Soll · Ist</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 16 }}>Plan gegen Realität</h1>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Distanz Ist / Soll</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: 'var(--signal)' }}>{fmt(totals.aKm)}</span>
            <span className="muted"> / {fmt(totals.pKm)}</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Höhe Ist / Soll</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
            <span style={{ color: 'var(--glacier)' }}>{fmt(totals.aHm)}</span>
            <span className="muted"> / {fmt(totals.pHm)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trip.stages.map((s) => {
          const a = actualFor(actuals, s.id)
          const isEdit = edit === s.id
          return (
            <div key={s.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  <span className="mono" style={{ color: 'var(--signal)', marginRight: 8 }}>T{s.day}</span>
                  {s.from} → {s.to}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RiddenToggle ridden={!!a?.ridden} onChange={(r) => setRidden(s.id, r)} />
                  <button
                    className="pill plan"
                    style={{ background: 'none', cursor: 'pointer' }}
                    onClick={() => setEdit(isEdit ? null : s.id)}
                  >
                    {isEdit ? 'Fertig' : 'Bearbeiten'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <div>
                  <span className="muted" style={{ fontSize: 11 }}>Distanz</span>
                  <div className="mono">{km(s.plannedKm)} <span className="muted">→</span> {a?.actualKm != null ? km(a.actualKm) : '–'}</div>
                </div>
                <Delta planned={s.plannedKm} actual={a?.actualKm} unit="km" />
                <div style={{ textAlign: 'right' }}>
                  <span className="muted" style={{ fontSize: 11 }}>Höhe</span>
                  <div className="mono">{hm(s.plannedAscent)} <span className="muted">→</span> {a?.actualAscent != null ? hm(a.actualAscent) : '–'}</div>
                </div>
              </div>

              {a?.note && !isEdit && <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>„{a.note}"</p>}
              {a?.movingTime && !isEdit && <div className="mono muted" style={{ fontSize: 12, marginTop: 6 }}>Fahrzeit {a.movingTime}</div>}

              {isEdit && <EditActual stage={s.id} value={a} onUpsert={onUpsert} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function field(label: string, input: JSX.Element) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--mist)' }}>
      {label}
      {input}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)',
  borderRadius: 8, padding: '9px 10px', fontFamily: 'inherit', fontSize: 14, width: '100%',
}

function EditActual({ stage, value, onUpsert }: { stage: string; value?: Actual; onUpsert: (a: Actual) => void }) {
  const [d, setD] = useState<Actual>(value ?? { stageId: stage, ridden: true })
  const save = (patch: Partial<Actual>) => {
    const next = { ...d, ...patch, stageId: stage, ridden: true }
    setD(next)
    onUpsert(next)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
      {field('Distanz (km)', <input style={inputStyle} type="number" inputMode="decimal" value={d.actualKm ?? ''} onChange={(e) => save({ actualKm: e.target.value ? +e.target.value : undefined })} />)}
      {field('Höhe (hm)', <input style={inputStyle} type="number" inputMode="decimal" value={d.actualAscent ?? ''} onChange={(e) => save({ actualAscent: e.target.value ? +e.target.value : undefined })} />)}
      {field('Fahrzeit', <input style={inputStyle} placeholder="5:48" value={d.movingTime ?? ''} onChange={(e) => save({ movingTime: e.target.value })} />)}
      {field('Notiz', <input style={inputStyle} value={d.note ?? ''} onChange={(e) => save({ note: e.target.value })} />)}
    </div>
  )
}
