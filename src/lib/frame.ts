import { smartCropUrl } from './cloudinaryCrop'
import type { Photo } from '../types'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = url
  })
}

/** Foto cover-croppen auf Zielformat -> JPEG-Blob (fuer den Render als Bild-Input). */
export async function toFrame(photo: Photo, w = 1080, h = 1920): Promise<Blob> {
  const img = await loadImage(smartCropUrl(photo.url, w, h))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no ctx')
  const ir = img.width / img.height, cr = w / h
  let dw: number, dh: number
  if (ir > cr) { dh = h; dw = h * ir } else { dw = w; dh = w / ir }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9))
}
