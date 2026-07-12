import { useMemo, useState } from 'react'
import { trip } from '../data/trip'
import { sortPhotos } from '../lib/photoOrder'
import { toast } from '../lib/toast'
import { stageDate } from '../lib/format'
import { IcX, IcCheck } from './Icons'
import type { PhotoPatch } from '../lib/dataApi'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  onUpdatePhotos: (updates: Array<{ id: string; patch: PhotoPatch }>) => void
  onClose: () => void
}

// Sortier-/Korrektur-Modus: KEIN Drag&Drop (touch-untauglich). Stattdessen Tap-Insert:
// 1. Foto antippen = auswaehlen. 2. Einfuege-Slot antippen = dorthin verschieben (inkl.
// Etappenwechsel, wenn der Slot in einer anderen Etappe liegt). Scrollen bleibt normal.
export function SortMode({ photos, onUpdatePhotos, onClose }: Props) {
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])
  const stages = useMemo(() => trip.stages.filter((s) => photos.some((p) => p.stageId === s.id)), [photos])
  const baseOrder = (sid: string) => sortPhotos(photos.filter((p) => p.stageId === sid)).map((p) => p.id)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagFor, setTagFor] = useState<Photo | null>(null)
  const selPhoto = selectedId ? byId.get(selectedId) ?? null : null
  const dayOf = (sid: string) => trip.stages.find((s) => s.id === sid)?.day

  /**
   * Foto in Ziel-Etappe an Position `insertAt` einfuegen. Baut die NEUE Zielliste (inkl. Moved-
   * Foto) und schreibt jedem Foto der Etappe {stageId?, orderKey} in EINER atomaren Batch-
   * Mutation. Der Etappenwechsel ist damit Teil derselben Mutation wie die Reihenfolge –
   * kein Zwei-Schritt-Race. Quell-Etappe braucht keine Neuvergabe.
   */
  function movePhoto(photoId: string, targetStageId: string, insertAt: number) {
    const p = byId.get(photoId); if (!p) return
    const cross = p.stageId !== targetStageId
    const next = baseOrder(targetStageId).filter((id) => id !== photoId)
    next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, photoId)
    const updates: Array<{ id: string; patch: PhotoPatch }> = []
    next.forEach((id, k) => {
      const key = (k + 1) * 10, q = byId.get(id); if (!q) return
      if (id === photoId) updates.push({ id, patch: cross ? { stageId: targetStageId, orderKey: key } : { orderKey: key } })
      else if (q.orderKey !== key) updates.push({ id, patch: { orderKey: key } })
    })
    onUpdatePhotos(updates)
    toast.success(`Nach T${dayOf(targetStageId)} verschoben`)
    setSelectedId(null); setTagFor(null)
  }

  /** Tap auf einen Einfuege-Slot vor Anzeige-Index `slotIndex` der Etappe `sid`. */
  function onSlot(sid: string, slotIndex: number) {
    if (!selectedId) return
    const sel = byId.get(selectedId); if (!sel) return
    let insertAt = slotIndex
    if (sel.stageId === sid) {
      const disp = baseOrder(sid), selIdx = disp.indexOf(selectedId)
      if (slotIndex === selIdx || slotIndex === selIdx + 1) { setSelectedId(null); return } // gleiche Stelle -> nur abwaehlen
      if (slotIndex > selIdx) insertAt = slotIndex - 1
    }
    movePhoto(selectedId, sid, insertAt)
  }

  /** Slots direkt vor/nach dem gewaehlten Foto (eigene Etappe) sind No-Ops -> ausblenden. */
  function slotVisible(sid: string, idx: number): boolean {
    if (!selectedId) return false
    if (selPhoto?.stageId === sid) { const disp = baseOrder(sid), si = disp.indexOf(selectedId); if (idx === si || idx === si + 1) return false }
    return true
  }

  function resetOrder(sid: string) {
    const updates = photos.filter((p) => p.stageId === sid && p.orderKey != null).map((p) => ({ id: p.id, patch: { orderKey: null } as PhotoPatch }))
    onUpdatePhotos(updates)
    toast.info(updates.length ? 'Reihenfolge zurückgesetzt (nach Aufnahmezeit)' : 'Bereits nach Aufnahmezeit sortiert')
  }

  const Slot = ({ sid, idx }: { sid: string; idx: number }) =>
    slotVisible(sid, idx) ? <button onClick={() => onSlot(sid, idx)} aria-label="Hierhin verschieben" style={slotStyle} /> : null

  return (
    <div style={overlay}>
      <div style={topbar}>
        <div>
          <span className="eyebrow">Sortieren</span>
          <div style={{ fontSize: 13, color: 'var(--mist)', marginTop: 2 }}>Foto tippen · dann auf eine Lücke tippen</div>
        </div>
        <button className="btn" onClick={onClose} style={{ flexShrink: 0 }}><IcCheck size={17} /> Fertig</button>
      </div>

      {selPhoto && (
        <div style={banner}>
          <img src={selPhoto.thumbUrl} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>Foto ausgewählt – tippe auf eine Lücke</span>
          <button onClick={() => setSelectedId(null)} aria-label="Auswahl aufheben" style={bannerX}><IcX size={18} /></button>
        </div>
      )}

      <div style={scroll}>
        {stages.map((s) => {
          const ids = baseOrder(s.id)
          return (
            <section key={s.id} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from} → {s.to}</span>
                <button onClick={() => resetOrder(s.id)} className="pill" style={{ marginLeft: 'auto', cursor: 'pointer', flexShrink: 0, fontSize: 10 }}>↺ Reihenfolge</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Slot sid={s.id} idx={0} />
                {ids.map((id, i) => {
                  const p = byId.get(id); if (!p) return null
                  const active = selectedId === id
                  return (
                    <div key={id}>
                      <div onClick={() => setSelectedId((cur) => (cur === id ? null : id))} style={row(active)}>
                        <span className="mono muted" style={{ fontSize: 11, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                        <img src={p.thumbUrl} alt="" draggable={false} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--ink)' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption || <span className="muted">ohne Titel</span>}</div>
                          <div className="mono muted" style={{ fontSize: 11 }}>{p.author}{p.takenAt ? ` · ${fmt(p.takenAt)}` : p.orderKey != null ? ' · fixiert' : ''}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setTagFor(p) }} className="pill" style={{ flexShrink: 0, cursor: 'pointer', fontSize: 10 }}>Tag ▾</button>
                      </div>
                      <div style={{ marginTop: 6 }}><Slot sid={s.id} idx={i + 1} /></div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {tagFor && (
        <div onClick={() => setTagFor(null)} style={sheetOverlay}>
          <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={sheet}>
            <div style={handle} />
            <span className="eyebrow">Etappe ändern</span>
            <div className="mono muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>{tagFor.caption || 'Foto'} · {tagFor.author} · ans Ende des Zieltags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
              {trip.stages.map((s) => {
                const on = s.id === tagFor.stageId
                return (
                  <button key={s.id} onClick={() => movePhoto(tagFor.id, s.id, Number.MAX_SAFE_INTEGER)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: on ? 'var(--signal)' : 'var(--ink-2)', color: on ? '#1a0e04' : 'var(--snow)', border: `0.5px solid ${on ? 'var(--signal)' : 'var(--slate)'}`, borderRadius: 999, padding: '8px 12px', fontSize: 13, fontWeight: on ? 700 : 400, cursor: 'pointer' }}>
                    <span className="mono" style={{ fontWeight: 700 }}>T{s.day}</span>
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from}→{s.to}</span>
                    <span className="mono" style={{ fontSize: 10, opacity: 0.7 }}>{stageDate(trip.startDate, s.day - 1)}</span>
                  </button>
                )
              })}
            </div>
            <button className="btn ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => setTagFor(null)}><IcX size={16} /> Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 90, background: 'var(--ink)', display: 'flex', flexDirection: 'column' }
const topbar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px', borderBottom: '0.5px solid var(--slate)' }
const banner: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(255,138,61,.12)', borderBottom: '0.5px solid var(--signal-dim)', color: 'var(--snow)' }
const bannerX: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 4, flexShrink: 0 }
const scroll: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px 16px calc(24px + env(safe-area-inset-bottom))' }
function row(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: 6,
    background: active ? 'rgba(255,138,61,.10)' : 'var(--ink-2)',
    border: `${active ? 1.5 : 0.5}px solid ${active ? 'var(--signal)' : 'var(--slate)'}`,
    borderRadius: 10, cursor: 'pointer', userSelect: 'none',
    transform: active ? 'scale(1.02)' : 'none', transition: 'transform .1s',
  }
}
const slotStyle: React.CSSProperties = {
  display: 'block', width: '100%', minHeight: 28, background: 'rgba(255,138,61,.06)',
  border: '1.5px dashed var(--signal)', borderRadius: 8, cursor: 'pointer', padding: 0,
}
const sheetOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(8,7,10,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const sheet: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 'var(--shell)', background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(20px + env(safe-area-inset-bottom))' }
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
