import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapModal } from '../components/MapModal'
import { IcMap, IcChevronRight } from '../components/Icons'
import { fmt, stageDate } from '../lib/format'
import { collectPasses, useChainedPlaces, usePlanTracks, type StagePass, type StageStats } from '../lib/passes'
import type { Actual } from '../types'

interface Props {
  actuals: Actual[]
  stats: Record<string, StageStats>
}

export function Passes({ actuals, stats }: Props) {
  const planTracks = usePlanTracks(actuals)
  const planPlaces = useChainedPlaces(actuals, planTracks)
  const [modal, setModal] = useState<{ initial?: StagePass } | null>(null)

  const allPasses = useMemo(() => collectPasses(stats), [stats])
  const highest = allPasses.reduce((m, p) => Math.max(m, p.altitude), 0)
  const over2k = allPasses.filter((p) => p.altitude >= 2000).length

  // Etappen-Stages mit Ersatzrouten-Override fuers Modal (wie Overview/Stages).
  const modalStages = useMemo(
    () => trip.stages.map((s) => {
      const pt = planTracks[s.id]
      return pt?.length ? { ...s, track: pt, start: pt[0], end: pt[pt.length - 1] } : s
    }),
    [planTracks],
  )

  return (
    <div className="view">
      <span className="eyebrow">Pässe · Cols</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 16 }}>{allPasses.length} Pässe</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="stat"><div className="num" style={{ color: 'var(--signal)' }}>{allPasses.length}</div><div className="lbl">Pässe</div></div>
        <div className="stat"><div className="num" style={{ color: 'var(--glacier)' }}>{fmt(highest)}</div><div className="lbl">höchster (m)</div></div>
        <div className="stat"><div className="num">{over2k}</div><div className="lbl">über 2000 m</div></div>
      </div>

      <button className="btn" style={{ width: '100%', marginBottom: 20 }} onClick={() => setModal({})} disabled={allPasses.length === 0}>
        <IcMap size={18} /> Alle Pässe auf der Karte
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {trip.stages.map((s) => {
          const passes = [...(stats[s.id]?.passes ?? [])].sort((a, b) => a.distFromStart - b.distFromStart)
          if (passes.length === 0) return null
          const from = planPlaces[s.id]?.from ?? s.from
          const to = planPlaces[s.id]?.to ?? s.to
          return (
            <section key={s.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from} → {to}</span>
                <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>{stageDate(trip.startDate, s.day - 1)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {passes.map((p, i) => {
                  const high = p.altitude >= 2000
                  return (
                    <button
                      key={i}
                      onClick={() => setModal({ initial: { ...p, stageId: s.id, day: s.day } })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                        background: high ? 'rgba(255,138,61,.08)' : 'transparent',
                        border: `0.5px solid ${high ? 'var(--signal-dim)' : 'var(--slate)'}`,
                        borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: 'var(--snow)',
                      }}
                    >
                      <ColBadge col={p} />
                      <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>bei {fmt(p.distFromStart / 1000)} km</span>
                      {high && <span className="pill" style={{ color: 'var(--signal)', borderColor: 'var(--signal-dim)' }}>2000+</span>}
                      <IcChevronRight size={16} />
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {modal && (
        <MapModal
          title="Alle Pässe"
          stages={modalStages}
          passes={allPasses}
          initialPass={modal.initial}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
