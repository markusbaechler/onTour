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

/**
 * Laedt ein Foto zu Cloudinary (unsigned). Ohne Konfiguration wird das Bild
 * lokal als Object-URL gehalten (Demo-Modus, nur im eigenen Browser sichtbar).
 */
export async function uploadPhoto(file: File): Promise<UploadResult> {
  if (!cloudinaryReady) {
    const url = URL.createObjectURL(file)
    return { url, thumbUrl: url }
  }
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', PRESET!)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Upload fehlgeschlagen')
  const data = await res.json()
  const lat = data?.coordinates?.exif?.[0]?.[0]
  const lng = data?.coordinates?.exif?.[0]?.[1]
  return {
    url: data.secure_url as string,
    thumbUrl: thumbFrom(data.secure_url as string),
    lat: typeof lat === 'number' ? lat : undefined,
    lng: typeof lng === 'number' ? lng : undefined,
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
