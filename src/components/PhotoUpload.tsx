import { useRef, useState } from 'react'
import { uploadPhoto, cloudinaryReady } from '../lib/cloudinary'
import type { Photo } from '../types'
import { IcCamera } from './Icons'

interface Props {
  stageId: string
  riders: string[]
  onAdd: (p: Photo) => void
}

export function PhotoUpload({ stageId, riders, onAdd }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [author, setAuthor] = useState(riders[0])
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setCount(files.length)
    for (const file of Array.from(files)) {
      try {
        const r = await uploadPhoto(file)
        onAdd({
          id: crypto.randomUUID(),
          stageId,
          url: r.url,
          thumbUrl: r.thumbUrl,
          author,
          createdAt: new Date().toISOString(),
          lat: r.lat,
          lng: r.lng,
        })
      } catch {
        /* einzelner Upload fehlgeschlagen – Rest weiterlaufen lassen */
      }
    }
    setBusy(false)
    setCount(0)
    if (input.current) input.current.value = ''
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        style={{
          background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)',
          borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14,
        }}
      >
        {riders.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button className="btn" disabled={busy} onClick={() => input.current?.click()} style={{ flex: 1 }}>
        <IcCamera size={18} />
        {busy ? `Lädt ${count}…` : 'Fotos hinzufügen'}
      </button>
      <input ref={input} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} />
      {!cloudinaryReady && (
        <span className="pill plan" title="Ohne Cloudinary-Konfiguration nur lokal sichtbar">Demo</span>
      )}
    </div>
  )
}
