import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { Avatar } from '../components/Avatar'
import { IdentityPicker } from '../components/IdentityPicker'
import { TripArc } from '../components/TripArc'
import { Sparkline } from '../components/Sparkline'
import { IcCheck, IcCircle, IcBroadcast } from '../components/Icons'
import { fmt, km, hm, dateRange, clock, stageStart } from '../lib/format'
import { actualFor, isFresh } from '../lib/store'
import { usePlanPlaces, usePlanTracks, type StageStats } from '../lib/passes'
import type { Actual, RiderLocation } from '../types'

interface Props {
  actuals: Actual[]
  stats: Record<string, StageStats>
  live: Record<string, RiderLocation>
  onOpenStage: (id: string) => void
  onGoLive: () => void
  viewerName: string
  onChangeName: (name: string) => void
}

export function Overview({ actuals, stats, live, onOpenStage, onGoLive, viewerName, onChangeName }: Props) {
  const [switching, setSwitching] = useState(false)
  const planTracks = usePlanTracks(actuals)
  const planPlaces = usePlanPlaces(actuals, planTracks)
  const ready = trip.stages.every((s) => stats[s.id])

  const totals = useMemo(() => {
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
  }, [stats, ready])

  // Fortschritt: Tag von heute, gefahrene km aus Soll-Ist
  const riddenFlags = trip.stages.map((s) => !!actualFor(actuals, s.id)?.ridden)
  const riddenCount = riddenFlags.filter(Boolean).length
  const n = trip.stages.length
  const gefahrenKm = trip.stages.reduce((a, s, i) => a + (riddenFlags[i] ? (actualFor(actuals, s.id)?.actualKm ?? stats[s.id]?.km ?? s.plannedKm) : 0), 0)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayIdx = Math.floor((today.getTime() - stageStart(trip.startDate, 0).getTime()) / 86_400_000)
  const before = dayIdx < 0, after = dayIdx >= n
  const todayIndex = before || after ? -1 : dayIdx
  const currentDay = before ? 0 : after ? n : dayIdx + 1
  const dayLabel = `Tag ${currentDay}/${n}`
  const statusLabel = before ? `Start in ${-dayIdx} ${-dayIdx === 1 ? 'Tag' : 'Tagen'}` : after ? 'Tour beendet' : 'heute'

  const nextIndex = riddenFlags.findIndex((r) => !r)
  const nextStage = nextIndex >= 0 ? trip.stages[nextIndex] : null
  const nextStats = nextStage ? stats[nextStage.id] : undefined
  const nextTop = nextStats?.passes.length
    ? nextStats.passes.reduce((m, p) => (p.altitude > m.altitude ? p : m))
    : (nextStage && nextStage.cols.length ? nextStage.cols.reduce((m, c) => (c.altitude > m.altitude ? c : m), nextStage.cols[0]) : undefined)

  const riders = Object.values(live)
  const latest = riders.length ? riders.reduce((a, b) => (a.at > b.at ? a : b)) : null

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <span className="eyebrow">{trip.title} · {trip.subtitle}</span>
        <button
          onClick={() => setSwitching(true)}
          aria-label="Identität wechseln"
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 999, padding: '6px 12px 6px 6px', minHeight: 40, color: 'var(--snow)', cursor: 'pointer' }}
        >
          <Avatar name={viewerName} size={22} />
          <span style={{ fontSize: 12, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewerName}</span>
        </button>
      </div>

      {switching && (
        <IdentityPicker current={viewerName} onPick={(nm) => { onChangeName(nm); setSwitching(false) }} onClose={() => setSwitching(false)} />
      )}

      <h1 className="h1">{trip.title}</h1>
      <p className="muted" style={{ margin: '6px 0 16px' }}>{dateRange(trip.startDate, trip.endDate)} · {trip.riders.length} Fahrer</p>

      {/* Trip-Arc */}
      <div style={{ marginBottom: 12 }}>
        <TripArc ridden={riddenFlags} todayIndex={todayIndex} dayLabel={dayLabel} statusLabel={statusLabel} gefahrenKm={gefahrenKm} totalKm={totals.km_} />
      </div>

      {/* Kennzahlen */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="stat"><div className="num" style={{ color: 'var(--signal)' }}>{fmt(totals.km_)}</div><div className="lbl">Kilometer</div></div>
        <div className="stat"><div className="num" style={{ color: 'var(--glacier)' }}>{fmt(totals.hm_)}</div><div className="lbl">Höhenmeter</div></div>
        <div className="stat"><div className="num">{totals.cols}</div><div className="lbl">Pässe</div></div>
      </div>

      {/* Live-Status */}
      <button className="row" onClick={onGoLive} style={{ marginBottom: 12 }}>
        <IcBroadcast size={20} />
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Live · Zuletzt gesehen</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>
            {latest ? `${latest.rider} · ${isFresh(latest) ? 'gerade' : `zuletzt ${clock(latest.at)}`}` : 'Noch teilt niemand seinen Standort'}
          </div>
        </div>
        {latest && isFresh(latest) && <span className="pill ok">live</span>}
      </button>

      {/* Naechste Etappe */}
      {nextStage && (
        <button className="card" onClick={() => onOpenStage(nextStage.id)} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span className="eyebrow">Nächste Etappe</span>
            <span className="mono muted" style={{ fontSize: 11 }}>T{nextStage.day} · {km(nextStats?.km ?? nextStage.plannedKm)} · {hm(nextStats?.ascent ?? nextStage.plannedAscent)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{planPlaces[nextStage.id]?.from ?? nextStage.from} → {planPlaces[nextStage.id]?.to ?? nextStage.to}</div>
            {nextTop && <ColBadge col={nextTop} />}
          </div>
          <Sparkline profile={nextStats?.profile ?? []} />
        </button>
      )}

      {/* Karte */}
      <div style={{ marginBottom: 18 }}>
        <MapView stages={trip.stages.map((s) => { const pt = planTracks[s.id]; return pt?.length ? { ...s, track: pt, start: pt[0], end: pt[pt.length - 1] } : s })} height={240} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="h2">Etappen</span>
        <span className="muted" style={{ fontSize: 12 }}>{riddenCount}/{n} gefahren</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {trip.stages.map((s, i) => {
          const passes = stats[s.id]?.passes
          const top = passes?.length
            ? passes.reduce((m, p) => (p.altitude > m.altitude ? p : m))
            : (s.cols.length ? s.cols.reduce((m, c) => (c.altitude > m.altitude ? c : m), s.cols[0]) : undefined)
          return (
            <button key={s.id} className="row" onClick={() => onOpenStage(s.id)}>
              <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 12 }}>T{s.day}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{planPlaces[s.id]?.from ?? s.from} → {planPlaces[s.id]?.to ?? s.to}</div>
                <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{km(stats[s.id]?.km ?? s.plannedKm)} · {hm(stats[s.id]?.ascent ?? s.plannedAscent)}</div>
              </div>
              {top && <ColBadge col={top} />}
              {riddenFlags[i] ? <IcCheck size={18} /> : <IcCircle size={18} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
