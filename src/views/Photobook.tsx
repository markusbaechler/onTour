import { useState } from 'react'
import { trip } from '../data/trip'
import { PhotoUpload } from '../components/PhotoUpload'
import { PhotoLightbox } from '../components/PhotoLightbox'
import { IcCamera } from '../components/Icons'
import { stageDate } from '../lib/format'
import type { Comment, Photo, Reaction } from '../types'

interface Props {
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
  viewerName: string
  onAdd: (p: Photo) => void
  onRemove: (id: string) => void
  onAddComment: (c: Comment) => void
  onToggleReaction: (photoId: string, author: string, emoji: string) => void
  onChangeName: (name: string) => void
}

export function Photobook({
  photos, comments, reactions, viewerName,
  onAdd, onRemove, onAddComment, onToggleReaction, onChangeName,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = photos.find((p) => p.id === activeId) ?? null
  const total = photos.length
  const countFor = (id: string) => comments.filter((c) => c.photoId === id).length + reactions.filter((r) => r.photoId === id).length

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
                <PhotoUpload stageId={s.id} author={viewerName} onAdd={onAdd} />
              </div>

              {ps.length === 0 ? (
                <div className="empty" style={{ padding: '18px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
                  <IcCamera size={22} />
                  <div style={{ fontSize: 13, marginTop: 6 }}>Noch keine Bilder von dieser Etappe.</div>
                </div>
              ) : (
                <div className="grid-photos">
                  {ps.map((p) => {
                    const n = countFor(p.id)
                    return (
                      <div key={p.id} style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setActiveId(p.id)}>
                        <img src={p.thumbUrl} alt={p.caption ?? `Foto von ${p.author}`} loading="lazy" />
                        {n > 0 && (
                          <span className="mono" style={{ position: 'absolute', right: 5, bottom: 5, background: 'rgba(8,7,10,.72)', color: 'var(--snow)', fontSize: 10, padding: '1px 6px', borderRadius: 999 }}>
                            💬 {n}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {active && (
        <PhotoLightbox
          photo={active}
          comments={comments}
          reactions={reactions}
          viewerName={viewerName}
          onClose={() => setActiveId(null)}
          onRemove={(id) => { onRemove(id); setActiveId(null) }}
          onAddComment={onAddComment}
          onToggleReaction={onToggleReaction}
          onChangeName={onChangeName}
        />
      )}
    </div>
  )
}
