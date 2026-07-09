import { useEffect, useState } from 'react'
import { trip } from '../data/trip'
import { passNames } from '../data/passNames'
import { parseGpx, parseGpxProfile, type ProfilePt } from './gpx'
import type { Actual, LatLng } from '../types'

// Pass = die Route kreuzt einen benannten Pass aus dem Gazetteer (src/data/passNames.ts,
// OSM mountain_pass/saddle). PASS_CROSS_THRESHOLD justiert die Trefferzahl (~48).
export const PASS_CROSS_THRESHOLD = 350 // m – bis hierher gilt ein Pass als gekreuzt
const DENSE_SPACING_M = 100 // Punktabstand unter dem ein Track als "aufgezeichnet" gilt
const DENSE_SMOOTH = 5 // Glaettungsfenster fuer dichte (aufgezeichnete) Tracks
export const CURVE_MIN_ANGLE = 35 // Grad – ab diesem Richtungswechsel zaehlt es als Kurve
const CURVE_MIN_STEP_M = 70 // Mindestabstand zwischen Kurven-Messpunkten (gegen Rauschen)
const PROFILE_SAMPLES = 180 // Punkte des downgesampleten Hoehenprofils

export interface Pass {
  altitude: number
  lat: number
  lng: number
  distFromStart: number
  name: string
}
/** Downgesampletes Hoehenprofil fuer Sparklines/Charts: d = Meter ab Start, e = Hoehe. */
export interface ProfilePoint { d: number; e: number }
export interface StageStats {
  passes: Pass[]
  highest: number
  ascent: number
  km: number
  profile: ProfilePoint[]
  curves: number
}

const R = 6_371_000
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = rad(bLng - aLng)
  const y = Math.sin(dLng) * Math.cos(rad(bLat))
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) - Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(dLng)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Anstieg adaptiv: Planer-/DEM-Dateien (duenne Punkte) werden roh summiert -
 * das reproduziert die Planer-Hoehenmeter exakt. Aufgezeichnete Tracks (dichte
 * Punkte) laufen durch eine kleine Hysterese, damit Messrauschen nicht zaehlt.
 */
function climb(raw: number[], dense: boolean): number {
  // Dichte Tracks (5-20 m Abstand): Glaettung ueber wenige Sekunden Fahrt -
  // toetet Messrauschen, laesst echte Anstiege unberuehrt. Duenne
  // Planer-Dateien bleiben roh, das reproduziert die Planer-Werte exakt.
  let ele = raw
  if (dense) {
    ele = raw.map((_, i) => {
      let s = 0, c = 0
      for (let j = -DENSE_SMOOTH; j <= DENSE_SMOOTH; j++) { const k = i + j; if (k >= 0 && k < raw.length) { s += raw[k]; c++ } }
      return s / c
    })
  }
  let a = 0
  for (let i = 1; i < ele.length; i++) if (ele[i] > ele[i - 1]) a += ele[i] - ele[i - 1]
  return Math.round(a)
}

/**
 * Pass-Erkennung: die Route kreuzt einen benannten Pass (Gazetteer aus OSM) innerhalb
 * PASS_CROSS_THRESHOLD. So sind alle Paesse echt benannt. Hoechster Punkt, Anstieg und
 * Hoehenprofil stammen aus dem GPX.
 */
