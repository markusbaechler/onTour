import { useCallback, useEffect, useRef, useState } from 'react'
import type { Actual, Comment, Photo, Reaction, RiderLocation } from '../types'
import { applyPhotoPatch, dataApiReady, loadData, loadLive, primeLocalData, type DataStore, type LiveStore, type Op, type PhotoPatch } from './dataApi'
import { dispatch, onOutboxDrop, useOutbox } from './outbox'
import { toast } from './toast'

const LIVE_POLL_MS = 45_000 // Betrachter pollen alle ~45 s
const DATA_POLL_MS = 60_000 // Fotos/Zeiten/Kommentare: stiller Refresh ~1 Min
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
  const [error, setError] = useState(false)
  const dataRef = useRef(data)
  dataRef.current = data

  // Wächter fuer den stillen Refresh: nie Serverstand druebernudeln,
  // solange eigene Aenderungen noch unterwegs sind.
  const { pending } = useOutbox()
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const lastMutRef = useRef(0)

  const reload = useCallback(() => {
    setLoading(true); setError(false)
    loadData()
      .then((d) => {
        const seeded = !dataApiReady && d.actuals.length === 0 && d.photos.length === 0
        if (seeded) primeLocalData(demoSeed) // Seed lokal sichern, sonst loescht ihn der erste Op
        setData(seeded ? demoSeed : d)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  useEffect(() => { reload() }, [reload])

  // Stiller Hintergrund-Refresh: kein Spinner, Fehler werden geschluckt.
  // Wird uebersprungen bzw. verworfen, wenn zwischenzeitlich lokal mutiert wurde
  // oder die Outbox noch Eintraege hat (optimistische Updates bleiben erhalten).
  const silentRefresh = useCallback(() => {
    if (!dataApiReady) return
    if (pendingRef.current > 0) return
    const started = Date.now()
    loadData()
      .then((d) => {
        if (pendingRef.current > 0) return
        if (lastMutRef.current > started) return
        setData(d)
      })
      .catch(() => { /* naechster Zyklus versucht es wieder */ })
  }, [])

  useEffect(() => {
    if (!dataApiReady) return
    const tick = () => { if (document.visibilityState !== 'hidden') silentRefresh() }
    const t = setInterval(tick, DATA_POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') silentRefresh() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [silentRefresh])

  // Sobald die Outbox leer wird (alles gesendet): einmal frisch vom Server ziehen.
  const prevPendingRef = useRef(pending)
  useEffect(() => {
    if (prevPendingRef.current > 0 && pending === 0) silentRefresh()
    prevPendingRef.current = pending
  }, [pending, silentRefresh])

  useEffect(() => {
    let active = true
    const pollLive = () => loadLive().then((l) => active && setLive(l))
    pollLive()
    const t = setInterval(pollLive, LIVE_POLL_MS)
    return () => { active = false; clearInterval(t) }
  }, [])

  // Endgueltig fehlgeschlagene Outbox-Eintraege: optimistische Aenderung zuruecknehmen + Fehler-Toast.
  useEffect(() => {
    onOutboxDrop((item) => {
      if (item.kind === 'photo') {
        setData((p) => ({ ...p, photos: p.photos.filter((x) => x.id !== item.meta.id) }))
        toast.error('Foto konnte nicht gesendet werden')
        return
      }
      const op = item.op
      switch (op.op) {
        case 'addComment':
          setData((p) => ({ ...p, comments: p.comments.filter((c) => c.id !== op.comment.id) }))
          toast.error('Kommentar konnte nicht gesendet werden'); break
        case 'addPhoto':
          setData((p) => ({ ...p, photos: p.photos.filter((x) => x.id !== op.photo.id) }))
          toast.error('Foto konnte nicht gesendet werden'); break
        case 'addReaction':
          setData((p) => ({ ...p, reactions: p.reactions.filter((r) => !(r.photoId === op.reaction.photoId && r.author === op.reaction.author && r.emoji === op.reaction.emoji)) }))
          toast.error('Reaktion konnte nicht gesendet werden'); break
        case 'removeReaction':
          setData((p) => ({ ...p, reactions: [...p.reactions, { photoId: op.photoId, author: op.author, emoji: op.emoji, createdAt: new Date().toISOString() }] }))
          toast.error('Reaktion konnte nicht entfernt werden'); break
        default:
          toast.error('Aktion konnte nicht gesendet werden')
      }
    })
  }, [])

  // Optimistisches Update + Operation ueber die Outbox (Offline-Puffer + Retry)
  const apply = useCallback((next: DataStore, op: Op) => {
    lastMutRef.current = Date.now()
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
    lastMutRef.current = Date.now()
    setData((prev) => ({ ...prev, photos: [p, ...prev.photos] }))
  }, [])

  const removePhoto = useCallback((id: string) => {
    const d = dataRef.current
    apply({ ...d, photos: d.photos.filter((p) => p.id !== id) }, { op: 'removePhoto', id })
  }, [apply])

  // Funktionales Update: mehrere updatePhoto-Aufrufe in einer Schleife kompoundieren korrekt,
  // statt sich gegenseitig zu ueberschreiben (dataRef aktualisiert erst beim Re-Render).
  const updatePhoto = useCallback((id: string, patch: PhotoPatch) => {
    lastMutRef.current = Date.now()
    setData((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === id ? applyPhotoPatch(p, patch) : p)) }))
    dispatch({ op: 'updatePhoto', id, patch })
  }, [])

  // Atomarer Batch: EINE lokale State-Aktualisierung fuer viele Fotos (z. B. Sortier-Insert /
  // Tagwechsel: ganze Ziel-Etappe neu durchnummerieren). Jede Mutation setzt stageId UND
  // orderKey gemeinsam -> kein Zwei-Schritt-Race. Aus dem freshen `prev` abgeleitet, nicht aus
  // einem veralteten Render-Scope-Array. Jede Aenderung wird zusaetzlich als Op persistiert.
  const updatePhotos = useCallback((updates: Array<{ id: string; patch: PhotoPatch }>) => {
    if (updates.length === 0) return
    lastMutRef.current = Date.now()
    const patchById = new Map(updates.map((u) => [u.id, u.patch]))
    setData((prev) => ({ ...prev, photos: prev.photos.map((p) => { const patch = patchById.get(p.id); return patch ? applyPhotoPatch(p, patch) : p }) }))
    for (const u of updates) dispatch({ op: 'updatePhoto', id: u.id, patch: u.patch })
  }, [])

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

  return { ...data, live, loading, error, reload, upsertActual, addPhoto, addPhotoLocal, removePhoto, updatePhoto, updatePhotos, addComment, toggleReaction, setLocation }
}