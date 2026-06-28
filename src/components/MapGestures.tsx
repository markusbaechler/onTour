import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { GestureHandling } from 'leaflet-gesture-handling'
import 'leaflet-gesture-handling/dist/leaflet-gesture-handling.css'

// Handler einmal global registrieren (greift fuer Karten, die danach erstellt werden).
const M = L.Map as unknown as { __gestureRegistered?: boolean }
if (!M.__gestureRegistered) {
  M.__gestureRegistered = true
  L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling as unknown as typeof L.Handler)
}

const TEXT = {
  touch: 'Zum Bewegen der Karte zwei Finger benutzen',
  scroll: 'Zum Zoomen Strg + Scrollen benutzen',
  scrollMac: 'Zum Zoomen ⌘ + Scrollen benutzen',
}

/**
 * Zwei-Finger-Geste auf Touch (ein Finger scrollt die Seite), Strg+Scrollen am Desktop –
 * mit dezentem Hinweis-Overlay. In jede eingebettete Karte als Kind einsetzen.
 */
export function MapGestures() {
  const map = useMap()
  useEffect(() => {
    const m = map as unknown as { options: Record<string, unknown>; gestureHandling?: { enable: () => void; disable: () => void } }
    m.options.gestureHandlingOptions = { text: TEXT, duration: 1800 }
    m.gestureHandling?.enable()
    return () => m.gestureHandling?.disable()
  }, [map])
  return null
}
