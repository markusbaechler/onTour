const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET

export const cloudinaryReady = Boolean(CLOUD && PRESET)

export interface UploadResult {
  url: string
  thumbUrl: string
  lat?: number
  lng?: number
}

/** Erzeugt eine optimierte Thumbnail-URL aus einer Cloudinary-Secure-URL. */
function thumbFrom(secureUrl: string): string {
  // .../upload/ -> .../upload/c_fill,w_400,h_400,q_auto,f_auto/
  return secureUrl.replace('/upload/', '/upload/c_fill,w_400,h_400,q_auto,f_auto/')
}

/** Aktuelle Geraeteposition (Fallback, wenn das Foto kein EXIF-GPS traegt). */
function devicePos(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}

/** Parst EXIF-GPS (Zahl oder DMS-String wie `45 deg 30' 12.34" N`) zu Dezimalgrad. */
function toDec(v: unknown, ref?: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return undefined
  const m = v.match(/([\d.]+)\s*(?:deg|°)?\s*(?:([\d.]+)\s*')?\s*(?:([\d.]+)\s*")?\s*([NSEW])?/i)
  if (!m) return undefined
  let dec = parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 60 : 0) + (m[3] ? parseFloat(m[3]) / 3600 : 0)
  const r = String(m[4] ?? (typeof ref === 'string' ? ref : '')).toUpperCase()
  if (r.startsWith('S') || r.startsWith('W')) dec = -dec
  return Number.isFinite(dec) ? dec : undefined
}

/**
 * Laedt ein Foto zu Cloudinary (unsigned). Ohne Konfiguration wird das Bild
 * lokal als Object-URL gehalten (Demo-Modus, nur im eigenen Browser sichtbar).
 * Koordinaten: 1) EXIF aus der Upload-Antwort, 2) sonst Geraetestandort.
 */
export async function uploadPhoto(file: File): Promise<UploadResult> {
  if (!cloudinaryReady) {
    const url = URL.createObjectURL(file)
    return { url, thumbUrl: url }
  }
  // GPS-Fix parallel zum Upload starten (kostet keine Zeit extra)
  const posP = devicePos()
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', PRESET!)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Upload fehlgeschlagen')
  const data = await res.json()

  let lat: number | undefined = toDec(data?.coordinates?.exif?.[0]?.[0])
  let lng: number | undefined = toDec(data?.coordinates?.exif?.[0]?.[1])
  if (lat === undefined || lng === undefined) {
    const im = data?.image_metadata ?? data?.exif
    lat = toDec(im?.GPSLatitude, im?.GPSLatitudeRef)
    lng = toDec(im?.GPSLongitude, im?.GPSLongitudeRef)
  }
  if (lat === undefined || lng === undefined) {
    const dev = await posP
    if (dev) { lat = dev.lat; lng = dev.lng }
  }

  return {
    url: data.secure_url as string,
    thumbUrl: thumbFrom(data.secure_url as string),
    lat,
    lng,
  }
}

const LOCAL_GPX_PREFIX = 'alpes-gpx:'

/**
 * Laedt ein GPX als resource_type:'raw' zu Cloudinary (gleiches unsigned Preset)
 * und gibt die secure_url zurueck – so sehen alle Teilnehmenden denselben Track.
 * Ohne Cloudinary (Demo) wird der GPX-Text lokal unter `local:{key}` gehalten.
 */
export async function uploadGpx(file: File, localKey: string): Promise<string> {
  if (!cloudinaryReady) {
    try { localStorage.setItem(LOCAL_GPX_PREFIX + localKey, await file.text()) } catch { /* Quota */ }
    return `local:${localKey}`
  }
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', PRESET!)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/raw/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('GPX-Upload fehlgeschlagen')
  const data = await res.json()
  return data.secure_url as string
}
