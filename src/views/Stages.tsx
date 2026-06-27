import { useEffect, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { ColBadge } from '../components/ColBadge'
import { MapView } from '../components/MapView'
import { IcDownload, IcUpload, IcRoute } from '../components/Icons'
import { Navigation } from './Navigation'
import { km, hm, stageDate } from '../lib/format'
import { parseGpxDetailed } from '../lib/gpx'
import { actualFor } from '../lib/store'
import type { Actual, LatLng, Stage } from '../types'

interface Props {
  actuals: Actual[]
  openStage?: string
  onUpsert: (a: Actual) => void
  base: string
}

export function Stages({ actuals, openStage, onUpsert, base }: Props) {
  const [open, setOpen] = useState<string | undefined>(openStage ?? trip.stages[0].id)
  const [tracks, setTracks] = useState<Record<string, LatLng[]>>({})
  const [navStage, setNavStage] = useState<Stage | null>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (openStage) {
      setOpen(openStage)
      refs.current[openStage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [openStage])

  async function onGpx(stageId: string, file: File) {
    const text = await file.text()
    const d = parseGpxDetailed(text)
    if (d.track.length) setTracks((t) => ({ ...t, [stageId]: d.track }))
    const prev = actualFor(actuals, stageId)
    onUpsert({
      ...prev,
      stageId,
      ridden: true,
      actualKm: d.km || prev?.actualKm,
      actualAscent: d.ascent || prev?.actualAscent,
    })
  }

  return (
    <div className="view">
      <span className="eyebrow">Etappen · Soll</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 16 }}>7 Tage, {trip.stages.reduce((s, x) => s + x.cols.length, 0)} Cols</h1>

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
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{stageDate(trip.startDate, s.day - 1)} · {km(s.plannedKm)} · {hm(s.plannedAscent)}</div>
                </div>
                {a?.ridden && <span className="pill ok">gefahren</span>}
              </button>

              {isOpen && (
                <div style={{ padding: 12, paddingTop: 4 }}>
                  <MapView stages={[s]} tracks={tracks} height={200} />

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                    {s.cols.map((c) => <ColBadge key={c.name} col={c} />)}
                  </div>

                  <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => setNavStage(s)}>
                    <IcRoute size={18} /> Navigation starten
                  </button>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="btn ghost" href={`${base}${s.gpxUrl}`} download style={{ flex: 1, textDecoration: 'none' }}>
                      <IcDownload size={18} /> Roadbook
                    </a>
                    <GpxUpload stageId={s.id} onGpx={onGpx} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {navStage && <Navigation stage={navStage} base={base} onClose={() => setNavStage(null)} />}
    </div>
  )
}

function GpxUpload({ stageId, onGpx }: { stageId: string; onGpx: (id: string, f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="btn" style={{ flex: 1 }} onClick={() => input.current?.click()}>
        <IcUpload size={18} /> Gefahren-GPX
      </button>
      <input
        ref={input}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onGpx(stageId, f)
          if (input.current) input.current.value = ''
        }}
      />
    </>
  )
}