export function analyzeStage(profile: ProfilePt[]): StageStats {
  if (profile.length < 2) return { passes: [], highest: 0, ascent: 0, km: 0, profile: [], curves: 0 }
  const ele = profile.map((p) => p.ele)
  const cum = [0]
  for (let i = 1; i < profile.length; i++) cum.push(cum[i - 1] + meters(profile[i - 1].lat, profile[i - 1].lng, profile[i].lat, profile[i].lng))

  // Benannte Paesse, deren naechster Routenpunkt < PASS_CROSS_THRESHOLD liegt
  const passes: Pass[] = []
  const usedNames = new Set<string>()
  for (const gp of passNames) {
    let best = PASS_CROSS_THRESHOLD, bi = -1
    for (let i = 0; i < profile.length; i++) {
      const d = meters(gp.lat, gp.lng, profile[i].lat, profile[i].lng)
      if (d < best) { best = d; bi = i }
    }
    if (bi >= 0 && !usedNames.has(gp.name)) {
      usedNames.add(gp.name)
      passes.push({ name: gp.name, lat: gp.lat, lng: gp.lng, altitude: gp.ele || Math.round(ele[bi]), distFromStart: Math.round(cum[bi]) })
    }
  }
  passes.sort((a, b) => a.distFromStart - b.distFromStart)

  const total = cum[cum.length - 1]
  const dense = total / (profile.length - 1) < DENSE_SPACING_M
  const ascent = climb(ele, dense)

  // Downgesampletes Hoehenprofil (gleichmaessig nach Distanz)
  const sampleProfile: ProfilePoint[] = []
  let j = 0
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    const d = (total * k) / (PROFILE_SAMPLES - 1)
    while (j < cum.length - 1 && cum[j + 1] < d) j++
    sampleProfile.push({ d: Math.round(d), e: Math.round(ele[j]) })
  }

  // Kurven: Richtungswechsel > CURVE_MIN_ANGLE an ausgeduennten Messpunkten
  const idx: number[] = [0]
  let last = 0
  for (let i = 1; i < profile.length; i++) if (cum[i] - cum[last] >= CURVE_MIN_STEP_M) { idx.push(i); last = i }
  let curves = 0
  for (let k = 1; k < idx.length - 1; k++) {
    const a = profile[idx[k - 1]], b = profile[idx[k]], c = profile[idx[k + 1]]
    let turn = bearing(b.lat, b.lng, c.lat, c.lng) - bearing(a.lat, a.lng, b.lat, b.lng)
    if (turn > 180) turn -= 360
    if (turn < -180) turn += 360
    if (Math.abs(turn) > CURVE_MIN_ANGLE) curves++
  }

  return { passes, highest: Math.round(Math.max(...ele)), ascent, km: Math.round(total / 1000), profile: sampleProfile, curves }
}

const LOCAL_GPX_PREFIX = 'alpes-gpx:'

