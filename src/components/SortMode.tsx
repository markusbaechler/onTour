import { useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { sortPhotos } from '../lib/photoOrder'
import { toast } from '../lib/toast'
import { stageDate } from '../lib/format'
import { IcX, IcCheck } from './Icons'
import type { PhotoPatch } from '../lib/dataApi'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  onUpdatePhoto: (id: string, patch: PhotoPatch) => void
  onClose: () => void
}

const LONG_PRESS_MS = 300
const MOVE_CANCEL = 8

/** Sortier-/Korrektur-Modus: Tag aendern (Tap -> Chips) + Reihenfolge per Long-Press-Drag (orderKey). */
export function SortMode({ photos, onUpdatePhoto, onClose }: Props) {
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])
  const stages = useMemo(() => trip.stages.filter((s) => photos.some((p) => p.stageId === s.id)), [photos])
  const baseOrder = (sid: string) => sortPhotos(photos.filter((p) => p.stageId === sid)).map((p) => p.id)

  const [drag, setDrag] = useState<{ sid: string; ids: string[]; activeId: string } | null>(null)
  const [tagFor, setTagFor] = useState<Photo | null>(null)

  const timer = useRef<number | null>(null)
  const gesture = useRef<{ sid: string; id: string; x: number; y: number; moved: boolean; dragging: boolean } | null>(null)
  const els = useRef<Map<string, HTMLElement>>(new Map())
  const clearTimer = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }

  const orderIds = (sid: string) => (drag && drag.sid === sid ? drag.ids : baseOrder(sid))

  function onPointerDown(sid: string, id: string, e: React.PointerEvent) {
    if (e.button != null && e.button !== 0) return
    gesture.current = { sid, id, x: e.clientX, y: e.clientY, moved: false, dragging: false }
    const pid = e.pointerId
    const el = e.currentTarget as HTMLElement
    clearTimer()
    timer.current = window.setTimeout(() => {
      if (!gesture.current || gesture.current.moved) return
      gesture.current.dragging = true
      try { el.setPointerCapture(pid) } catch { /* ignore */ }
      navigator.vibrate?.(10)
      setDrag({ sid, ids: baseOrder(sid), activeId: id })
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current; if (!g) return
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.x) > MOVE_CANCEL || Math.abs(e.clientY - g.y) > MOVE_CANCEL) { g.moved = true; clearTimer() }
      return
    }
    e.preventDefault()
    setDrag((d) => {
      if (!d) return d
      const y = e.clientY
      let target = d.ids.indexOf(d.activeId)
      for (let i = 0; i < d.ids.length; i++) {
        const el = els.current.get(d.ids[i]); if (!el) continue
        const r = el.getBoundingClientRect()
        if (y < r.top + r.height / 2) { target = i; break }
        target = i
      }
      const cur = d.ids.indexOf(d.activeId)
      if (target === cur || target < 0) return d
      const next = [...d.ids]; next.splice(cur, 1); next.splice(target, 0, d.activeId)
      return { ...d, ids: next }
    })
  }

  function onPointerUp() {
    clearTimer()
    const g = gesture.current
    if (g?.dragging && drag && drag.sid === g.sid) commitOrder(drag.sid, drag.ids)
    else if (g && !g.moved) { const p = byId.get(g.id); if (p) setTagFor(p) }
    gesture.current = null
    setDrag(null)
  }

  function commitOrder(_sid: string, ids: string[]) {
    let changed = 0
    ids.forEach((id, i) => { const key = (i + 1) * 10; const p = byId.get(id); if (p && p.orderKey !== key) { onUpdatePhoto(id, { orderKey: key }); changed++ } })
    if (changed) toast.success('Reihenfolge gespeichert')
  }

  function resetOrder(sid: string) {
    let n = 0
    for (const p of photos) if (p.stageId === sid && p.orderKey != null) { onUpdatePhoto(p.id, { orderKey: null }); n++ }
    toast.info(n ? 'Reihenfolge zurückgesetzt (nach Aufnahmezeit)' : 'Bereits nach Aufnahmezeit sortiert')
  }

  function changeStage(p: Photo, sid: string) {
    if (sid !== p.stageId) { onUpdatePhoto(p.id, { stageId: sid, orderKey: null }); toast.success(`Verschoben nach T${trip.stages.find((s) => s.id === sid)?.day}`) }
    setTagFor(null)
  }

  return (
    <div style={overlay}>
      <div style={topbar}>
        <div>
          <span className="eyebrow">Sortieren</span>
          <div style={{ fontSize: 13, color: 'var(--mist)', marginTop: 2 }}>Tippen = Tag ändern · Halten & ziehen = Reihenfolge</div>
        </div>
        <button className="btn" onClick={onClose} style={{ flexShrink: 0 }}><IcCheck size={17} /> Fertig</button>
      </div>

      <div style={scroll}>
        {stages.map((s) => {
          const ids = orderIds(s.id)
          return (
            <section key={s.id} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                <span style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.from} → {s.to}</span>
                <button onClick={() => resetOrder(s.id)} className="pill" style={{ marginLeft: 'auto', cursor: 'pointer', flexShrink: 0, fontSize: 10 }}>↺ Reihenfolge</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ids.map((id, i) => {
                  const p = byId.get(id); if (!p) return null
                  const active = drag?.sid === s.id && drag.activeId === id
                  return (
                    <div
                      key={id}
                      ref={(el) => { if (el) els.current.set(id, el); else els.current.delete(id) }}
                      onPointerDown={(e) => onPointerDown(s.id, id, e)}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      style={row(active)}
                    >
                      <span className="mono muted" style={{ fontSize: 11, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <img src={p.thumbUrl} alt="" draggable={false} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--ink)', pointerEvents: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption || <span className="muted">ohne Titel</span>}</div>
                        <div className="mono muted" style={{ fontSize: 11 }}>{p.author}{p.takenAt ? ` · ${fmt(p.takenAt)}` : p.orderKey != null ? ' · fixiert' : ''}</div>
                      </div>
                      <span aria-hidden style={{ color: 'var(--slate-strong)', fontSize: 18, flexShrink: 0, cursor: 'grab', lineHeight: 1 }}>⠿</span>
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
            <div className="mono muted" style={{ fontSize: 12, margin: '6px 0 14px' }}>{tagFor.caption || 'Foto'} · {tagFor.author}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
              {trip.stages.map((s) => {
                const on = s.id === tagFor.stageId
                return (
                  <button key={s.id} onClick={() => changeStage(tagFor, s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: on ? 'var(--signal)' : 'var(--ink-2)', color: on ? '#1a0e04' : 'var(--snow)', border: `0.5px solid ${on ? 'var(--signal)' : 'var(--slate)'}`, borderRadius: 999, padding: '8px 12px', fontSize: 13, fontWeight: on ? 700 : 400, cursor: 'pointer' }}>
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
const scroll: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px 16px calc(24px + env(safe-area-inset-bottom))' }
function row(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, padding: 6,
    background: active ? 'var(--ink-raised)' : 'var(--ink-2)',
    border: `0.5px solid ${active ? 'var(--signal)' : 'var(--slate)'}`,
    borderRadius: 10, touchAction: 'pan-y', userSelect: 'none',
    boxShadow: active ? '0 8px 24px rgba(0,0,0,.5)' : 'none',
    transform: active ? 'scale(1.02)' : 'none', transition: 'transform .1s, box-shadow .1s',
  }
}
const sheetOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(8,7,10,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const sheet: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 'var(--shell)', background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)', borderRadius: '20px 20px 0 0', padding: '10px 18px calc(20px + env(safe-area-inset-bottom))' }
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
