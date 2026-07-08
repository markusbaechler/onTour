import type { LatLng } from '../types'


/**
 * Namespace-/Dialekt-tolerante Punktsuche: findet trkpt/rtept unabhaengig von
 * Praefixen (z. B. <ns:trkpt>) und faellt bei reinen Wegpunkt-Dateien auf <wpt>
 * zurueck. Deckt damit die Exporte gaengiger Routenplaner ab.
 */
function pointEls(doc: Document): Element[] {
  const root = doc.documentElement
  const all = root ? [root as Element, ...Array.from(root.querySelectorAll('*'))] : []
  const by = (n: string) => all.filter((e) => (e.localName || e.tagName).replace(/^.*:/, '') === n)
  const tp = by('trkpt')
  if (tp.length) return tp
  const rp = by('rtept')
  if (rp.length) return rp
  return by('wpt')
}
/** Erstes <ele>-Kind eines Punkts, praefix-tolerant. */
function eleOf(p: Element): number {
  for (const c of Array.from(p.children)) {
    if ((c.localName || c.tagName).replace(/^.*:/, '') === 'ele') return parseFloat(c.textContent ?? '')
  }
  return NaN
}

/** Parst GPX-Text zu einer Liste von [lat, lng]. Unterstuetzt trkpt und rtept. */
export function parseGpx(text: string): LatLng[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const pts = pointEls(doc)
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

export interface GpxDetail {
  track: LatLng[]
  ascent: number
  km: number
  name?: string
}

/** Parst Track inkl. Hoehenmeter (positive ele-Summe) und Name aus GPX-Text. */
export function parseGpxDetailed(text: string): GpxDetail {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return { track: [], ascent: 0, km: 0 }
  const pts = pointEls(doc)
  const track: LatLng[] = []
  let ascent = 0
  let prevEle: number | null = null
  pts.forEach((p) => {
    const lat = parseFloat(p.getAttribute('lat') ?? '')
    const lng = parseFloat(p.getAttribute('lon') ?? '')
    if (Number.isNaN(lat) || Number.isNaN(lng)) return
    track.push([lat, lng])
    const ele = eleOf(p)
    if (!Number.isNaN(ele)) {
      if (prevEle !== null && ele > prevEle) ascent += ele - prevEle
      prevEle = ele
    }
  })
  const name = doc.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim() || undefined
  return { track, ascent: Math.round(ascent), km: Math.round(trackDistanceKm(track)), name }
}

export interface ProfilePt { lat: number; lng: number; ele: number }

/** Punkte mit Hoehe fuer die Pass-Erkennung (nur Punkte mit ele). */
export function parseGpxProfile(text: string): ProfilePt[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const out: ProfilePt[] = []
  pointEls(doc).forEach((p) => {
    const lat = parseFloat(p.getAttribute('lat') ?? '')
    const lng = parseFloat(p.getAttribute('lon') ?? '')
    const ele = eleOf(p)
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && !Number.isNaN(ele)) out.push({ lat, lng, ele })
  })
  return out
}

export interface Waypoint { lat: number; lng: number; name: string }

/** Benannte Wegpunkte (<wpt>) – dienen als Namens-Gazetteer fuer erkannte Paesse. */
export function parseGpxWaypoints(text: string): Waypoint[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return []
  const out: Waypoint[] = []
  doc.querySelectorAll('wpt').forEach((w) => {
    const lat = parseFloat(w.getAttribute('lat') ?? '')
    const lng = parseFloat(w.getAttribute('lon') ?? '')
    const name = w.querySelector('name')?.textContent?.trim() ?? ''
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && name) out.push({ lat, lng, name })
  })
  return out
}

const LOCAL_GPX_PREFIX = 'alpes-gpx:'

/** Liest den GPX-Text einer trackUrl: `local:{key}` aus localStorage, sonst per fetch. */
async function readGpxText(url: string): Promise<string> {
  if (url.startsWith('local:')) return localStorage.getItem(LOCAL_GPX_PREFIX + url.slice('local:'.length)) ?? ''
  const res = await fetch(url)
  if (!res.ok) throw new Error('GPX nicht erreichbar')
  return res.text()
}

/** Laedt und parst ein GPX von einer trackUrl (Cloudinary-URL oder `local:`). */
export async function loadGpxDetailed(url: string): Promise<GpxDetail> {
  try {
    return parseGpxDetailed(await readGpxText(url))
  } catch {
    return { track: [], ascent: 0, km: 0 }
  }
}

/** Entfernt einen lokal gehaltenen GPX-Text (Demo-Modus). */
export function removeLocalGpx(url?: string) {
  if (url?.startsWith('local:')) localStorage.removeItem(LOCAL_GPX_PREFIX + url.slice('local:'.length))
}
