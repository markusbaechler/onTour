import { useEffect, useState } from 'react'
import { trip } from '../data/trip'
import { passNames } from '../data/passNames'
import { parseGpxProfile, type ProfilePt } from './gpx'

// Pass = die Route kreuzt einen benannten Pass aus dem Gazetteer (src/data/passNames.ts,
// OSM mountain_pass/saddle). PASS_CROSS_THRESHOLD justiert die Trefferzahl (~48).
export const PASS_CROSS_THRESHOLD = 350 // m – bis hierher gilt ein Pass als gekreuzt
const SMOOTH_WINDOW = 3 // Glaettung des Hoehenprofils gegen GPS-Rauschen
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

function smoothEle(pts: ProfilePt[], w: number): number[] {
  const e = pts.map((p) => p.ele)
  return e.map((_, i) => {
    let s = 0, c = 0
    for (let j = -w; j <= w; j++) { const k = i + j; if (k >= 0 && k < e.length) { s += e[k]; c++ } }
    return s / c
  })
}

/**
 * Pass-Erkennung: die Route kreuzt einen benannten Pass (Gazetteer aus OSM) innerhalb
 * PASS_CROSS_THRESHOLD. So sind alle Paesse echt benannt. Hoechster Punkt, Anstieg und
 * Hoehenprofil stammen aus dem GPX.
 */
export function analyzeStage(profile: ProfilePt[]): StageStats {
  if (profile.length < 2) return { passes: [], highest: 0, ascent: 0, km: 0, profile: [], curves: 0 }
  const ele = smoothEle(profile, SMOOTH_WINDOW)
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

  let ascent = 0
  for (let i = 1; i < ele.length; i++) if (ele[i] > ele[i - 1]) ascent += ele[i] - ele[i - 1]

  const total = cum[cum.length - 1]

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

  return { passes, highest: Math.round(Math.max(...ele)), ascent: Math.round(ascent), km: Math.round(total / 1000), profile: sampleProfile, curves }
}

/** Laedt alle Roadbook-GPX einmalig und liefert Pass-/Hoehen-/Anstiegsstatistik je Etappe. */
export function useStageStats(base: string): Record<string, StageStats> {
  const [stats, setStats] = useState<Record<string, StageStats>>({})
  useEffect(() => {
    let on = true
    Promise.all(trip.stages.map(async (s) => {
      try {
        const text = await (await fetch(`${base}${s.gpxUrl}`)).text()
        return [s.id, analyzeStage(parseGpxProfile(text))] as const
      } catch {
        return [s.id, { passes: [], highest: 0, ascent: s.plannedAscent, km: s.plannedKm, profile: [], curves: 0 }] as const
      }
    })).then((entries) => { if (on) setStats(Object.fromEntries(entries)) })
    return () => { on = false }
  }, [base])
  return stats
}
