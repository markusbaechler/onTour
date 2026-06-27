import type { Actual, Comment, Photo, Reaction, RiderLocation } from '../types'

const API = import.meta.env.VITE_DATA_API
export const dataApiReady = Boolean(API)

export interface DataStore {
  actuals: Actual[]
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
}
export type LiveStore = Record<string, RiderLocation>

const emptyData: DataStore = { actuals: [], photos: [], comments: [], reactions: [] }
const LS_DATA = 'alpes-data-v2' // v2: alten Demo-Seed (vorbelegte „gefahren"-Etappen) verwerfen
const LS_LIVE = 'alpes-live'

const readLS = <T,>(k: string, fallback: T): T => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(k) ?? '{}') } } catch { return fallback }
}
const writeLS = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))

/** Eine Operation = ein POST. Demo-Modus (kein API): lokal auf localStorage anwenden. */
export type Op =
  | { op: 'upsertActual'; actual: Actual }
  | { op: 'addPhoto'; photo: Photo }
  | { op: 'removePhoto'; id: string }
  | { op: 'addComment'; comment: Comment }
  | { op: 'removeComment'; id: string }
  | { op: 'addReaction'; reaction: Reaction }
  | { op: 'removeReaction'; photoId: string; author: string; emoji: string }
  | { op: 'setLocation'; rider: string; lat: number; lng: number; accuracy?: number; speed?: number; heading?: number }

/** Schreibt einen Startbestand lokal (Demo), damit der erste Op ihn nicht verdraengt. */
export function primeLocalData(data: DataStore) {
  if (!dataApiReady) writeLS(LS_DATA, data)
}

export async function loadData(): Promise<DataStore> {
  if (!dataApiReady) return readLS(LS_DATA, emptyData)
  try {
    const res = await fetch(`${API}?scope=data`)
    return { ...emptyData, ...(await res.json()) }
  } catch { return readLS(LS_DATA, emptyData) }
}

export async function loadLive(): Promise<LiveStore> {
  if (!dataApiReady) return readLS<LiveStore>(LS_LIVE, {})
  try {
    const res = await fetch(`${API}?scope=live`)
    return (await res.json()) as LiveStore
  } catch { return readLS<LiveStore>(LS_LIVE, {}) }
}

export async function sendOp(op: Op): Promise<void> {
  if (dataApiReady) {
    // Wirft bei Netz- oder HTTP-Fehler -> die Outbox kann erneut versuchen.
    const res = await fetch(API!, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(op) })
    if (!res.ok) throw new Error(`sendOp ${res.status}`)
    return
  }
  // Demo-Fallback: Operation lokal anwenden (spiegelt die Server-Merge-Logik)
  if (op.op === 'setLocation') {
    const live = readLS<LiveStore>(LS_LIVE, {})
    live[op.rider] = { rider: op.rider, lat: op.lat, lng: op.lng, at: new Date().toISOString(), accuracy: op.accuracy, speed: op.speed, heading: op.heading }
    writeLS(LS_LIVE, live)
    return
  }
  const d = readLS(LS_DATA, emptyData)
  switch (op.op) {
    case 'upsertActual': {
      const i = d.actuals.findIndex((a) => a.stageId === op.actual.stageId)
      if (i >= 0) d.actuals[i] = op.actual; else d.actuals.push(op.actual); break
    }
    case 'addPhoto': d.photos.unshift(op.photo); break
    case 'removePhoto': d.photos = d.photos.filter((p) => p.id !== op.id); break
    case 'addComment': d.comments.push(op.comment); break
    case 'removeComment': d.comments = d.comments.filter((c) => c.id !== op.id); break
    case 'addReaction':
      if (!d.reactions.some((r) => r.photoId === op.reaction.photoId && r.author === op.reaction.author && r.emoji === op.reaction.emoji)) d.reactions.push(op.reaction)
      break
    case 'removeReaction':
      d.reactions = d.reactions.filter((r) => !(r.photoId === op.photoId && r.author === op.author && r.emoji === op.emoji)); break
  }
  writeLS(LS_DATA, d)
}
