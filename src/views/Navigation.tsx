import { useEffect, useMemo, useRef, useState } from 'react'
import { NavMap } from '../components/NavMap'
import { ManeuverIcon } from '../components/ManeuverIcon'
import { ColBadge } from '../components/ColBadge'
import { IcX } from '../components/Icons'
import { km as fmtKm } from '../lib/format'
import { bearing, cueText, cumulative, distanceM, loadCues, navDistance, projectOnTrack } from '../lib/nav'
import type { Cue, CueType, LatLng, Stage } from '../types'

type RideMode = 'gps' | 'sim'

interface Ride { pos: LatLng | null; heading: number; speedKmh: number; error: string | null }

/** Position entweder aus echtem GPS (watchPosition) oder als Demo-Fahrt entlang des Tracks. */
function useRide(track: LatLng[], mode: RideMode): Ride {
  const [pos, setPos] = useState<LatLng | null>(null)
  const [heading, setHeading] = useState(0)
  const [speedKmh, setSpeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const prev = useRef<LatLng | null>(null)

  useEffect(() => {
    setError(null)
    if (mode === 'gps') {
      if (!('geolocation' in navigator)) { setError('Kein GPS verfügbar.'); return }
      const id = navigator.geolocation.watchPosition(
        (p) => {
          const cur: LatLng = [p.coords.latitude, p.coords.longitude]
          setPos(cur)
          const sp = typeof p.coords.speed === 'number' && p.coords.speed >= 0 ? p.coords.speed : 0
          if (typeof p.coords.heading === 'number' && !Number.isNaN(p.coords.heading) && sp > 0.5) setHeading(p.coords.heading)
          else if (prev.current && distanceM(prev.current, cur) > 3) setHeading(bearing(prev.current, cur))
          setSpeed(sp * 3.6)
          prev.current = cur
        },
        (e) => setError(e.code === e.PERMISSION_DENIED ? 'GPS-Freigabe verweigert.' : 'GPS nicht verfügbar.'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
      )
      return () => navigator.geolocation.clearWatch(id)
    }
    // Simulation
    if (track.length < 2) { setError('Kein Track für die Demo-Fahrt.'); return }
    const cum = cumulative(track)
    const total = cum[cum.length - 1]
    const stepMs = 500
    const mps = 55 / 3.6
    setSpeed(55)
    const at = (dist: number): { p: LatLng; h: number } => {
      const dd = Math.min(dist, total)
      let i = 1
      while (i < cum.length && cum[i] < dd) i++
      const a = track[i - 1], b = track[i] ?? track[i - 1]
      const segLen = (cum[i] ?? cum[i - 1]) - cum[i - 1] || 1
      const t = (dd - cum[i - 1]) / segLen
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], h: bearing(a, b) }
    }
    let d = 0
    const init = at(0); setPos(init.p); setHeading(init.h)
    const id = setInterval(() => {
      d += mps * (stepMs / 1000)
      if (d > total) d = 0
      const s = at(d); setPos(s.p); setHeading(s.h)
    }, stepMs)
    return () => clearInterval(id)
  }, [mode, track])

  return { pos, heading, speedKmh, error }
}

/** Bildschirm wach halten, solange der Player offen ist. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    let released = false
    const request = async () => {
      try { lock = await navigator.wakeLock?.request('screen') } catch { /* nicht unterstuetzt */ }
    }
    void request()
    const onVis = () => { if (document.visibilityState === 'visible' && !released) void request() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [])
}

const SMALL_LABEL: Partial<Record<CueType, string>> = {
  roundabout: 'Im Kreisel', arrive: 'Ankunft', depart: 'Start', uturn: 'Wenden',
  'keep-left': 'Halten', 'keep-right': 'Halten',
}

interface Props {
  stage: Stage
  base: string
  onClose: () => void
}

