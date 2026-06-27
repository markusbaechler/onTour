import { useEffect, useState } from 'react'
import { trip } from '../data/trip'
import { parseGpxProfile, parseGpxWaypoints, type ProfilePt, type Waypoint } from './gpx'

// Justierbare Schwellen der Pass-Erkennung (kalibriert auf ~48 Paesse, Referenz Routenplaner).
export const PASS_MIN_ALTITUDE = 700 // m – tieferes Maximum gilt nicht als Pass
export const PASS_MIN_PROMINENCE = 40 // m – Mindest-Auf-/Abstieg um das Maximum
export const PASS_MIN_GAP_M = 1000 // m – Mindestabstand zwischen zwei Paessen
const SMOOTH_WINDOW = 3 // Glaettung des Hoehenprofils gegen GPS-Rauschen
const NAME_RADIUS_M = 1500 // bis hierhin wird ein Wegpunkt-Name uebernommen

export interface Pass {
  altitude: number
  lat: number
  lng: number
  distFromStart: number
  name?: string
}
export interface StageStats {
  passes: Pass[]
  highest: number
  ascent: number
  km: number
}

const R = 6_371_000
const rad = (d: number) => (d * Math.PI) / 180
function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
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
 * Erkennt Paesse aus dem Hoehenprofil: lokale Maxima >= PASS_MIN_ALTITUDE, die von
 * einem Auf- und einem Abstieg von je >= PASS_MIN_PROMINENCE eingerahmt sind
 * (Hill-Segmentierung). Anschliessend Mindestabstand (hoeheren Pass behalten).
 * Pass-Anzahl, hoechster Punkt und Anstieg stammen alle aus demselben GPX.
 */
export function analyzeStage(profile: ProfilePt[], waypoints: Waypoint[]): StageStats {
  if (profile.length < 2) return { passes: [], highest: 0, ascent: 0, km: 0 }
  const ele = smoothEle(profile, SMOOTH_WINDOW)
  const cum = [0]
  for (let i = 1; i < profile.length; i++) cum.push(cum[i - 1] + meters(profile[i - 1].lat, profile[i - 1].lng, profile[i].lat, profile[i].lng))

  const raw: number[] = []
  let up = true, valley = ele[0], peakE = ele[0], peakI = 0, lastV = ele[0]
  for (let i = 1; i < ele.length; i++) {
    const e = ele[i]
    if (up) {
      if (e >= peakE) { peakE = e; peakI = i }
      else if (peakE - e >= PASS_MIN_PROMINENCE) {
        if (peakE >= PASS_MIN_ALTITUDE && peakE - lastV >= PASS_MIN_PROMINENCE) raw.push(peakI)
        up = false; valley = e
      }
    } else {
      if (e <= valley) valley = e
      else if (e - valley >= PASS_MIN_PROMINENCE) { lastV = valley; up = true; peakE = e; peakI = i }
    }
  }

  // Mindestabstand: bei zwei nahen Maxima das hoehere behalten
  raw.sort((a, b) => cum[a] - cum[b])
  const kept: number[] = []
  for (const i of raw) {
    const nIdx = kept.findIndex((k) => Math.abs(cum[k] - cum[i]) < PASS_MIN_GAP_M)
    if (nIdx < 0) kept.push(i)
    else if (ele[i] > ele[kept[nIdx]]) kept[nIdx] = i
  }

  const passes: Pass[] = kept.map((i) => {
    const p = profile[i]
    let name: string | undefined
    let best = NAME_RADIUS_M
    for (const w of waypoints) {
      const d = meters(p.lat, p.lng, w.lat, w.lng)
      if (d < best) { best = d; name = w.name }
    }
    return { altitude: Math.round(ele[i]), lat: p.lat, lng: p.lng, distFromStart: Math.round(cum[i]), name }
  })

  let ascent = 0
  for (let i = 1; i < ele.length; i++) if (ele[i] > ele[i - 1]) ascent += ele[i] - ele[i - 1]
  return { passes, highest: Math.round(Math.max(...ele)), ascent: Math.round(ascent), km: Math.round(cum[cum.length - 1] / 1000) }
}

/** Laedt alle Roadbook-GPX einmalig und liefert Pass-/Hoehen-/Anstiegsstatistik je Etappe. */
export function useStageStats(base: string): Record<string, StageStats> {
  const [stats, setStats] = useState<Record<string, StageStats>>({})
  useEffect(() => {
    let on = true
    Promise.all(trip.stages.map(async (s) => {
      try {
        const text = await (await fetch(`${base}${s.gpxUrl}`)).text()
        return [s.id, analyzeStage(parseGpxProfile(text), parseGpxWaypoints(text))] as const
      } catch {
        return [s.id, { passes: [], highest: 0, ascent: s.plannedAscent, km: s.plannedKm }] as const
      }
    })).then((entries) => { if (on) setStats(Object.fromEntries(entries)) })
    return () => { on = false }
  }, [base])
  return stats
}
