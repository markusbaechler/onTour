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
