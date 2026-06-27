import { useState } from 'react'
import { trip } from '../data/trip'
import { PhotoUpload } from '../components/PhotoUpload'
import { IcX, IcUser, IcCamera } from '../components/Icons'
import { stageDate } from '../lib/format'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  onAdd: (p: Photo) => void
  onRemove: (id: string) => void
}

export function Photobook({ photos, onAdd, onRemove }: Props) {
  const [active, setActive] = useState<Photo | null>(null)
  const total = photos.length

  return (
    <div className="view">
      <span className="eyebrow">Fotobuch</span>
      <h1 className="h1" style={{ marginTop: 8, marginBottom: 4 }}>Entlang der Strecke</h1>
      <p className="muted" style={{ margin: '0 0 18px', fontSize: 13 }}>
        {total} {total === 1 ? 'Bild' : 'Bilder'} · alle {trip.riders.length} laden hoch
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {trip.stages.map((s) => {
          const ps = photos.filter((p) => p.stageId === s.id)
          return (
            <section key={s.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{s.from} → {s.to}</span>
                <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto' }}>{stageDate(trip.startDate, s.day - 1)}</span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <PhotoUpload stageId={s.id} riders={trip.riders} onAdd={onAdd} />
              </div>

              {ps.length === 0 ? (
                <div className="empty" style={{ padding: '18px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
                  <IcCamera size={22} />
                  <div style={{ fontSize: 13, marginTop: 6 }}>Noch keine Bilder von dieser Etappe.</div>
                </div>
              ) : (
                <div className="grid-photos">
                  {ps.map((p) => (
                    <img key={p.id} src={p.thumbUrl} alt={p.caption ?? `Foto von ${p.author}`} loading="lazy" onClick={() => setActive(p)} />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {active && (
        <div
          onClick={() => setActive(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,7,10,.94)', zIndex: 50, display: 'flex', flexDirection: 'column' }}
        >
          <button
            onClick={() => setActive(null)}
            style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--snow)', zIndex: 1 }}
            aria-label="Schliessen"
          >
            <IcX size={26} />
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <img src={active.url} alt={active.caption ?? ''} style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 10 }} />
          </div>
          <div style={{ padding: '0 20px 28px', display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <IcUser size={18} />
            <span style={{ fontSize: 14 }}>{active.author}</span>
            {active.caption && <span className="muted" style={{ fontSize: 14 }}>· {active.caption}</span>}
            <button
              onClick={() => { onRemove(active.id); setActive(null) }}
              className="pill plan"
              style={{ marginLeft: 'auto', background: 'none', cursor: 'pointer' }}
            >
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
