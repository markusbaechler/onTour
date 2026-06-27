import type { LatLng } from '../types'

/** Parst GPX-Text zu einer Liste von [lat, lng]. Unterstuetzt trkpt und rtept. */
export function parseGpx(text: string): LatLng[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const pts = doc.querySelectorAll('trkpt, rtept')
  const out: LatLng[] = []
  pts.forEach((p) => {
    const lat = parseFloat(p.getAttribute('lat') ?? '')
    const lng = parseFloat(p.getAttribute('lon') ?? '')
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) out.push([lat, lng])
  })
  return out
}

/** Haversine-Distanz in km zwischen aufeinanderfolgenden Punkten, summiert. */
export function trackDistanceKm(track: LatLng[]): number {
  let d = 0
  for (let i = 1; i < track.length; i++) {
    const [la1, lo1] = track[i - 1]
    const [la2, lo2] = track[i]
    const R = 6371
    const dLat = ((la2 - la1) * Math.PI) / 180
    const dLon = ((lo2 - lo1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
    d += R * 2 * Math.asin(Math.sqrt(a))
  }
  return d
}

export async function fetchGpxTrack(url: string): Promise<LatLng[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    return parseGpx(await res.text())
  } catch {
    return []
  }
}

/** Parst Track inkl. Hoehenmeter (positive ele-Summe) aus GPX-Text. */
export function parseGpxDetailed(text: string): { track: LatLng[]; ascent: number; km: number } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return { track: [], ascent: 0, km: 0 }
  const pts = doc.querySelectorAll('trkpt, rtept')
  const track: LatLng[] = []
  let ascent = 0
  let prevEle: number | null = null
  pts.forEach((p) => {
    const lat = parseFloat(p.getAttribute('lat') ?? '')
    const lng = parseFloat(p.getAttribute('lon') ?? '')
    if (Number.isNaN(lat) || Number.isNaN(lng)) return
    track.push([lat, lng])
    const eleEl = p.querySelector('ele')
    const ele = eleEl ? parseFloat(eleEl.textContent ?? '') : NaN
    if (!Number.isNaN(ele)) {
      if (prevEle !== null && ele > prevEle) ascent += ele - prevEle
      prevEle = ele
    }
  })
  return { track, ascent: Math.round(ascent), km: Math.round(trackDistanceKm(track)) }
}
