import { useCallback, useEffect, useRef, useState } from 'react'
import type { Actual, Comment, Photo, Reaction, RiderLocation } from '../types'
import { dataApiReady, loadData, loadLive, primeLocalData, type DataStore, type LiveStore, type Op } from './dataApi'
import { dispatch } from './outbox'

const LIVE_POLL_MS = 45_000 // Betrachter pollen alle ~45 s
const FRESH_MS = 15 * 60_000 // < 15 Min = "live"

// Kein vorbelegter Demo-Inhalt mehr: die Tour startet im echten Zustand
// (nichts „gefahren", Fotobuch/Soll-Ist leer, bis ihr selbst befuellt).
const demoSeed: DataStore = { actuals: [], photos: [], comments: [], reactions: [] }

export function actualFor(actuals: Actual[], stageId: string) {
  return actuals.find((a) => a.stageId === stageId)
}
export function isFresh(loc: RiderLocation) {
  return Date.now() - new Date(loc.at).getTime() < FRESH_MS
}

export function useStore() {
  const [data, setData] = useState<DataStore>({ actuals: [], photos: [], comments: [], reactions: [] })
  const [live, setLive] = useState<LiveStore>({})
  const [loading, setLoading] = useState(true)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    let active = true
    loadData().then((d) => {
      if (!active) return
      const seeded = !dataApiReady && d.actuals.length === 0 && d.photos.length === 0
      if (seeded) primeLocalData(demoSeed) // Seed lokal sichern, sonst loescht ihn der erste Op
      setData(seeded ? demoSeed : d)
      setLoading(false)
    })
    const pollLive = () => loadLive().then((l) => active && setLive(l))
    pollLive()
    const t = setInterval(pollLive, LIVE_POLL_MS)
    return () => { active = false; clearInterval(t) }
  }, [])

  // Optimistisches Update + Operation ueber die Outbox (Offline-Puffer + Retry)
  const apply = useCallback((next: DataStore, op: Op) => {
    setData(next)
    dispatch(op)
  }, [])

  const upsertActual = useCallback((a: Actual) => {
    const d = dataRef.current
    const actuals = d.actuals.some((x) => x.stageId === a.stageId) ? d.actuals.map((x) => (x.stageId === a.stageId ? a : x)) : [...d.actuals, a]
    apply({ ...d, actuals }, { op: 'upsertActual', actual: a })
  }, [apply])

  const addPhoto = useCallback((p: Photo) => {
    apply({ ...dataRef.current, photos: [p, ...dataRef.current.photos] }, { op: 'addPhoto', photo: p })
  }, [apply])

  // Optimistisch lokal einfuegen ohne Op (Foto wird offline gepuffert, Upload+Op via Outbox)
  const addPhotoLocal = useCallback((p: Photo) => {
    setData((prev) => ({ ...prev, photos: [p, ...prev.photos] }))
  }, [])

  const removePhoto = useCallback((id: string) => {
    const d = dataRef.current
    apply({ ...d, photos: d.photos.filter((p) => p.id !== id) }, { op: 'removePhoto', id })
  }, [apply])

  const addComment = useCallback((c: Comment) => {
    apply({ ...dataRef.current, comments: [...dataRef.current.comments, c] }, { op: 'addComment', comment: c })
  }, [apply])

  const toggleReaction = useCallback((photoId: string, author: string, emoji: string) => {
    const d = dataRef.current
    const has = d.reactions.some((r) => r.photoId === photoId && r.author === author && r.emoji === emoji)
    if (has) {
      apply({ ...d, reactions: d.reactions.filter((r) => !(r.photoId === photoId && r.author === author && r.emoji === emoji)) }, { op: 'removeReaction', photoId, author, emoji })
    } else {
      const reaction: Reaction = { photoId, author, emoji, createdAt: new Date().toISOString() }
      apply({ ...d, reactions: [...d.reactions, reaction] }, { op: 'addReaction', reaction })
    }
  }, [apply])

  const setLocation = useCallback((loc: Omit<RiderLocation, 'at'>) => {
    setLive((l) => ({ ...l, [loc.rider]: { ...loc, at: new Date().toISOString() } }))
    dispatch({ op: 'setLocation', rider: loc.rider, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, speed: loc.speed, heading: loc.heading })
  }, [])

  return { ...data, live, loading, upsertActual, addPhoto, addPhotoLocal, removePhoto, addComment, toggleReaction, setLocation }
}
