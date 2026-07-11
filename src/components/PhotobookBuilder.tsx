import { createPortal } from 'react-dom'
import { trip } from '../data/trip'
import { dateRange, fmt, stageDate } from '../lib/format'
import { IcX } from './Icons'
import type { Photo } from '../types'
import type { StageStats } from '../lib/passes'

interface Props {
  photos: Photo[]
  stats: Record<string, StageStats>
  base: string
  onClose: () => void
}

/**
 * Druckbares Fotobuch: Cover + je Etappe (mit Fotos) eine A4-Seite. Export ueber
 * window.print() ("Als PDF speichern"). Als Portal an document.body, damit die
 * Print-Regeln die App (#root) ausblenden koennen und nur die Seiten drucken.
 */
export function PhotobookBuilder({ photos, stats, base, onClose }: Props) {
  const byStage = trip.stages
    .map((s) => ({ stage: s, photos: photos.filter((p) => p.stageId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }))
    .filter((g) => g.photos.length)

  const totalKm = trip.stages.reduce((a, s) => a + (stats[s.id]?.km ?? s.plannedKm), 0)
  const totalHm = trip.stages.reduce((a, s) => a + (stats[s.id]?.ascent ?? s.plannedAscent), 0)
  const totalPasses = trip.stages.reduce((a, s) => a + (stats[s.id]?.passes.length ?? s.cols.length), 0)
  const cover = photos[0]?.url ?? `${base}hero.jpg`

  return createPortal(
    <div className="pb-root">
      <div className="pb-toolbar no-print">
        <span style={{ fontSize: 13, color: 'var(--mist)' }}>Vorschau · über „Drucken" als PDF speichern</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>Drucken / PDF</button>
          <button className="btn ghost" onClick={onClose}><IcX size={18} /> Schliessen</button>
        </div>
      </div>

      <div className="pb-pages">
        {/* Cover */}
        <div className="pb-page pb-cover">
          <img className="pb-cover-img" src={cover} alt="" />
          <div className="pb-cover-body">
            <div className="pb-eyebrow">{trip.subtitle}</div>
            <h1 className="pb-title">{trip.title}</h1>
            <div className="pb-sub">{dateRange(trip.startDate, trip.endDate)} · {trip.riders.join(', ')}</div>
            <div className="pb-cover-stats">
              <div><b>{fmt(totalKm)}</b><span>Kilometer</span></div>
              <div><b>{fmt(totalHm)}</b><span>Höhenmeter</span></div>
              <div><b>{totalPasses}</b><span>Pässe</span></div>
            </div>
          </div>
        </div>

        {/* je Etappe mit Fotos eine Seite */}
        {byStage.map(({ stage: s, photos: ps }) => (
          <div className="pb-page" key={s.id}>
            <div className="pb-head">
              <div className="pb-head-title"><span className="pb-day">T{s.day}</span> {s.from} → {s.to}</div>
              <div className="pb-head-meta">{stageDate(trip.startDate, s.day - 1)} · {fmt(stats[s.id]?.km ?? s.plannedKm)} km · {stats[s.id]?.passes.length ?? s.cols.length} Pässe</div>
            </div>
            <div className="pb-grid">
              {ps.map((p) => (
                <figure className="pb-fig" key={p.id}>
                  <img src={p.url} alt={p.caption ?? ''} />
                  {p.caption && <figcaption>{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
