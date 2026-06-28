#!/usr/bin/env node
// Erzeugt den Pass-Gazetteer src/data/passNames.ts aus OpenStreetMap (Overpass):
// benannte mountain_pass/natural=saddle nahe der Route. Bei neuer Route neu laufen:
//   node scripts/gen-passes.mjs
// Pass-Erkennung danach = "Route kreuzt benannten Pass" (src/lib/passes.ts).

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROADBOOKS = join(ROOT, 'public', 'roadbooks')
const NEAR_M = 700 // Kandidaten bis hierher zur Route
const OVERPASS = 'https://overpass-api.de/api/interpreter'

const R = 6_371_000, rad = (d) => (d * Math.PI) / 180
const dist = (a, b, c, d) => {
  const dLat = rad(c - a), dLng = rad(d - b)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Route-Punkte aus allen GPX
const files = (await readdir(ROADBOOKS)).filter((f) => /^t\d+\.gpx$/i.test(f)).sort()
const pts = []
let south = 90, west = 180, north = -90, east = -180
for (const f of files) {
  const xml = await readFile(join(ROADBOOKS, f), 'utf8')
  let m, i = 0
  const re = /<rtept lat="([-\d.]+)" lon="([-\d.]+)"/g
  while ((m = re.exec(xml))) {
    const lat = +m[1], lon = +m[2]
    if (i++ % 2 === 0) pts.push([lat, lon])
    south = Math.min(south, lat); north = Math.max(north, lat)
    west = Math.min(west, lon); east = Math.max(east, lon)
  }
}
const pad = 0.1
const bbox = `${(south - pad).toFixed(3)},${(west - pad).toFixed(3)},${(north + pad).toFixed(3)},${(east + pad).toFixed(3)}`
console.log(`Route ${pts.length} Punkte, bbox ${bbox}`)

const query = `[out:json][timeout:120];(node["mountain_pass"="yes"]["name"](${bbox});node["natural"="saddle"]["name"](${bbox}););out body;`
const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(query) })
if (!res.ok) { console.error('Overpass', res.status); process.exit(1) }
const osm = (await res.json()).elements
  .filter((e) => e.tags && e.tags.name)
  .map((e) => ({ name: e.tags.name.trim(), lat: e.lat, lng: e.lon, ele: e.tags.ele ? Math.round(parseFloat(e.tags.ele)) : 0 }))
console.log(`OSM benannte Paesse: ${osm.length}`)

const near = osm.filter((p) => pts.some((q) => dist(p.lat, p.lng, q[0], q[1]) < NEAR_M))
const seen = new Set()
const uniq = near.filter((p) => { const k = p.name + '@' + p.lat.toFixed(3); if (seen.has(k)) return false; seen.add(k); return true })
uniq.sort((a, b) => a.name.localeCompare(b.name))

const body = `// Benannte Paesse nahe der Route (OSM mountain_pass/natural=saddle mit Name + ele).\n` +
  `// Gazetteer fuer die Pass-Erkennung (Route kreuzt Pass). Generiert via scripts/gen-passes.mjs.\n` +
  `export interface NamedPass { name: string; lat: number; lng: number; ele: number }\n` +
  `export const passNames: NamedPass[] = [\n` +
  uniq.map((p) => `  { name: ${JSON.stringify(p.name)}, lat: ${p.lat.toFixed(5)}, lng: ${p.lng.toFixed(5)}, ele: ${p.ele} },`).join('\n') +
  `\n]\n`
await writeFile(join(ROOT, 'src', 'data', 'passNames.ts'), body)
console.log(`Gazetteer: ${uniq.length} Paesse -> src/data/passNames.ts`)
