export type Aspect = '9:16' | '16:9'

/** Zielaufloesung je Format fuer den Export. */
export const CROP: Record<Aspect, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
}

/**
 * Motiv-bewusster Zuschnitt via Cloudinary (c_fill,g_auto). Bei Nicht-Cloudinary-URLs
 * (lokale Blobs, Fremd-Hosts) bleibt die Original-URL erhalten (Center-Cover im DOM/Export).
 */
export function smartCropUrl(url: string, w: number, h: number): string {
  if (url.includes('res.cloudinary.com') && url.includes('/upload/') && !url.includes('/upload/c_')) {
    return url.replace('/upload/', `/upload/c_fill,g_auto,w_${w},h_${h},q_auto/`)
  }
  return url
}

/** Bequemer Aspect-Helper. */
export function cropForAspect(url: string, aspect: Aspect): string {
  const { w, h } = CROP[aspect]
  return smartCropUrl(url, w, h)
}
