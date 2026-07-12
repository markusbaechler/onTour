import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { PhotoUploadSheet } from '../components/PhotoUploadSheet'
import { PhotoLightbox } from '../components/PhotoLightbox'
import { StoryCircles, type StoryGroup } from '../components/StoryCircles'
import { PhotoTimelineMap } from '../components/PhotoTimelineMap'
import { BlurImage } from '../components/BlurImage'
import { PhotobookBuilder } from '../components/PhotobookBuilder'
import { VideoStudio } from '../components/video/VideoStudio'
import { Slideshow } from '../components/Slideshow'
import { AssignReview } from '../components/AssignReview'
import { IcCamera, IcBook, IcFilm, IcPlay, IcPin } from '../components/Icons'
import { cloudinaryReady } from '../lib/cloudinary'
import { stageDate } from '../lib/format'
import type { StageStats } from '../lib/passes'
import type { Comment, Photo, Reaction } from '../types'

interface Props {
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
  stats: Record<string, StageStats>
  base: string
  viewerName: string
  loading: boolean
  error: boolean
  onRetry: () => void
  onAdd: (p: Photo) => void
  onAddLocal: (p: Photo) => void
  onRemove: (id: string) => void
  onUpdatePhotoStage: (id: string, stageId: string) => void
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
  photos, comments, reactions, stats, base, viewerName, loading, error, onRetry,
  onAdd, onAddLocal, onRemove, onUpdatePhotoStage, onAddComment, onToggleReaction, onChangeName,
}: Props) {
  const [storyStart, setStoryStart] = useState<string | null>(null)
  const [mode, setMode] = useState<'mosaic' | 'map'>('mosaic')
  const [uploadStage, setUploadStage] = useState<string | null>(null)
  const [showBook, setShowBook] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [slideshow, setSlideshow] = useState<{ photos: Photo[]; title?: string } | null>(null)
  const [showAssign, setShowAssign] = useState(false)

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
      <p className="muted" style={{ margin: '6px 0 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{loading ? 'lädt…' : `${total} ${total === 1 ? 'Bild' : 'Bilder'} · alle ${trip.riders.length} laden hoch`}</span>
        {!cloudinaryReady && <span className="pill plan" style={{ fontSize: 9, padding: '1px 6px' }}>Demo</span>}
      </p>

      {!loading && !error && total > 0 && (
        <>
          <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => setSlideshow({ photos })}><IcPlay size={18} /> Diashow</button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="btn ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setShowBook(true)}><IcBook size={17} /> Fotobuch erstellen</button>
            <button className="btn ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setShowVideo(true)}><IcFilm size={17} /> Video erstellen</button>
          </div>
          <button className="btn ghost" style={{ width: '100%', fontSize: 13, marginBottom: 16 }} onClick={() => setShowAssign(true)}><IcPin size={16} /> Zuordnung prüfen</button>
        </>
      )}

      {loading ? (
        <SkeletonMosaic />
      ) : error ? (
        <ErrorState onRetry={onRetry} />
      ) : (
        <>
          <StoryCircles groups={groups} onOpen={(id) => setStoryStart(id)} />

          {mode === 'map' ? (
            total === 0 ? (
              <EmptyHint />
            ) : (
              <PhotoTimelineMap photos={ordered} onOpen={(id) => setStoryStart(id)} />
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {byStage.map(({ stage: s, photos: ps }) => (
                <section key={s.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: ps.length ? 10 : 6 }}>
                    <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                    <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from} → {s.to}</span>
                    <span className="mono muted" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>{stageDate(trip.startDate, s.day - 1)}</span>
                    {ps.length > 0 && <button onClick={() => setSlideshow({ photos: ps, title: `T${s.day} · ${s.from} → ${s.to}` })} className="pill" aria-label="Diashow dieser Etappe" style={{ cursor: 'pointer', padding: '2px 8px', flexShrink: 0 }}>▶</button>}
                  </div>

                  {ps.length === 0 ? (
                    <button onClick={() => setUploadStage(s.id)} style={emptyRow}>
                      <span className="muted" style={{ fontSize: 13 }}>Noch keine Bilder</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--signal)', fontSize: 13, fontWeight: 500 }}>+ hinzufügen</span>
                    </button>
                  ) : (
                    <div className="mosaic">
                      {ps.map((p, i) => {
                        const n = countFor(p.id)
                        return (
                          <div key={p.id} className={tileClass(i)} onClick={() => setStoryStart(p.id)}>
                            <BlurImage src={p.thumbUrl} alt={p.caption ?? `Foto von ${p.author}`} />
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
        </>
      )}

      {!loading && !error && (
        <button className="fab" onClick={() => setUploadStage(trip.stages[0].id)} aria-label="Fotos hinzufügen">
          <IcCamera size={20} /> Fotos
        </button>
      )}

      {uploadStage && (
        <PhotoUploadSheet
          author={viewerName}
          defaultStageId={uploadStage}
          onAdd={onAdd}
          onAddLocal={onAddLocal}
          onClose={() => setUploadStage(null)}
        />
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

      {showBook && <PhotobookBuilder photos={photos} stats={stats} base={base} onClose={() => setShowBook(false)} />}
      {showVideo && <VideoStudio photos={photos} comments={comments} reactions={reactions} stats={stats} base={base} onClose={() => setShowVideo(false)} />}
      {slideshow && <Slideshow photos={slideshow.photos} title={slideshow.title} onClose={() => setSlideshow(null)} />}
      {showAssign && <AssignReview photos={photos} stats={stats} onUpdatePhotoStage={onUpdatePhotoStage} onClose={() => setShowAssign(false)} />}
    </div>
  )
}

const emptyRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%',
  padding: '10px 12px', background: 'transparent',
  border: '0.5px solid var(--slate)', borderRadius: 10,
  cursor: 'pointer', color: 'var(--snow)', textAlign: 'left',
}

function EmptyHint() {
  return (
    <div className="empty" style={{ padding: '40px 16px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
      <IcCamera size={24} />
      <div style={{ fontSize: 13, marginTop: 8 }}>Noch keine Bilder – lade im Mosaik die ersten hoch.</div>
    </div>
  )
}

// Skeleton waehrend des Ladens (Story-Ringe + variables Mosaik).
function SkeletonMosaic() {
  return (
    <>
      <div style={{ display: 'flex', gap: 12, padding: '2px 0 16px' }}>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ width: 60, height: 60, borderRadius: '50%' }} />)}
      </div>
      <div className="mosaic">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className={`skeleton ${tileClass(i)}`} />)}
      </div>
    </>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="empty" style={{ padding: '40px 16px', border: '0.5px dashed var(--slate)', borderRadius: 12 }}>
      <div style={{ fontSize: 13 }}>Daten konnten nicht geladen werden.</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={onRetry}>Erneut versuchen</button>
    </div>
  )
}

const toggleWrap: React.CSSProperties = {
  display: 'inline-flex', background: 'var(--ink-2)', border: '0.5px solid var(--slate)', borderRadius: 999, padding: 2, flexShrink: 0,
}
function segStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
    padding: '9px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: active ? 'var(--signal)' : 'transparent', color: active ? '#1a0e04' : 'var(--mist)', fontWeight: active ? 700 : 400,
  }
}
