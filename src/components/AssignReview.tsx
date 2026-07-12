import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeAssignments, stageDayOf, type AnalyzeResult } from '../lib/photoAssign'
import { toast } from '../lib/toast'
import { IcX, IcCheck } from './Icons'
import type { StageStats } from '../lib/passes'
import type { Photo } from '../types'

interface Props {
  photos: Photo[]
  stats: Record<string, StageStats>
  onUpdatePhotoStage: (id: string, stageId: string) => void
  onClose: () => void
}

/** Modal: EXIF-Analyse (Datum+GPS) -> Vorschlaege je Foto, Nutzer bestaetigt (kein Auto-Fix). */
export function AssignReview({ photos, stats, onUpdatePhotoStage, onClose }: Props) {
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])
  const [prog, setProg] = useState<{ done: number; total: number } | null>({ done: 0, total: photos.length })
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    analyzeAssignments(photos, stats, {}, { onProgress: (done, total) => alive.current && setProg({ done, total }) })
      .then((r) => { if (!alive.current) return; setResult(r); setProg(null); setChecked(new Set(r.assignments.map((a) => a.photoId))) })
      .catch(() => { if (alive.current) { setResult({ assignments: [], unbestimmt: 0, analyzed: 0 }); setProg(null) } })
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function applyAll() {
    if (!result) return
    let n = 0
    for (const a of result.assignments) if (checked.has(a.photoId)) { onUpdatePhotoStage(a.photoId, a.suggestedStageId); n++ }
    toast.success(n === 1 ? '1 Foto neu zugeordnet' : `${n} Fotos neu zugeordnet`)
    onClose()
  }

  const selectedCount = result ? result.assignments.filter((a) => checked.has(a.photoId)).length : 0

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">Zuordnung prüfen</span>
        <h1 className="h1" style={{ fontSize: 21, marginTop: 6, marginBottom: 14 }}>Fotos den Etappen zuordnen</h1>

        {prog ? (
          <div style={{ padding: '10px 0' }}>
            <div className="mono muted" style={{ fontSize: 12, marginBottom: 8 }}>Analysiere {prog.done}/{prog.total} … (EXIF)</div>
            <div style={{ height: 6, background: 'var(--ink-2)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%`, height: '100%', background: 'var(--signal)', transition: 'width .15s linear' }} />
            </div>
          </div>
        ) : result && result.assignments.length === 0 ? (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>Alle Zuordnungen sehen korrekt aus. ✓</p>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{result.unbestimmt} Foto{result.unbestimmt === 1 ? '' : 's'} ohne EXIF (Datum/GPS) – Zuordnung unverändert gelassen.</p>
            <button className="btn ghost" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>Schliessen</button>
          </>
        ) : result ? (
          <>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{result.assignments.length} Vorschläge · {result.unbestimmt} ohne EXIF (unverändert)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto', marginBottom: 14 }}>
              {result.assignments.map((a) => {
                const p = photoById.get(a.photoId)
                const on = checked.has(a.photoId)
                return (
                  <button key={a.photoId} onClick={() => toggle(a.photoId)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: on ? 'rgba(255,138,61,.08)' : 'var(--ink-2)', border: `0.5px solid ${on ? 'var(--signal-dim)' : 'var(--slate)'}`, borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--snow)' }}>
                    {p && <img src={p.thumbUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--ink)' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        T{stageDayOf(a.currentStageId) ?? '?'} <span style={{ color: 'var(--signal)' }}>→ T{stageDayOf(a.suggestedStageId) ?? '?'}</span>
                        <span className="pill" style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', color: a.reason === 'gps' ? 'var(--glacier)' : 'var(--mist)' }}>{a.reason === 'gps' ? 'GPS' : 'Datum'}</span>
                      </div>
                      <div className="mono muted" style={{ fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.evidence}</div>
                    </div>
                    <span style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? 'var(--signal)' : 'var(--slate-strong)'}`, background: on ? 'var(--signal)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <IcCheck size={15} />}
                    </span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={onClose}>Abbrechen</button>
              <button className="btn" style={{ flex: 2 }} disabled={selectedCount === 0} onClick={applyAll}>Ausgewählte übernehmen ({selectedCount})</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,7,10,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const sheet: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto', background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 16, padding: 18 }
const closeBtn: React.CSSProperties = { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer' }
