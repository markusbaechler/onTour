#!/usr/bin/env node
// Vorberechnung der Cue Sheets (HANDOFF P4, einmalig je Roadbook).
//
//   GPX (public/roadbooks/t{N}.gpx)  ->  public/roadbooks/t{N}.cues.json
//
// Mit Map-Matching (empfohlen), wenn ein Valhalla-Endpunkt gesetzt ist:
//   VALHALLA_URL=https://valhalla1.openstreetmap.de node scripts/gen-cues.mjs
//   VALHALLA_URL=https://api.stadiamaps.com VALHALLA_KEY=dein-key node scripts/gen-cues.mjs
// Ohne Valhalla wird heuristisch aus der Track-Geometrie abgeleitet (Demo-tauglich,
// gleiche Logik wie der Laufzeit-Fallback in src/lib/nav.ts).

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROADBOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'roadbooks')
const VALHALLA_URL = process.env.VALHALLA_URL
const VALHALLA_KEY = process.env.VALHALLA_KEY

const R = 6_371_000
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI
const distanceM = (a, b) => {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const bearing = (a, b) => {
  const dLng = rad(b[1] - a[1])
  const y = Math.sin(dLng) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(dLng)
  return (deg(Math.atan2(y, x)) + 360) % 360
}
const cumulative = (t) => { const o = [0]; for (let i = 1; i < t.length; i++) o.push(o[i - 1] + distanceM(t[i - 1], t[i])); return o }

function parseGpx(xml) {
  const out = []
  const re = /<(?:trkpt|rtept)[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/g
  let m
  while ((m = re.exec(xml))) out.push([parseFloat(m[1]), parseFloat(m[2])])
  return out
}

const TYPE_TEXT = {
  depart: 'Start', arrive: 'Ziel erreicht', left: 'Links abbiegen', right: 'Rechts abbiegen',
  'slight-left': 'Leicht links', 'slight-right': 'Leicht rechts', 'sharp-left': 'Scharf links',
  'sharp-right': 'Scharf rechts', straight: 'Geradeaus', uturn: 'Wenden',
  'keep-left': 'Links halten', 'keep-right': 'Rechts halten', roundabout: 'Im Kreisel',
}
const typeFromTurn = (turn) => {
  const a = Math.abs(turn)
  if (a < 18) return 'straight'
  if (a > 150) return 'uturn'
  if (turn > 0) return a < 45 ? 'slight-right' : a > 110 ? 'sharp-right' : 'right'
  return a < 45 ? 'slight-left' : a > 110 ? 'sharp-left' : 'left'
}

function deriveCues(track) {
  if (track.length < 2) return []
  const cum = cumulative(track)
  const cues = [{ at: track[0], type: 'depart', text: TYPE_TEXT.depart, distFromStart: 0 }]
  const minStep = 60
  let last = 0
  const idx = [0]
  for (let i = 1; i < track.length; i++) if (cum[i] - cum[last] >= minStep) { idx.push(i); last = i }
  if (idx[idx.length - 1] !== track.length - 1) idx.push(track.length - 1)
  for (let k = 1; k < idx.length - 1; k++) {
    let turn = bearing(track[idx[k]], track[idx[k + 1]]) - bearing(track[idx[k - 1]], track[idx[k]])
    if (turn > 180) turn -= 360
    if (turn < -180) turn += 360
    const type = typeFromTurn(turn)
    if (type === 'straight') continue
    cues.push({ at: track[idx[k]], type, text: TYPE_TEXT[type], distFromStart: Math.round(cum[idx[k]]) })
  }
  cues.push({ at: track[track.length - 1], type: 'arrive', text: TYPE_TEXT.arrive, distFromStart: Math.round(cum[cum.length - 1]) })
  return cues
}

// --- Valhalla ---------------------------------------------------------------
// Encoded-Polyline-Decoder (Valhalla nutzt Precision 6).
function decodePolyline(str, precision = 6) {
  let index = 0, lat = 0, lng = 0
  const coords = []
  const factor = 10 ** precision
  while (index < str.length) {
    let shift = 0, result = 0, byte
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5 } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lat / factor, lng / factor])
  }
  return coords
}

// Valhalla-Manoever-Typ (int) -> CueType
const VALHALLA_TYPE = {
  1: 'depart', 2: 'depart', 3: 'depart',
  4: 'arrive', 5: 'arrive', 6: 'arrive',
  8: 'straight', 9: 'slight-right', 10: 'right', 11: 'sharp-right',
  12: 'uturn', 13: 'uturn', 14: 'sharp-left', 15: 'left', 16: 'slight-left',
  17: 'straight', 18: 'slight-right', 19: 'slight-left',
  20: 'keep-right', 21: 'straight', 22: 'keep-left',
  23: 'keep-left', 24: 'keep-right', 25: 'keep-right',
  26: 'roundabout', 27: 'roundabout',
}

async function valhallaCues(track) {
  const url = `${VALHALLA_URL.replace(/\/$/, '')}/trace_route${VALHALLA_KEY ? `?api_key=${VALHALLA_KEY}` : ''}`
  const body = {
    shape: track.map(([lat, lon]) => ({ lat, lon })),
    costing: 'motorcycle',
    shape_match: 'map_snap',
    directions_options: { language: 'de', units: 'kilometers' },
  }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Valhalla ${res.status}`)
  const data = await res.json()
  const cues = []
  let acc = 0 // Meter ab Start
  for (const leg of data.trip?.legs ?? []) {
    const shape = decodePolyline(leg.shape, 6)
    const cum = cumulative(shape)
    for (const man of leg.maneuvers ?? []) {
      const type = VALHALLA_TYPE[man.type] ?? 'straight'
      const at = shape[man.begin_shape_index] ?? shape[0]
      const street = (man.street_names ?? []).join(' / ') || undefined
      const cue = {
        at,
        type,
        text: man.instruction || TYPE_TEXT[type],
        distFromStart: Math.round(acc + (cum[man.begin_shape_index] ?? 0)),
      }
      if (man.roundabout_exit_count) cue.exit = man.roundabout_exit_count
      if (street) cue.street = street
      cues.push(cue)
    }
    acc += cum[cum.length - 1] ?? 0
  }
  return cues
}

// --- main --------------------------------------------------------------------
const files = (await readdir(ROADBOOKS)).filter((f) => /^t\d+\.gpx$/i.test(f)).sort()
if (!files.length) { console.error('Keine t{N}.gpx in public/roadbooks/'); process.exit(1) }
console.log(VALHALLA_URL ? `Valhalla: ${VALHALLA_URL}` : 'Kein VALHALLA_URL gesetzt -> heuristischer Fallback.')

for (const file of files) {
  const track = parseGpx(await readFile(join(ROADBOOKS, file), 'utf8'))
  let cues, mode
  if (VALHALLA_URL) {
    try { cues = await valhallaCues(track); mode = 'valhalla' }
    catch (e) { console.warn(`  ${file}: Valhalla fehlgeschlagen (${e.message}) -> Heuristik`); cues = deriveCues(track); mode = 'heuristik' }
  } else { cues = deriveCues(track); mode = 'heuristik' }
  const out = file.replace(/\.gpx$/i, '.cues.json')
  await writeFile(join(ROADBOOKS, out), JSON.stringify(cues, null, 0))
  console.log(`  ${file} -> ${out}  (${cues.length} Cues, ${mode})`)
}
