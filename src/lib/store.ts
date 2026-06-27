import { useCallback, useEffect, useRef, useState } from 'react'
import type { Actual, Comment, Photo, Reaction, RiderLocation } from '../types'
import { dataApiReady, loadData, loadLive, sendOp, type DataStore, type LiveStore } from './dataApi'

const LIVE_POLL_MS = 45_000 // Betrachter pollen alle ~45 s
const FRESH_MS = 15 * 60_000 // < 15 Min = "live"

const demoSeed: DataStore = {
  actuals: [
    { stageId: 't1', ridden: true, actualKm: 221, actualAscent: 4050, movingTime: '5:48', note: 'Galibier oben noch Schneewände.' },
    { stageId: 't2', ridden: true, actualKm: 129, actualAscent: 2810, movingTime: '4:02', note: 'Izoard top, Casse Déserte surreal.' },
  ],
  photos: [
    { id: 'd1', stageId: 't1', url: 'https://picsum.photos/seed/galibier/1200/900', thumbUrl: 'https://picsum.photos/seed/galibier/400/400', author: 'Markus', caption: 'Gipfel Galibier', createdAt: '2026-07-04T11:20:00Z' },
    { id: 'd2', stageId: 't1', url: 'https://picsum.photos/seed/lacets/1200/900', thumbUrl: 'https://picsum.photos/seed/lacets/400/400', author: 'Tom', caption: 'Kehren', createdAt: '2026-07-04T14:05:00Z' },
    { id: 'd3', stageId: 't2', url: 'https://picsum.photos/seed/izoard/1200/900', thumbUrl: 'https://picsum.photos/seed/izoard/400/400', author: 'Léa', caption: 'Casse Déserte', createdAt: '2026-07-05T10:40:00Z' },
  ],
  comments: [
    { id: 'c1', photoId: 'd1', author: 'Oma', text: 'Wahnsinn, passt auf euch auf da oben! 😍🙏', createdAt: '2026-07-04T12:10:00Z' },
  ],
  reactions: [
    { photoId: 'd1', author: 'Sandra', emoji: '❤️', createdAt: '2026-07-04T12:00:00Z' },
    { photoId: 'd1', author: 'Tom', emoji: '🔥', createdAt: '2026-07-04T12:30:00Z' },
  ],
}

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
      setData(seeded ? demoSeed : d)
      setLoading(false)
    })
    const pollLive = () => loadLive().then((l) => active && setLive(l))
    pollLive()
    const t = setInterval(pollLive, LIVE_POLL_MS)
    return () => { active = false; clearInterval(t) }
  }, [])

  // Optimistisches Update + Operation an den Server
  const apply = useCallback((next: DataStore, op: Parameters<typeof sendOp>[0]) => {
    setData(next)
    void sendOp(op)
  }, [])

  const upsertActual = useCallback((a: Actual) => {
    const d = dataRef.current
    const actuals = d.actuals.some((x) => x.stageId === a.stageId) ? d.actuals.map((x) => (x.stageId === a.stageId ? a : x)) : [...d.actuals, a]
    apply({ ...d, actuals }, { op: 'upsertActual', actual: a })
  }, [apply])

  const addPhoto = useCallback((p: Photo) => {
    apply({ ...dataRef.current, photos: [p, ...dataRef.current.photos] }, { op: 'addPhoto', photo: p })
  }, [apply])

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
    void sendOp({ op: 'setLocation', rider: loc.rider, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, speed: loc.speed, heading: loc.heading })
  }, [])

  return { ...data, live, loading, upsertActual, addPhoto, removePhoto, addComment, toggleReaction, setLocation }
}
