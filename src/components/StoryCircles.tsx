import type { Photo } from '../types'

export interface StoryGroup { id: string; day: number; cover: Photo }

/** Story-Ringe oben: pro Etappe ein Kreis (Cover = erstes Foto) -> oeffnet die Story. */
export function StoryCircles({ groups, onOpen }: { groups: StoryGroup[]; onOpen: (photoId: string) => void }) {
  if (!groups.length) return null
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 0 16px', WebkitOverflowScrolling: 'touch' }}>
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onOpen(g.cover.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, padding: 0 }}
        >
          <span className="story-ring"><img src={g.cover.thumbUrl} alt={`T${g.day}`} /></span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--signal)', fontWeight: 700 }}>T{g.day}</span>
        </button>
      ))}
    </div>
  )
}