/** Liest GPX-Text: `local:{key}` aus localStorage (Demo), sonst per fetch. */
async function gpxText(url: string): Promise<string> {
  if (url.startsWith('local:')) {
    const t = localStorage.getItem(LOCAL_GPX_PREFIX + url.slice('local:'.length))
    if (!t) throw new Error('lokales GPX fehlt')
    return t
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('GPX nicht erreichbar')
  return res.text()
}

const ELE_CACHE_PREFIX = 'alpes-ele2:' // v2: buestet evtl. vergiftete Alt-Caches
const ELE_MAX_POINTS = 600 // Stichprobe fuers Nachschlagen (Genauigkeit vs. Requests)
const ELE_CHUNK = 100 // max. Koordinaten je Open-Meteo-Request

/**
 * Schlaegt fehlende Hoehen beim freien Open-Meteo-Hoehendienst nach
 * (Copernicus DEM). Ergebnis wird je GPX-URL in localStorage gecacht,
 * damit das Nachschlagen pro Geraet nur einmal passiert.
 */
async function backfillEle(pts: ProfilePt[], cacheKey: string): Promise<ProfilePt[]> {
  try {
    const c = localStorage.getItem(ELE_CACHE_PREFIX + cacheKey)
    if (c) {
      const parsed = JSON.parse(c) as ProfilePt[]
      if (validEle(parsed)) return parsed
    }
  } catch { /* Cache defekt -> frisch laden */ }
  const step = Math.max(1, Math.ceil(pts.length / ELE_MAX_POINTS))
  const sample = pts.filter((_, i) => i % step === 0)
  let out: ProfilePt[]
  try { out = await eleOpenMeteo(sample) } catch { out = await eleOpenElevation(sample) }
  if (!validEle(out)) throw new Error('Hoehendaten unplausibel')
  try { localStorage.setItem(ELE_CACHE_PREFIX + cacheKey, JSON.stringify(out)) } catch { /* Quota */ }
  return out
}

/** Plausibel = vollstaendig, endliche Zahlen, echte Varianz (Alpenroute ist nicht flach). */
function validEle(pts: ProfilePt[]): boolean {
  if (!Array.isArray(pts) || pts.length < 2) return false
  const eles = pts.map((p) => p.ele)
  if (!eles.every((e) => Number.isFinite(e))) return false
  return Math.max(...eles) - Math.min(...eles) >= 1
}

async function eleOpenMeteo(sample: ProfilePt[]): Promise<ProfilePt[]> {
  const out: ProfilePt[] = []
  for (let i = 0; i < sample.length; i += ELE_CHUNK) {
    const part = sample.slice(i, i + ELE_CHUNK)
    const lat = part.map((p) => p.lat.toFixed(5)).join(',')
    const lng = part.map((p) => p.lng.toFixed(5)).join(',')
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`)
    if (!res.ok) throw new Error('open-meteo nicht erreichbar')
    const ele: unknown = (await res.json()).elevation
    if (!Array.isArray(ele) || ele.length !== part.length) throw new Error('open-meteo Antwort unvollstaendig')
    part.forEach((p, k) => out.push({ lat: p.lat, lng: p.lng, ele: Number(ele[k]) }))
  }
  return out
}

/** Fallback-Anbieter, falls open-meteo blockiert/gestoert ist. */
async function eleOpenElevation(sample: ProfilePt[]): Promise<ProfilePt[]> {
  const out: ProfilePt[] = []
  for (let i = 0; i < sample.length; i += ELE_CHUNK) {
    const part = sample.slice(i, i + ELE_CHUNK)
    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: part.map((p) => ({ latitude: p.lat, longitude: p.lng })) }),
    })
    if (!res.ok) throw new Error('open-elevation nicht erreichbar')
    const results: Array<{ elevation: number }> = (await res.json()).results ?? []
    if (results.length !== part.length) throw new Error('open-elevation Antwort unvollstaendig')
    part.forEach((p, k) => out.push({ lat: p.lat, lng: p.lng, ele: Number(results[k].elevation) }))
  }
  return out
}

/**
 * GPX -> Profilpunkte, zweistufig: bevorzugt Punkte MIT Hoehe (volle Statistik).
 * Fehlen Hoehendaten (typisch fuer Routen-Exporte mancher Planer), werden die
 * Punkte mit ele=0 uebernommen; die Hoehen holt dann backfillEle nach.
 */
function profileFrom(text: string): { profile: ProfilePt[]; hasEle: boolean } {
  const withEle = parseGpxProfile(text)
  if (withEle.length >= 2) return { profile: withEle, hasEle: true }
  const flat = parseGpx(text).map(([lat, lng]) => ({ lat, lng, ele: 0 }))
  return { profile: flat, hasEle: false }
}

/**
 * Laedt alle Roadbook-GPX und liefert Pass-/Hoehen-/Anstiegsstatistik je Etappe.
 * Hat eine Etappe ein Ersatz-Roadbook (actual.planTrackUrl), wird DESSEN GPX
 * analysiert – Etappenkarte, Dashboard und Gesamttour rechnen dann damit.
 * GPX ohne Hoehendaten: km/Kurven/Paesse aus den Punkten, Hoehen via Open-Meteo.
 */
export function useStageStats(base: string, actuals: Actual[] = []): Record<string, StageStats> {
  const [stats, setStats] = useState<Record<string, StageStats>>({})
  // Stabiler Schluessel: eine Zeichenkette je Etappen-Ersatz -> Effekt feuert genau bei Aenderung
  const planKey = trip.stages.map((s) => actuals.find((a) => a.stageId === s.id)?.planTrackUrl ?? '').join('|')
  useEffect(() => {
    let on = true
    const planUrls = planKey.split('|')
    Promise.all(trip.stages.map(async (s, i) => {
      try {
        const url = planUrls[i] || (s.gpxUrl ? `${base}${s.gpxUrl}` : '')
        if (!url) throw new Error('kein GPX')
        const { profile, hasEle } = profileFrom(await gpxText(url))
        if (profile.length < 2) throw new Error('keine Trackpunkte')
        // km/Kurven/Paesse aus der vollen Punktdichte (Serpentinen nicht abkuerzen)
        const baseStats = analyzeStage(profile)
        if (hasEle) return [s.id, baseStats] as const
        try {
          const withEle = analyzeStage(await backfillEle(profile, url))
          return [s.id, { ...baseStats, ascent: withEle.ascent, highest: withEle.highest, profile: withEle.profile }] as const
        } catch {
          return [s.id, baseStats] as const // Hoehendienst offline: Rest bleibt korrekt
        }
      } catch {
        return [s.id, { passes: [], highest: 0, ascent: s.plannedAscent, km: s.plannedKm, profile: [], curves: 0 }] as const
      }
    })).then((entries) => { if (on) setStats(Object.fromEntries(entries)) })
    return () => { on = false }
  }, [base, planKey])
  return stats
}

/**
 * Laedt die Ersatz-Roadbook-Tracks (actual.planTrackUrl) als Punktlisten fuer die
 * Karten: Linie, Start-/Ziel-Marker und Navigation folgen dann der Ersatzroute.
 */
export function usePlanTracks(actuals: Actual[]): Record<string, LatLng[]> {
  const [tracks, setTracks] = useState<Record<string, LatLng[]>>({})
  const sig = actuals.map((a) => `${a.stageId}:${a.planTrackUrl ?? ''}`).join('|')
  useEffect(() => {
    let on = true
    const list = actuals.filter((a) => a.planTrackUrl)
    Promise.all(list.map(async (a) => {
      try { return [a.stageId, parseGpx(await gpxText(a.planTrackUrl!))] as const }
      catch { return [a.stageId, [] as LatLng[]] as const }
    })).then((entries) => { if (on) setTracks(Object.fromEntries(entries.filter(([, t]) => t.length))) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return tracks
}

export interface PlanPlaces { from: string; to: string }
const PLACE_CACHE_PREFIX = 'alpes-place:'

/** Ortsname zu Koordinaten (freier Client-Geocoder, deutschsprachig). */
async function placeName(lat: number, lng: number): Promise<string> {
  const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=de`)
  if (!res.ok) throw new Error('Geocoder nicht erreichbar')
  const j = await res.json()
  return String(j.city || j.locality || j.principalSubdivision || '').trim()
}

/**
 * Ermittelt Start-/Zielort einer Ersatzroute per Reverse-Geocoding des ersten/
 * letzten Trackpunkts. Ergebnis wird je Route dauerhaft gecacht; ist der
 * Geocoder nicht erreichbar, bleiben die geplanten Ortsnamen stehen.
 */
export function usePlanPlaces(actuals: Actual[], planTracks: Record<string, LatLng[]>): Record<string, PlanPlaces> {
  const [places, setPlaces] = useState<Record<string, PlanPlaces>>({})
  const sig = Object.keys(planTracks).sort().map((id) => `${id}:${actuals.find((a) => a.stageId === id)?.planTrackUrl ?? ''}`).join('|')
  useEffect(() => {
    let on = true
    ;(async () => {
      const out: Record<string, PlanPlaces> = {}
      for (const [id, pts] of Object.entries(planTracks)) {
        if (pts.length < 2) continue
        const key = PLACE_CACHE_PREFIX + (actuals.find((a) => a.stageId === id)?.planTrackUrl ?? id)
        try {
          const c = localStorage.getItem(key)
          if (c) { out[id] = JSON.parse(c) as PlanPlaces; continue }
        } catch { /* Cache defekt -> frisch */ }
        try {
          const from = await placeName(pts[0][0], pts[0][1])
          const to = await placeName(pts[pts.length - 1][0], pts[pts.length - 1][1])
          if (from && to) {
            out[id] = { from, to }
            try { localStorage.setItem(key, JSON.stringify(out[id])) } catch { /* Quota */ }
          }
        } catch { /* Geocoder offline: geplante Namen bleiben */ }
      }
      if (on && Object.keys(out).length) setPlaces(out)
    })()
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return places
}

/**
 * Wie usePlanPlaces, aber mit Verkettung: Hat eine Etappe kein eigenes
 * Ersatz-Roadbook, erbt sie als Startort das (geocodete) Ziel der direkten
 * Vorgaengerin mit Ersatzroute - so stimmt der Anschluss (z. B. "Menton ->").
 */
export function useChainedPlaces(actuals: Actual[], planTracks: Record<string, LatLng[]>): Record<string, Partial<PlanPlaces>> {
  const own = usePlanPlaces(actuals, planTracks)
  const out: Record<string, Partial<PlanPlaces>> = {}
  let prevTo: string | undefined
  for (const s of trip.stages) {
    const o = own[s.id]
    const e: Partial<PlanPlaces> = {}
    if (o) { e.from = o.from; e.to = o.to }
    else if (prevTo) { e.from = prevTo }
    if (e.from || e.to) out[s.id] = e
    prevTo = o?.to // nur die direkte Nachfolgerin erbt
  }
  return out
}