export function Navigation({ stage, base, onClose }: Props) {
  const [data, setData] = useState<{ cues: Cue[]; track: LatLng[]; source: 'precomputed' | 'heuristic' } | null>(null)
  const [mode, setMode] = useState<RideMode>('gps')
  useWakeLock()

  useEffect(() => {
    let on = true
    loadCues(base, stage.day, stage.gpxUrl).then((d) => on && setData(d))
    return () => { on = false }
  }, [base, stage])

  const track = data?.track ?? []
  const ride = useRide(track, mode)

  const cum = useMemo(() => cumulative(track), [track])
  const total = cum[cum.length - 1] ?? 0
  const proj = ride.pos && track.length > 1 ? projectOnTrack(ride.pos, track, cum) : null
  const distAlong = proj?.distAlong ?? 0
  const offRoute = !!proj && mode === 'gps' && proj.offRouteM > 50

  const cues = data?.cues ?? []
  const nextIdx = cues.findIndex((c) => c.distFromStart > distAlong + 5)
  const next = nextIdx >= 0 ? cues[nextIdx] : cues[cues.length - 1]
  const after = nextIdx >= 0 ? cues[nextIdx + 1] : undefined
  const distToNext = next ? Math.max(0, next.distFromStart - distAlong) : 0
  const progress = total ? Math.min(1, distAlong / total) : 0
  const nextCol = stage.cols.find((_, j) => (j + 1) / (stage.cols.length + 1) > progress)

  const [num, unit] = navDistance(distToNext).split(' ')
  const dest = stage.end
  const navAppHref = `geo:${dest[0]},${dest[1]}?q=${dest[0]},${dest[1]}(${encodeURIComponent(stage.to)})`

  return (
    <div style={overlay}>
      {/* Karte + HUD */}
      <div style={{ position: 'relative' }}>
        {data && ride.pos
          ? <NavMap track={track} pos={ride.pos} heading={ride.heading} height={Math.round(window.innerHeight * 0.46)} />
          : <div style={{ height: '46vh', background: '#111017', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mist)', fontSize: 13 }}>
              {data ? (ride.error ?? 'Warte auf Position…') : 'Lade Roadbook…'}
            </div>}

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--slate)', zIndex: 3 }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--signal)' }} />
        </div>

        <button onClick={onClose} aria-label="Navigation beenden" style={hudBtn}><IcX size={20} /></button>

        <div style={{ ...hudBadge, top: 12, right: 12 }}>
          <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--glacier)' }}>{Math.round(ride.speedKmh)}</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--mist)' }}> km/h</span>
        </div>

        {nextCol && (
          <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 4 }}>
            <ColBadge col={nextCol} />
          </div>
        )}

        <div style={{ ...hudBadge, bottom: 10, left: 12 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>T{stage.day} · </span>
          <span className="mono" style={{ fontSize: 11 }}>{fmtKm((distAlong / 1000) || 0)} / {stage.plannedKm} km</span>
        </div>

        {/* Modus-Umschalter */}
        <div style={{ position: 'absolute', bottom: 10, right: 12, zIndex: 4, display: 'flex', background: 'rgba(14,13,17,.78)', border: '0.5px solid var(--slate)', borderRadius: 8, overflow: 'hidden' }}>
          {(['gps', 'sim'] as RideMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className="mono" style={{ background: mode === m ? 'var(--signal)' : 'transparent', color: mode === m ? '#1a0e04' : 'var(--mist)', border: 'none', fontSize: 10, padding: '5px 9px', cursor: 'pointer' }}>
              {m === 'gps' ? 'GPS' : 'Demo'}
            </button>
          ))}
        </div>
      </div>

      {/* Manoever-Karte */}
      <div style={{ flex: 1, padding: '16px 16px 18px', borderTop: '0.5px solid var(--slate)', background: 'var(--ink)' }}>
        {offRoute ? (
          <OffRoute pos={ride.pos!} target={proj!.point} heading={ride.heading} meters={Math.round(proj!.offRouteM)} />
        ) : next ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ManeuverIcon type={next.type} exit={next.exit} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {SMALL_LABEL[next.type] && <div style={{ color: 'var(--mist)', fontSize: 13 }}>{SMALL_LABEL[next.type]}</div>}
                <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.1 }}>{cueText(next)}</div>
                {next.street && <div className="mono" style={{ fontSize: 13, color: 'var(--signal-dim)', marginTop: 3 }}>{next.street}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: 'var(--signal)', lineHeight: 1 }}>{num}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--mist)' }}>{unit === 'm' ? 'Meter' : 'km'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--slate)', color: 'var(--mist)', fontSize: 13 }}>
              {after ? (
                <>
                  <ManeuverIcon type={after.type} exit={after.exit} size={20} />
                  <span>Danach</span>
                  <span className="mono" style={{ color: 'var(--snow)' }}>{navDistance(Math.max(0, after.distFromStart - next.distFromStart))}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cueText(after)}{after.street ? ` · ${after.street}` : ''}</span>
                </>
              ) : <span>Letzter Hinweis bis zum Ziel.</span>}
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Für dieses Roadbook liegen keine Hinweise vor.</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <a className="btn ghost" href={navAppHref} style={{ flex: 1, textDecoration: 'none', fontSize: 13 }}>In Navi-App öffnen</a>
          {data?.source === 'heuristic' && (
            <span className="mono muted" style={{ fontSize: 10 }}>Cues: heuristisch</span>
          )}
        </div>
      </div>
    </div>
  )
}

function OffRoute({ pos, target, heading, meters }: { pos: LatLng; target: LatLng; heading: number; meters: number }) {
  const rel = (bearing(pos, target) - heading + 360) % 360
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width="62" height="62" viewBox="0 0 62 62" style={{ transform: `rotate(${rel}deg)` }} aria-hidden="true">
        <circle cx="31" cy="31" r="20" fill="none" stroke="#3a3942" strokeWidth="3" />
        <path d="M31,12 L41,40 L31,33 L21,40 Z" fill="#FF8A3D" />
      </svg>
      <div>
        <div style={{ color: 'var(--bad)', fontSize: 13 }}>Abseits der Route</div>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.15 }}>Zurück zur Route</div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--mist)', marginTop: 3 }}>{navDistance(meters)} entfernt</div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 70, background: 'var(--ink)',
  display: 'flex', flexDirection: 'column', maxWidth: 'var(--shell)', margin: '0 auto',
}
const hudBtn: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12, zIndex: 4,
  background: 'rgba(14,13,17,.78)', border: '0.5px solid var(--slate)', borderRadius: 8,
  color: 'var(--snow)', padding: 6, display: 'flex', cursor: 'pointer',
}
const hudBadge: React.CSSProperties = {
  position: 'absolute', zIndex: 4,
  background: 'rgba(14,13,17,.78)', border: '0.5px solid var(--slate)', borderRadius: 8, padding: '6px 10px',
}
