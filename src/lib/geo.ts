import { useCallback, useEffect, useRef, useState } from 'react'
import type { RiderLocation } from '../types'

// Drossel: Standort nur senden, wenn seit dem letzten Senden >=30 s vergangen sind UND >50 m Bewegung.
const MIN_INTERVAL_MS = 30_000
const MIN_DIST_M = 50

/** Distanz zwischen zwei Koordinaten in Metern (Haversine). */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const LS_AUTO = 'alpes-autoshare'

/** Einstellung „Standort beim Öffnen automatisch teilen" (lokal, Standard: an). */
export function useAutoShare() {
  const [auto, setAuto] = useState(() => {
    try { return localStorage.getItem(LS_AUTO) !== '0' } catch { return true }
  })
  const set = useCallback((v: boolean) => {
    try { localStorage.setItem(LS_AUTO, v ? '1' : '0') } catch { /* ignore */ }
    setAuto(v)
  }, [])
  return [auto, set] as const
}

/**
 * Teilt den eigenen Standort per watchPosition, gedrosselt.
 * Optional autoShare: startet beim Öffnen/Vordergrund automatisch (mit bekanntem Namen).
 * Kein Hintergrund-GPS: stoppt automatisch, wenn die App/der Tab in den Hintergrund geht.
 */
export function useGeoShare(
  onLocation: (loc: Omit<RiderLocation, 'at'>) => void,
  opts?: { riderName?: string; autoShare?: boolean },
) {
  const riderName = opts?.riderName ?? ''
  const autoShare = opts?.autoShare ?? false
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null)
  const rider = useRef('')
  const onLoc = useRef(onLocation)
  onLoc.current = onLocation

  const stop = useCallback(() => {
    if (watchId.current != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    last.current = null
    setSharing(false)
  }, [])

  const start = useCallback((riderName: string) => {
    if (!('geolocation' in navigator)) { setError('Standort wird vom Geraet nicht unterstuetzt.'); return }
    if (!riderName.trim()) return
    // idempotent: laufende Beobachtung zuerst beenden (kein doppelter Watch)
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    setError(null)
    rider.current = riderName.trim()
    setSharing(true)
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading, accuracy } = pos.coords
        const now = Date.now()
        const l = last.current
        // Erster Fix: sofort senden. Danach nur bei >=30 s UND >50 m.
        if (l && (now - l.at < MIN_INTERVAL_MS || distanceM(l.lat, l.lng, latitude, longitude) <= MIN_DIST_M)) return
        last.current = { at: now, lat: latitude, lng: longitude }
        onLoc.current({
          rider: rider.current,
          lat: latitude,
          lng: longitude,
          speed: speed ?? undefined,
          heading: heading ?? undefined,
          accuracy: accuracy ?? undefined,
        })
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'Standort-Freigabe verweigert.' : 'Standort nicht verfuegbar.'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )
  }, [])

  // Stoppt im Hintergrund (kein Hintergrund-GPS) und beim Verlassen.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') stop() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', stop)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', stop)
      stop()
    }
  }, [stop])

  // Auto-Teilen: beim Öffnen und bei Rückkehr in den Vordergrund automatisch starten.
  useEffect(() => {
    if (!autoShare || !riderName) return
    const onVisible = () => { if (document.visibilityState === 'visible') start(riderName) }
    if (document.visibilityState === 'visible') start(riderName)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [autoShare, riderName, start])

  return { sharing, error, start, stop }
}
