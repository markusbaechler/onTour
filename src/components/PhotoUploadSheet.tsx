import { useRef, useState } from 'react'
import { uploadPhoto, cloudinaryReady } from '../lib/cloudinary'
import { queuePhoto } from '../lib/outbox'
import { toast } from '../lib/toast'
import { trip } from '../data/trip'
import { stageDate } from '../lib/format'
import { Avatar } from './Avatar'
import { IcCamera, IcX } from './Icons'
import type { Photo } from '../types'

interface Props {
  author: string
  defaultStageId: string
  onAdd: (p: Photo) => void
  onAddLocal: (p: Photo) => void
  onClose: () => void
}

/** Zentraler Upload-Flow (Bottom-Sheet): Autor + Etappen-Auswahl, dann Dateien waehlen. */
export function PhotoUploadSheet({ author, defaultStageId, onAdd, onAddLocal, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [stageId, setStageId] = useState(defaultStageId)
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setCount(files.length)
    let added = 0
    let buffered = 0
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      try {
        const r = await uploadPhoto(file)
        onAdd({ id, stageId, url: r.url, thumbUrl: r.thumbUrl, author, createdAt, lat: r.lat, lng: r.lng })
        added++
      } catch {
        const local = URL.createObjectURL(file)
        onAddLocal({ id, stageId, url: local, thumbUrl: local, author, createdAt })
        await queuePhoto(file, { id, stageId, author, createdAt })
        buffered++
      }
    }
    if (added) toast.success(`${added} Foto${added > 1 ? 's' : ''} hinzugefügt`)
    if (buffered) toast.info(`${buffered} Foto${buffered > 1 ? 's' : ''} offline gepuffert – sendet bei Verbindung`)
    setBusy(false)
    setCount(0)
    if (input.current) input.current.value = ''
    onClose()
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up" style={sheet}>
        <div style={handle} />
        <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        <span className="eyebrow">Fotos hinzufügen</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 18px' }}>
          <Avatar name={author} size={32} />
          <div style={{ fontSize: 14 }}>als <strong>{author}</strong></div>
          {!cloudinaryReady && <span className="pill plan" style={{ marginLeft: 'auto' }}>Demo</span>}
        </div>

        <span className="lbl" style={{ display: 'block', marginBottom: 8 }}>Etappe</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '34vh', overflowY: 'auto', marginBottom: 18 }}>
          {trip.stages.map((s) => {
            const active = s.id === stageId
            return (
              <button key={s.id} onClick={() => setStageId(s.id)} style={stageRow(active)}>
                <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 12 }}>T{s.day}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{s.from} → {s.to}</span>
                <span className="mono muted" style={{ fontSize: 11, flexShrink: 0 }}>{stageDate(trip.startDate, s.day - 1)}</span>
              </button>
            )
          })}
        </div>

        <button className="btn" disabled={busy} onClick={() => input.current?.click()} style={{ width: '100%' }}>
          <IcCamera size={18} /> {busy ? `Lädt ${count}…` : 'Fotos auswählen'}
        </button>
        <input ref={input} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
      </div>
    </div>
  )
}

function stageRow(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px',
    background: active ? 'rgba(255,138,61,.10)' : 'transparent',
    border: `0.5px solid ${active ? 'var(--signal-dim)' : 'var(--slate)'}`,
    borderRadius: 8, cursor: 'pointer', color: 'var(--snow)',
  }
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,7,10,.7)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
}
const sheet: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 'var(--shell)',
  background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)',
  borderRadius: '20px 20px 0 0', padding: '10px 18px calc(24px + env(safe-area-inset-bottom))',
}
const handle: React.CSSProperties = { width: 38, height: 4, borderRadius: 999, background: 'var(--slate-strong)', margin: '2px auto 12px' }
const closeBtn: React.CSSProperties = { position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 6 }
