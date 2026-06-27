import { useEffect, useRef, useState } from 'react'
import { uploadGpx } from '../lib/cloudinary'
import { loadGpxDetailed, parseGpxDetailed, removeLocalGpx, type GpxDetail } from '../lib/gpx'
import { km as fmtKm, hm as fmtHm } from '../lib/format'
import { IcDownload, IcExternal, IcUpload, IcX } from './Icons'
import type { Actual, Stage } from '../types'

// Externer Routen-Editor (kein Editor in onTour); bearbeitete Route kommt als GPX zurueck.
const EDITOR_URL = 'https://markusbaechler.github.io/motorbike/'

interface Props {
  stage: Stage
  actual?: Actual
  base: string
  istLocked?: boolean
  istLockHint?: string
  onUpsert: (a: Actual) => void
  onClose: () => void
}

export function GpxManager({ stage, actual, base, istLocked, istLockHint, onUpsert, onClose }: Props) {
  const planUrl = actual?.planTrackUrl ?? `${base}${stage.gpxUrl ?? ''}`
  const istUrl = actual?.trackUrl
  const [planStat, setPlanStat] = useState<GpxDetail | null>(null)
  const [istStat, setIstStat] = useState<GpxDetail | null>(null)
  const [busy, setBusy] = useState<'plan' | 'ist' | null>(null)
  const planInput = useRef<HTMLInputElement>(null)
  const istInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let on = true
    setPlanStat(null)
    if (stage.gpxUrl || actual?.planTrackUrl) loadGpxDetailed(planUrl).then((d) => on && setPlanStat(d))
    return () => { on = false }
  }, [planUrl, stage.gpxUrl, actual?.planTrackUrl])

  useEffect(() => {
    let on = true
    setIstStat(null)
    if (istUrl) loadGpxDetailed(istUrl).then((d) => on && setIstStat(d))
    return () => { on = false }
  }, [istUrl])

  function write(patch: Partial<Actual>) {
    onUpsert({ ridden: actual?.ridden ?? false, ...actual, ...patch, stageId: stage.id })
  }

  async function replacePlan(file: File) {
    setBusy('plan')
    try {
      removeLocalGpx(actual?.planTrackUrl)
      write({ planTrackUrl: await uploadGpx(file, `${stage.id}-plan`) })
    } finally { setBusy(null) }
  }
  function resetPlan() {
    removeLocalGpx(actual?.planTrackUrl)
    write({ planTrackUrl: undefined })
  }

  async function setIst(file: File) {
    setBusy('ist')
    try {
      const d = parseGpxDetailed(await file.text())
      removeLocalGpx(actual?.trackUrl)
      const url = await uploadGpx(file, `${stage.id}-ist`)
      write({ ridden: true, trackUrl: url, actualKm: d.km || actual?.actualKm, actualAscent: d.ascent || actual?.actualAscent })
    } finally { setBusy(null) }
  }
  function removeIst() {
    removeLocalGpx(actual?.trackUrl)
    write({ trackUrl: undefined })
  }

  async function download() {
    const text = planUrl.startsWith('local:')
      ? localStorage.getItem('alpes-gpx:' + planUrl.slice(6)) ?? ''
      : await (await fetch(planUrl)).text()
    const href = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' }))
    const a = document.createElement('a')
    a.href = href
    a.download = `${stage.id}-${actual?.planTrackUrl ? 'roadbook' : (stage.gpxUrl?.split('/').pop() ?? 'roadbook.gpx')}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const planName = actual?.planTrackUrl ? (planStat?.name ?? 'Ersatz-Roadbook') : (stage.gpxUrl?.split('/').pop() ?? '—')
  const istName = istStat?.name ?? 'Gefahren-GPX'

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">GPX · T{stage.day}</span>
        <h1 className="h1" style={{ marginTop: 6, marginBottom: 14, fontSize: 22 }}>{stage.from} → {stage.to}</h1>

        {/* Soll / Roadbook */}
        <section style={section}>
          <div style={head}><span className="mono" style={tag}>ROADBOOK · SOLL</span></div>
          <FileRow name={planName} stat={planStat} />
          <div style={btnRow}>
            <button className="btn ghost" style={grow} onClick={download}><IcDownload size={17} /> Download</button>
            <button className="btn ghost" style={grow} disabled={busy === 'plan'} onClick={() => planInput.current?.click()}>
              <IcUpload size={17} /> {busy === 'plan' ? 'Lädt…' : 'Ersatz'}
            </button>
            {actual?.planTrackUrl && (
              <button className="btn ghost" onClick={resetPlan} title="Auf mitgeliefertes Roadbook zurücksetzen">Original</button>
            )}
          </div>
          <a className="btn ghost" href={EDITOR_URL} target="_blank" rel="noopener noreferrer" style={{ width: '100%', marginTop: 8, textDecoration: 'none', fontSize: 13 }}>
            <IcExternal size={16} /> Route im Tool bearbeiten
          </a>
          <div className="mono muted" style={{ fontSize: 10, marginTop: 6 }}>Im Tool bearbeiten, GPX exportieren → hier als „Ersatz" zurückladen.</div>
          <input ref={planInput} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) replacePlan(f); e.currentTarget.value = '' }} />
        </section>

        {/* Ist / Gefahren */}
        <section style={{ ...section, marginBottom: 0 }}>
          <div style={head}><span className="mono" style={tag}>GEFAHREN · IST</span></div>
          {istUrl ? (
            <>
              <FileRow name={istName} stat={istStat ?? (actual?.actualKm != null ? { track: [], km: actual.actualKm, ascent: actual.actualAscent ?? 0 } : null)} accent />
              <div style={btnRow}>
                <button className="btn ghost" style={grow} disabled={busy === 'ist' || istLocked} onClick={() => istInput.current?.click()}>
                  <IcUpload size={17} /> {busy === 'ist' ? 'Lädt…' : 'Ersetzen'}
                </button>
                <button className="btn ghost" onClick={removeIst} style={{ color: 'var(--bad)' }}>Entfernen</button>
              </div>
            </>
          ) : istLocked ? (
            <div className="muted" style={{ fontSize: 13, padding: '8px 2px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden="true">🔒</span> {istLockHint ?? 'Noch nicht freigegeben'}
            </div>
          ) : (
            <button className="btn" style={{ width: '100%' }} disabled={busy === 'ist'} onClick={() => istInput.current?.click()}>
              <IcUpload size={18} /> {busy === 'ist' ? 'Lädt…' : 'Gefahren-GPX hochladen'}
            </button>
          )}
          <input ref={istInput} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) setIst(f); e.currentTarget.value = '' }} />
        </section>
      </div>
    </div>
  )
}

function FileRow({ name, stat, accent }: { name: string; stat: GpxDetail | null; accent?: boolean }) {
  return (
    <div style={fileRow}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>
          {stat ? <>{fmtKm(stat.km)} · {fmtHm(stat.ascent)}</> : 'lese Daten…'}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 10, color: accent ? 'var(--ok)' : 'var(--mist)' }}>{accent ? 'IST' : 'SOLL'}</span>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,7,10,.82)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}
const sheet: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 380, maxHeight: '88vh', overflowY: 'auto',
  background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 16, padding: 18,
}
const closeBtn: React.CSSProperties = { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer' }
const section: React.CSSProperties = { background: 'var(--ink)', border: '0.5px solid var(--slate)', borderRadius: 12, padding: 12, marginBottom: 12 }
const head: React.CSSProperties = { marginBottom: 8 }
const tag: React.CSSProperties = { fontSize: 10, letterSpacing: 2, color: 'var(--mist)' }
const fileRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }
const btnRow: React.CSSProperties = { display: 'flex', gap: 8 }
const grow: React.CSSProperties = { flex: 1, fontSize: 13 }
