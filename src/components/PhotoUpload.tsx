import { useRef, useState } from 'react'
import { uploadPhoto, cloudinaryReady } from '../lib/cloudinary'
import { queuePhoto } from '../lib/outbox'
import { toast } from '../lib/toast'
import type { Photo } from '../types'
import { IcCamera } from './Icons'
import { Avatar } from './Avatar'

interface Props {
  stageId: string
  /** Gemerkte Identitaet = Foto-Autor (kein Dropdown mehr). */
  author: string
  onAdd: (p: Photo) => void
  /** Optimistisch lokal einfuegen, wenn offline gepuffert wird. */
  onAddLocal: (p: Photo) => void
}

export function PhotoUpload({ stageId, author, onAdd, onAddLocal }: Props) {
  const input = useRef<HTMLInputElement>(null)
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
        // scharf + offline: lokal anzeigen, Datei puffern, Upload+Op spaeter via Outbox
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
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span title={`Hochladen als ${author}`} style={{ display: 'flex' }}><Avatar name={author} size={30} /></span>
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
