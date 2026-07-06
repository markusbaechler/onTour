import { useEffect, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { RiddenToggle } from '../components/RiddenToggle'
import { GpxManager } from '../components/GpxManager'
import { ProfileModal } from '../components/ProfileModal'
import { IcRoute, IcMap, IcDownload, IcMountain } from '../components/Icons'
import { Navigation } from './Navigation'
import { fmt, km, hm, stageDate, stageUnlocked } from '../lib/format'
import { loadGpxDetailed } from '../lib/gpx'
import { actualFor } from '../lib/store'
import { usePlanTracks, type StageStats } from '../lib/passes'
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
  const [profileStage, setProfileStage] = useState<Stage | null>(null)
  const [highlight, setHighlight] = useState<LatLng | null>(null)
  const tracks = useRiddenTracks(actuals)
  const planTracks = usePlanTracks(actuals)
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
          // Ersatz-Roadbook vorhanden -> Karte/Marker/Navigation folgen der Ersatzroute
          const pt = planTracks[s.id]
          const eff = pt?.length ? { ...s, track: pt, start: pt[0], end: pt[pt.length - 1] } : s
          const unlocked = stageUnlocked(trip.startDate, s.day - 1)
          const lockHint = `erst ab ${stageDate(trip.startDate, s.day - 1)}`
          return (
            <div key={s.id} ref={(el) => (refs.current[s.id] = el)} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                className="row"
                style={{ border: 'none', borderRadius: 0, background: 'transparent' }}
                onClick={() => { setOpen(isOpen ? undefined : s.id); setHighlight(null) }}
              >
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 12 }}>T{s.day}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.from} → {s.to}</div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{stageDate(trip.startDate, s.day - 1)} · {km(stats[s.id]?.km ?? s.plannedKm)} · {hm(stats[s.id]?.ascent ?? s.plannedAscent)}</div>
                </div>
                {a?.ridden && <span className="pill ok">gefahren</span>}
              </button>

              {isOpen && (() => {
                const st = stats[s.id]
                const passes = st?.passes ?? []
                const passList = passes.length ? [...passes].sort((p, q) => p.distFromStart - q.distFromStart) : null
                return (
                  <div style={{ padding: 12, paddingTop: 6 }}>
                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <span className="eyebrow">Status</span>
                      <RiddenToggle ridden={!!a?.ridden} onChange={(r) => setRidden(s.id, r)} disabled={!unlocked} hint={lockHint} />
                    </div>

                    {/* Karte */}
                    <MapView stages={[eff]} tracks={tracks} passes={passes.map((p) => [p.lat, p.lng] as LatLng)} highlight={highlight} height={190} />

                    {/* Kennzahlenzeile */}
                    <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
                      <div className="stat" style={statCell}><div className="num" style={numStyle}>{fmt(st?.km ?? s.plannedKm)}</div><div className="lbl">km</div></div>
                      <div className="stat" style={statCell}><div className="num" style={{ ...numStyle, color: 'var(--glacier)' }}>{fmt(st?.ascent ?? s.plannedAscent)}</div><div className="lbl">hm</div></div>
                      <div className="stat" style={statCell}><div className="num" style={numStyle}>{fmt(st?.highest ?? 0)}</div><div className="lbl">höchster</div></div>
                      <div className="stat" style={statCell}><div className="num" style={{ ...numStyle, color: 'var(--signal)' }}>{passes.length}</div><div className="lbl">Pässe</div></div>
                    </div>

                    {/* Cols als aufgeraeumte Liste – Klick laesst den Punkt auf der Karte leuchten */}
                    {passList && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {passList.map((p, i) => {
                          const active = !!highlight && highlight[0] === p.lat && highlight[1] === p.lng
                          return (
                            <button
                              key={i}
                              onClick={() => setHighlight(active ? null : [p.lat, p.lng])}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                                background: active ? 'rgba(255,138,61,.10)' : 'transparent',
                                border: active ? '0.5px solid var(--signal-dim)' : '0.5px solid transparent',
                                borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: 'var(--snow)',
                                transition: 'background .15s ease, border-color .15s ease',
                              }}
                            >
                              <ColBadge col={p} />
                              <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>bei {fmt(p.distFromStart / 1000)} km</span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Aktionen */}
                    <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => setNavStage(eff)}>
                      <IcRoute size={18} /> Navigation starten
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a className="btn ghost" href={a?.planTrackUrl?.startsWith('http') ? a.planTrackUrl : `${base}${s.gpxUrl ?? ''}`} download style={{ flex: 1, textDecoration: 'none', fontSize: 13 }}>
                        <IcDownload size={17} /> Roadbook
                      </a>
                      <button className="btn ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setGpxStage(s)}>
                        <IcMap size={17} /> GPX
                      </button>
                      <button className="btn ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setProfileStage(s)}>
                        <IcMountain size={17} /> Profil
                      </button>
                    </div>
                  </div>
                )
              })()}
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
          istLocked={!stageUnlocked(trip.startDate, gpxStage.day - 1)}
          istLockHint={`Gefahren-GPX erst ab ${stageDate(trip.startDate, gpxStage.day - 1)}`}
          onUpsert={onUpsert}
          onClose={() => setGpxStage(null)}
        />
      )}
      {profileStage && (
        <ProfileModal stage={profileStage} stats={stats[profileStage.id]} onClose={() => setProfileStage(null)} />
      )}
    </div>
  )
}

const statCell: React.CSSProperties = { padding: '8px 6px', textAlign: 'center' }
const numStyle: React.CSSProperties = { fontSize: 15 }
