import { useCallback, useEffect, useState } from 'react'
import type { Actual, Photo } from '../types'
import { dataApiReady, loadStore, saveStore, type Store } from './dataApi'

// Im Demo-Modus (kein gemeinsames Backend) seedet die App ein paar Werte,
// damit Soll-Ist und Fotobuch nicht leer wirken.
const demoSeed: Store = {
  actuals: [
    { stageId: 't1', ridden: true, actualKm: 221, actualAscent: 4050, movingTime: '5:48', note: 'Galibier oben noch Schneewände.' },
    { stageId: 't2', ridden: true, actualKm: 129, actualAscent: 2810, movingTime: '4:02', note: 'Izoard top, Casse Déserte surreal.' },
  ],
  photos: [
    { id: 'd1', stageId: 't1', url: 'https://picsum.photos/seed/galibier/1200/900', thumbUrl: 'https://picsum.photos/seed/galibier/400/400', author: 'Markus', caption: 'Gipfel Galibier', createdAt: '2026-07-04T11:20:00Z' },
    { id: 'd2', stageId: 't1', url: 'https://picsum.photos/seed/lacets/1200/900', thumbUrl: 'https://picsum.photos/seed/lacets/400/400', author: 'Tom', caption: 'Kehren', createdAt: '2026-07-04T14:05:00Z' },
    { id: 'd3', stageId: 't2', url: 'https://picsum.photos/seed/izoard/1200/900', thumbUrl: 'https://picsum.photos/seed/izoard/400/400', author: 'Léa', caption: 'Casse Déserte', createdAt: '2026-07-05T10:40:00Z' },
  ],
}

export function useStore() {
  const [store, setStore] = useState<Store>({ actuals: [], photos: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadStore().then((s) => {
      if (!active) return
      const seeded = !dataApiReady && s.actuals.length === 0 && s.photos.length === 0
      setStore(seeded ? demoSeed : s)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const persist = useCallback((next: Store) => {
    setStore(next)
    void saveStore(next)
  }, [])

  const upsertActual = useCallback(
    (a: Actual) => {
      setStore((prev) => {
        const actuals = prev.actuals.some((x) => x.stageId === a.stageId)
          ? prev.actuals.map((x) => (x.stageId === a.stageId ? a : x))
          : [...prev.actuals, a]
        const next = { ...prev, actuals }
        void saveStore(next)
        return next
      })
    },
    [],
  )

  const addPhoto = useCallback((p: Photo) => {
    setStore((prev) => {
      const next = { ...prev, photos: [p, ...prev.photos] }
      void saveStore(next)
      return next
    })
  }, [])

  const removePhoto = useCallback((id: string) => {
    setStore((prev) => {
      const next = { ...prev, photos: prev.photos.filter((p) => p.id !== id) }
      void saveStore(next)
      return next
    })
  }, [])

  return { ...store, loading, upsertActual, addPhoto, removePhoto, persist }
}

export function actualFor(actuals: Actual[], stageId: string): Actual | undefined {
  return actuals.find((a) => a.stageId === stageId)
}
