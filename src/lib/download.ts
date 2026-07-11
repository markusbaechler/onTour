import type { Photo } from '../types'

/** Cloudinary-URL so umschreiben, dass der Browser die Datei herunterlaedt statt anzeigt. */
function attachmentUrl(url: string): string {
  // .../upload/<rest>  ->  .../upload/fl_attachment/<rest>
  if (url.includes('/upload/') && !url.includes('fl_attachment')) {
    return url.replace('/upload/', '/upload/fl_attachment/')
  }
  return url
}

function filenameFor(photo: Photo): string {
  const ext = (photo.url.split('.').pop() ?? 'jpg').split(/[?#]/)[0]
  const safeExt = /^[a-z0-9]{2,4}$/i.test(ext) ? ext : 'jpg'
  return `bbz-${photo.stageId}-${photo.id.slice(0, 8)}.${safeExt}`
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Laedt ein Foto herunter. Bevorzugt Blob-Fetch (verlaesslicher Dateiname, echter
 * Download), faellt bei CORS-/Netzfehlern auf den direkten fl_attachment-Link zurueck.
 */
export async function downloadPhoto(photo: Photo): Promise<void> {
  const url = attachmentUrl(photo.url)
  const name = filenameFor(photo)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    triggerDownload(href, name)
    setTimeout(() => URL.revokeObjectURL(href), 1500)
  } catch {
    // Fallback: direkter Link (oeffnet/laedt je nach Browser)
    triggerDownload(url, name)
  }
}
