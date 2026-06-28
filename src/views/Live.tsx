import { useEffect, useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { LiveMap } from '../components/LiveMap'
import { IdentityPicker } from '../components/IdentityPicker'
import { IcPin } from '../components/Icons'
import { toast } from '../lib/toast'
import { clock, timeAgo } from '../lib/format'
import { isFresh } from '../lib/store'
import { pushPermission, enablePush } from '../lib/push'
import { avatarInitial } from '../lib/viewer'
import type { LatLng, RiderLocation } from '../types'

interface Props {
  live: Record<string, RiderLocation>
  viewerName: string
  sharing: boolean
  geoError: string | null
  onStartShare: (name: string) => void
  onStopShare: () => void
  autoShare: boolean
  onAutoShareChange: (v: boolean) => void
  onChangeName: (name: string) => void
}

export function Live({ live, viewerName, sharing, geoError, onStartShare, onStopShare, autoShare, onAutoShareChange, onChangeName }: Props) {
  const [switching, setSwitching] = useState(false)
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(() => pushPermission())

  async function toggleNotif() {
    if (notif === 'granted') { toast.info('Benachrichtigungen sind aktiv'); return }
    const r = await enablePush(viewerName)
    setNotif(r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'unsupported')
    if (r === 'granted') toast.success('Benachrichtigungen aktiviert')
    else if (r === 'denied') toast.error('Benachrichtigungen blockiert – im Browser erlauben')
  }

  const riders = useMemo(
    () => Object.values(live).sort((a, b) => b.at.localeCompare(a.at)),
    [live],
  )
  const route = useMemo<LatLng[]>(() => trip.stages.flatMap((s) => s.track ?? [s.start, s.end]), [])

  useEffect(() => { if (geoError) toast.error(geoError) }, [geoError])

  function toggle() {
    if (sharing) { onStopShare(); toast.info('Standort-Teilen beendet') }
    else { onStartShare(viewerName); toast.success('Standort wird geteilt') }
  }

  return (
    <div className="view">
      <span className="eyebrow">Live · Zuletzt gesehen</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 14 }}>Wo sind sie gerade?</h1>

      <div style={{ marginBottom: 14 }}>
        <LiveMap riders={riders} route={route} />
      </div>

      {riders.length === 0 ? (
        <div className="empty" style={{ padding: '22px 16px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
          <IcPin size={22} />
          <div style={{ fontSize: 13, marginTop: 6 }}>Noch teilt niemand seinen Standort.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {riders.map((r) => {
            const fresh = isFresh(r)
            const kmh = typeof r.speed === 'number' && r.speed >= 0 ? `${Math.round(r.speed * 3.6)} km/h` : null
            const sub = fresh ? (kmh ? `unterwegs · ${kmh}` : 'unterwegs') : `zuletzt ${clock(r.at)}`
            return (
              <div key={r.rider} className="row">
                <div style={dot(fresh)}>{avatarInitial(r.rider)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{r.rider}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>{sub}</div>
                </div>
                {fresh
                  ? <span className="pill ok">live</span>
                  : <span className="pill plan">{timeAgo(r.at)}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Eigener Standort teilen */}
      <button onClick={toggle} className="row" style={{ marginTop: 12, cursor: 'pointer' }} aria-pressed={sharing}>
        <IcPin size={18} />
        <span style={{ flex: 1, fontSize: 13, textAlign: 'left' }}>Meinen Standort teilen{viewerName ? ` als ${viewerName}` : ''}</span>
        <Switch on={sharing} />
      </button>

      {/* Automatisch beim Öffnen teilen */}
      <button onClick={() => onAutoShareChange(!autoShare)} className="row" style={{ marginTop: 8, cursor: 'pointer', padding: '10px 12px' }} aria-pressed={autoShare}>
        <span style={{ flex: 1, fontSize: 12, textAlign: 'left', color: 'var(--mist)' }}>Beim Öffnen automatisch teilen</span>
        <Switch on={autoShare} />
      </button>

      {/* Push-Benachrichtigung, wenn jemand live geht (nur wenn konfiguriert) */}
      {notif !== 'unsupported' && (
        <button onClick={toggleNotif} className="row" style={{ marginTop: 8, cursor: 'pointer', padding: '10px 12px' }} aria-pressed={notif === 'granted'}>
          <span style={{ flex: 1, fontSize: 12, textAlign: 'left', color: 'var(--mist)' }}>Benachrichtigen, wenn jemand live geht</span>
          {notif === 'granted'
            ? <span className="pill ok">an</span>
            : notif === 'denied'
              ? <span className="pill plan">blockiert</span>
              : <span style={{ color: 'var(--signal)', fontSize: 12, fontWeight: 500 }}>einschalten</span>}
        </button>
      )}

      {geoError && <div style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}>{geoError}</div>}
      <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 8, textAlign: 'center' }}>
        Standort nur, solange die App geöffnet ist (kein Hintergrund-GPS). · <button onClick={() => setSwitching(true)} style={linkBtn}>wechseln</button>
      </div>

      {switching && (
        <IdentityPicker
          current={viewerName}
          onPick={(n) => { onChangeName(n); setSwitching(false); if (sharing) { onStopShare(); onStartShare(n) } }}
          onClose={() => setSwitching(false)}
        />
      )}
    </div>
  )
}

function Switch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 38, height: 22, borderRadius: 999, background: on ? 'var(--signal)' : 'var(--slate-strong)', position: 'relative', transition: 'background .15s ease', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', transition: 'left .15s ease' }} />
    </span>
  )
}

function dot(fresh: boolean): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: '50%',
    background: fresh ? 'var(--signal)' : '#6b6976', color: 'var(--ink)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, flexShrink: 0,
  }
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--mist)', textDecoration: 'underline', padding: 0, fontSize: 11, cursor: 'pointer',
}
