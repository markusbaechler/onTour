import { useEffect, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { RiddenToggle } from '../components/RiddenToggle'
import { GpxManager } from '../components/GpxManager'
import { IcRoute, IcMap } from '../components/Icons'
import { Navigation } from './Navigation'
import { km, hm, stageDate } from '../lib/format'
import { loadGpxDetailed } from '../lib/gpx'
import { actualFor } from '../lib/store'
import type { StageStats } from '../lib/passes'
import type { Actual, LatLng, Stage } from '../types'

/** Laedt gefahrene Tracks (Actual.trackUrl) fuer die Kartenlinie; reagiert auf Aenderungen. */
function useRiddenTracks(actuals: Actual[]): Record<string, LatLng[]> {
  const [tracks, setTracks] = useState<Record<string, LatLng[]>>({})
  const sig = actuals.map((a) => `${a.stageId}:${a.trackUrl ?? ''}`).join('|')
  useEffect(() => {
    let on = true
    const list = actuals.filter((a) => a.trackUrl)
    Promise.all(list.map(async (a) => [a.stageId, (await loadGpxDetailed(a.trackUrl!)).track] as const))
      .then((entries) => { if (on) setTracks(Object.fromEntries(entries.filter(([, t]) => t.length))) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return tracks
}

interface Props {
  actuals: Actual[]
  stats: Record<string, StageStats>
  openStage?: string
  onUpsert: (a: Actual) => void
  base: string
}

export function Stages({ actuals, stats, openStage, onUpsert, base }: Props) {
  const [open, setOpen] = useState<string | undefined>(openStage ?? trip.stages[0].id)
  const [navStage, setNavStage] = useState<Stage | null>(null)
  const [gpxStage, setGpxStage] = useState<Stage | null>(null)
  const tracks = useRiddenTracks(actuals)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (openStage) {
      setOpen(openStage)
      refs.current[openStage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [openStage])

  function setRidden(stageId: string, ridden: boolean) {
    const prev = actualFor(actuals, stageId)
    onUpsert({ ...prev, stageId, ridden })
  }

  return (
    <div className="view">
      <span className="eyebrow">Etappen · Soll</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 16 }}>
        {trip.stages.length} Tage, {trip.stages.every((s) => stats[s.id])
          ? trip.stages.reduce((a, s) => a + stats[s.id].passes.length, 0)
          : trip.stages.reduce((s, x) => s + x.cols.length, 0)} Pässe
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trip.stages.map((s) => {
          const isOpen = open === s.id
          const a = actualFor(actuals, s.id)
          return (
            <div key={s.id} ref={(el) => (refs.current[s.id] = el)} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                className="row"
                style={{ border: 'none', borderRadius: 0, background: 'transparent' }}
                onClick={() => setOpen(isOpen ? undefined : s.id)}
              >
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 12 }}>T{s.day}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.from} → {s.to}</div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{stageDate(trip.startDate, s.day - 1)} · {km(stats[s.id]?.km ?? s.plannedKm)} · {hm(stats[s.id]?.ascent ?? s.plannedAscent)}</div>
                </div>
                {a?.ridden && <span className="pill ok">gefahren</span>}
              </button>

              {isOpen && (
                <div style={{ padding: 12, paddingTop: 4 }}>
                  <MapView stages={[s]} tracks={tracks} height={200} />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '12px 0' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                      {(stats[s.id]?.passes ?? s.cols).map((c, i) => <ColBadge key={i} col={c} />)}
                    </div>
                    <RiddenToggle ridden={!!a?.ridden} onChange={(r) => setRidden(s.id, r)} />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" style={{ flex: 1 }} onClick={() => setNavStage(s)}>
                      <IcRoute size={18} /> Navigation
                    </button>
                    <button className="btn ghost" style={{ flex: 1 }} onClick={() => setGpxStage(s)}>
                      <IcMap size={18} /> GPX verwalten
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {navStage && <Navigation stage={navStage} passes={stats[navStage.id]?.passes ?? []} base={base} onClose={() => setNavStage(null)} />}
      {gpxStage && (
        <GpxManager
          stage={gpxStage}
          actual={actualFor(actuals, gpxStage.id)}
          base={base}
          onUpsert={onUpsert}
          onClose={() => setGpxStage(null)}
        />
      )}
    </div>
  )
}
