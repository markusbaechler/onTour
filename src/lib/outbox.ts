import { useEffect, useState } from 'react'
import { dataApiReady, sendOp, type Op } from './dataApi'
import { cloudinaryReady, uploadPhoto } from './cloudinary'

// Offline-Outbox: puffert Operationen (Kommentare/Reaktionen/Standort/Actuals/
// Foto-Metadaten) und Foto-Uploads bei fehlendem Netz und sendet automatisch,
// sobald wieder online. Reihenfolge bleibt erhalten (FIFO). Im Demo-Modus
// (kein Backend) bleibt alles synchron-lokal – die Outbox wird nicht aktiv.

const OPS_KEY = 'alpes-outbox'
const DB_NAME = 'alpes-outbox'
const STORE = 'blobs'

interface PhotoMeta { id: string; stageId: string; author: string; caption?: string; createdAt: string }
type Item =
  | { id: string; kind: 'op'; op: Op; attempts: number }
  | { id: string; kind: 'photo'; blobId: string; meta: PhotoMeta; attempts: number }

function loadQueue(): Item[] {
  try { return JSON.parse(localStorage.getItem(OPS_KEY) ?? '[]') } catch { return [] }
}

let queue: Item[] = loadQueue()
let online = typeof navigator !== 'undefined' ? navigator.onLine : true
let flushing = false
const listeners = new Set<() => void>()

function persist() { try { localStorage.setItem(OPS_KEY, JSON.stringify(queue)) } catch { /* Quota */ } }
function notify() { listeners.forEach((l) => l()) }

let counter = 0
function newId() { return `${Date.now().toString(36)}-${(counter++).toString(36)}` }

// --- IndexedDB fuer Foto-Blobs ---
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function putBlob(id: string, blob: Blob) {
  const d = await db()
  await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(blob, id); t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
}
async function getBlob(id: string): Promise<Blob | undefined> {
  const d = await db()
  return new Promise((res, rej) => { const t = d.transaction(STORE, 'readonly'); const rq = t.objectStore(STORE).get(id); rq.onsuccess = () => res(rq.result as Blob); rq.onerror = () => rej(rq.error) })
}
async function delBlob(id: string) {
  const d = await db()
  await new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(id); t.oncomplete = () => res(null); t.onerror = () => res(null) })
}

/** Op senden – im Demo-Modus sofort lokal, sonst ueber die Outbox (mit Retry). */
export function dispatch(op: Op) {
  if (!dataApiReady) { void sendOp(op); return }
  queue.push({ id: newId(), kind: 'op', op, attempts: 0 })
  persist(); notify(); void flush()
}

/** Foto-Datei puffern (scharf + offline): Blob in IndexedDB, Upload+Op spaeter. */
export async function queuePhoto(file: Blob, meta: PhotoMeta) {
  const blobId = newId()
  try { await putBlob(blobId, file) } catch { return }
  queue.push({ id: newId(), kind: 'photo', blobId, meta, attempts: 0 })
  persist(); notify(); void flush()
}

export async function flush() {
  if (flushing || !online || !dataApiReady) return
  flushing = true; notify()
  try {
    while (queue.length) {
      const item = queue[0]
      try {
        if (item.kind === 'op') {
          await sendOp(item.op)
        } else {
          const blob = await getBlob(item.blobId)
          if (blob && cloudinaryReady) {
            const up = await uploadPhoto(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }))
            await sendOp({ op: 'addPhoto', photo: { ...item.meta, url: up.url, thumbUrl: up.thumbUrl, lat: up.lat, lng: up.lng } })
          }
          await delBlob(item.blobId)
        }
        queue.shift(); persist(); notify()
      } catch {
        item.attempts++; persist(); notify()
        break // Reihenfolge erhalten – spaeter erneut versuchen
      }
    }
  } finally { flushing = false; notify() }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; notify(); void flush() })
  window.addEventListener('offline', () => { online = false; notify() })
  // periodischer Retry, falls Dauerfehler (z. B. Server kurz weg)
  if (dataApiReady) setInterval(() => { if (queue.length) void flush() }, 30_000)
}

/** Reaktiver Outbox-Status fuer Banner/Toasts. */
export function useOutbox() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    void flush()
    return () => { listeners.delete(l) }
  }, [])
  return { online, pending: queue.length }
}
