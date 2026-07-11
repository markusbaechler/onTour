import type { LatLng } from '../types'

// Zentrale Messfunktionen fuer Distanz und Anstieg. DIESELBE Rechnung fuer Soll
// (Roadbook, vorberechnet in scripts/gen-stages.mjs) UND Ist (gefahrenes GPX, zur
// Laufzeit). Wichtig: km/hm IMMER auf dem VOLLEN Track rechnen – Vereinfachung nur
// fuers Karten-Rendering, NIE vor der Messung (sonst werden Kurven "abgeschnitten"
// und die Distanz systematisch zu klein). Der Node-Generator spiegelt diese Formeln.

const R = 6_371_000 // Erdradius in m
const rad = (d: number) => (d * Math.PI) / 180

/** Haversine-Distanz in Metern zwischen zwei [lat, lng]. */
export function segMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Gesamtdistanz eines Tracks in km (Summe der Segmente ueber den vollen Track). */
export function trackKm(track: LatLng[]): number {
  let d = 0
  for (let i = 1; i < track.length; i++) d += segMeters(track[i - 1], track[i])
  return d / 1000
}

/** Positive Hoehenmeter (Summe aller Anstiege) aus einer Hoehen-Reihe. */
export function totalAscent(eles: number[]): number {
  let asc = 0
  for (let i = 1; i < eles.length; i++) if (eles[i] > eles[i - 1]) asc += eles[i] - eles[i - 1]
  return asc
}
