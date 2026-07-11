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
 * Motiv-bewusster Zuschnitt fuer den Video-Export: Cloudinary c_fill,g_auto (Smart-Crop)
 * auf die gewuenschte Groesse. Nicht-Cloudinary-URLs bleiben unveraendert (Roh-Center-Cover).
 */
export function smartCropUrl(url: string, w: number, h: number): string {
  if (url.includes('res.cloudinary.com') && url.includes('/upload/') && !url.includes('/upload/c_')) {
    return url.replace('/upload/', `/upload/c_fill,g_auto,w_${w},h_${h},q_auto,f_auto/`)
  }
  return url
}

/**
 * Liest die GPS-Koordinaten (Aufnahmeort) direkt aus dem EXIF der JPEG-Datei –
 * clientseitig, bevor irgendetwas hochgeladen wird. Gibt null zurueck, wenn die
 * Datei kein JPEG ist oder kein GPS traegt (z. B. weil iOS es entfernt hat).
 */
async function exifGps(file: File): Promise<{ lat: number; lng: number } | null> {
  try {
    const buf = await file.slice(0, 512 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return null // kein JPEG
    // JPEG-Segmente scannen bis zum APP1/Exif-Block
    let off = 2
    let tiff = -1
    while (off + 4 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) break
      const marker = v.getUint8(off + 1)
      if (marker === 0xda || marker === 0xd9) break // Bilddaten/Ende: kein Exif mehr
      const size = v.getUint16(off + 2)
      if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
        tiff = off + 10 // 'Exif\0\0' -> TIFF-Header beginnt hier
        break
      }
      off += 2 + size
    }
    if (tiff < 0) return null
    const le = v.getUint16(tiff) === 0x4949 // Byte-Reihenfolge: 'II' = little endian
    if (!le && v.getUint16(tiff) !== 0x4d4d) return null
    const u16 = (o: number) => v.getUint16(o, le)
    const u32 = (o: number) => v.getUint32(o, le)
    // IFD0 durchsuchen -> Zeiger auf das GPS-IFD (Tag 0x8825)
    const ifd = tiff + u32(tiff + 4)
    let gps = -1
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (u16(e) === 0x8825) { gps = tiff + u32(e + 8); break }
    }
    if (gps < 0) return null
    // GPS-IFD: Tag 1/3 = N-S/E-W-Referenz, Tag 2/4 = je 3 Rationale (Grad, Min, Sek)
    const rat3 = (o: number) => [0, 1, 2].map((k) => {
      const den = u32(o + k * 8 + 4)
      return den ? u32(o + k * 8) / den : 0
    })
    let latRef = ''
    let lngRef = ''
    let latD: number[] | null = null
    let lngD: number[] | null = null
    const gn = u16(gps)
    for (let i = 0; i < gn; i++) {
      const e = gps + 2 + i * 12
      const tag = u16(e)
      if (tag === 1) latRef = String.fromCharCode(v.getUint8(e + 8))
      else if (tag === 2) latD = rat3(tiff + u32(e + 8))
      else if (tag === 3) lngRef = String.fromCharCode(v.getUint8(e + 8))
      else if (tag === 4) lngD = rat3(tiff + u32(e + 8))
    }
    if (!latD || !lngD) return null
    let lat = latD[0] + latD[1] / 60 + latD[2] / 3600
    let lng = lngD[0] + lngD[1] / 60 + lngD[2] / 3600
    if (latRef === 'S') lat = -lat
    if (lngRef === 'W') lng = -lng
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null
    return { lat, lng }
  } catch {
    return null // defekte/unerwartete Struktur: still auf Fallback gehen
  }
}

/** Aktuelle Geraeteposition (letzter Fallback, wenn das Foto kein EXIF-GPS traegt). */
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

/** Parst EXIF-GPS aus der Cloudinary-Antwort (Zahl oder DMS-String wie `45 deg 30' 12.34" N`). */
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
 * Koordinaten-Prioritaet: 1) EXIF aus der Datei (Aufnahmeort),
 * 2) EXIF aus der Cloudinary-Antwort, 3) Geraetestandort beim Upload.
 */
export async function uploadPhoto(file: File): Promise<UploadResult> {
  if (!cloudinaryReady) {
    const url = URL.createObjectURL(file)
    return { url, thumbUrl: url }
  }
  const exifPos = await exifGps(file) // Aufnahmeort direkt aus der Datei
  const posP = exifPos ? null : devicePos() // GPS-Fix nur noetig, wenn EXIF fehlt

  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', PRESET!)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Upload fehlgeschlagen')
  const data = await res.json()

  let lat: number | undefined = exifPos?.lat
  let lng: number | undefined = exifPos?.lng
  if (lat === undefined || lng === undefined) {
    lat = toDec(data?.coordinates?.exif?.[0]?.[0])
    lng = toDec(data?.coordinates?.exif?.[0]?.[1])
  }
  if (lat === undefined || lng === undefined) {
    const im = data?.image_metadata ?? data?.exif
    lat = toDec(im?.GPSLatitude, im?.GPSLatitudeRef)
    lng = toDec(im?.GPSLongitude, im?.GPSLongitudeRef)
  }
  if (lat === undefined || lng === undefined) {
    const dev = posP ? await posP : null
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