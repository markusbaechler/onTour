import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { PhotoUpload } from '../components/PhotoUpload'
import { PhotoLightbox } from '../components/PhotoLightbox'
import { StoryCircles, type StoryGroup } from '../components/StoryCircles'
import { PhotoTimelineMap } from '../components/PhotoTimelineMap'
import { IcCamera } from '../components/Icons'
import { stageDate } from '../lib/format'
import type { Comment, Photo, Reaction } from '../types'

interface Props {
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
  viewerName: string
  onAdd: (p: Photo) => void
  onAddLocal: (p: Photo) => void
  onRemove: (id: string) => void
  onAddComment: (c: Comment) => void
  onToggleReaction: (photoId: string, author: string, emoji: string) => void
  onChangeName: (name: string) => void
}

// Variable Kachelgroessen fuer ein verspieltes Mosaik.
function tileClass(i: number): string {
  const m = i % 7
  if (m === 0) return 't-big'
  if (m === 2 || m === 5) return 't-tall'
  if (m === 3) return 't-wide'
  return ''
}

export function Photobook({
  photos, comments, reactions, viewerName,
  onAdd, onAddLocal, onRemove, onAddComment, onToggleReaction, onChangeName,
}: Props) {
  const [storyStart, setStoryStart] = useState<string | null>(null)
  const [mode, setMode] = useState<'mosaic' | 'map'>('mosaic')

  // Etappen mit ihren Fotos (chronologisch); Lese-/Story-Reihenfolge = Etappen -> Zeit.
  const byStage = useMemo(
    () => trip.stages.map((s) => ({
      stage: s,
      photos: photos.filter((p) => p.stageId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    })),
    [photos],
  )
  const ordered = useMemo(() => byStage.flatMap((g) => g.photos), [byStage])
  const groups: StoryGroup[] = useMemo(
    () => byStage.filter((g) => g.photos.length).map((g) => ({ id: g.stage.id, day: g.stage.day, cover: g.photos[0] })),
    [byStage],
  )
  const countFor = (id: string) => comments.filter((c) => c.photoId === id).length + reactions.filter((r) => r.photoId === id).length
  const total = photos.length

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <span className="eyebrow">Fotobuch</span>
          <h1 className="h1" style={{ marginTop: 8 }}>Entlang der Strecke</h1>
        </div>
        <div style={toggleWrap}>
          {(['mosaic', 'map'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={segStyle(mode === m)}>{m === 'mosaic' ? 'Mosaik' : 'Karte'}</button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ margin: '6px 0 16px', fontSize: 13 }}>
        {total} {total === 1 ? 'Bild' : 'Bilder'} · alle {trip.riders.length} laden hoch
      </p>

      <StoryCircles groups={groups} onOpen={(id) => setStoryStart(id)} />

      {mode === 'map' ? (
        total === 0 ? (
          <EmptyHint />
        ) : (
          <PhotoTimelineMap photos={ordered} onOpen={(id) => setStoryStart(id)} />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {byStage.map(({ stage: s, photos: ps }) => (
            <section key={s.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from} → {s.to}</span>
                <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>{stageDate(trip.startDate, s.day - 1)}</span>
              </div>

              <div style={{ marginBottom: 10 }}>
                <PhotoUpload stageId={s.id} author={viewerName} onAdd={onAdd} onAddLocal={onAddLocal} />
              </div>

              {ps.length === 0 ? (
                <div className="empty" style={{ padding: '18px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
                  <IcCamera size={22} />
                  <div style={{ fontSize: 13, marginTop: 6 }}>Noch keine Bilder von dieser Etappe.</div>
                </div>
              ) : (
                <div className="mosaic">
                  {ps.map((p, i) => {
                    const n = countFor(p.id)
                    return (
                      <div key={p.id} className={tileClass(i)} onClick={() => setStoryStart(p.id)}>
                        <img src={p.thumbUrl} alt={p.caption ?? `Foto von ${p.author}`} loading="lazy" />
                        {n > 0 && (
                          <span className="mono" style={{ position: 'absolute', right: 5, bottom: 5, background: 'rgba(8,7,10,.72)', color: 'var(--snow)', fontSize: 10, padding: '1px 6px', borderRadius: 999 }}>💬 {n}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {storyStart && (
        <PhotoLightbox
          photos={ordered}
          startId={storyStart}
          comments={comments}
          reactions={reactions}
          viewerName={viewerName}
          onClose={() => setStoryStart(null)}
          onRemove={onRemove}
          onAddComment={onAddComment}
          onToggleReaction={onToggleReaction}
          onChangeName={onChangeName}
        />
      )}
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="empty" style={{ padding: '40px 16px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
      <IcCamera size={24} />
      <div style={{ fontSize: 13, marginTop: 8 }}>Noch keine Bilder – lade im Mosaik die ersten hoch.</div>
    </div>
  )
}

const toggleWrap: React.CSSProperties = {
  display: 'inline-flex', background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 999, padding: 2, flexShrink: 0,
}
function segStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
    padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: active ? 'var(--signal)' : 'transparent', color: active ? '#1a0e04' : 'var(--mist)', fontWeight: active ? 700 : 400,
  }
}
