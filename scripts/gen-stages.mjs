#!/usr/bin/env node
// Messpipeline fuer die 8-Etappen-Tour. Quelle: _gpx_files_def/bbz0N def.gpx
// (dichte, echte Tracks). Erzeugt:
//   - public/roadbooks/t{1..8}.gpx  (fuers Rendering heruntergerechnet, MIT Hoehe)
//   - src/data/passNames.ts         (OSM-Col-Gazetteer nahe der neuen Route)
//   - src/data/stages.generated.ts  (km/hm/Hoechster/Profil/Kurven/Paesse + Karten-Track)
//
// GRUNDSATZ: km/hm werden IMMER auf dem VOLLEN Track gerechnet. Vereinfachung nur
// fuers Rendering, nie vor der Messung. Fehlt <ele> (bbz06), wird die Hoehe per
// Open-Meteo-Elevation nachgeladen und gecacht.
//
//   node scripts/gen-stages.mjs

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, '_gpx_files_def')
const ROADBOOKS = join(ROOT, 'public', 'roadbooks')
const CACHE = join(ROOT, 'scripts', '.cache')

// --- Konstanten (mit src/lib/passes.ts konsistent halten) --------------------
const PASS_CROSS_THRESHOLD = 350 // m – bis hierher gilt ein benannter Pass als gekreuzt
const SMOOTH_WINDOW = 3          // Glaettung des Hoehenprofils gegen Rauschen
const CURVE_MIN_ANGLE = 35       // Grad – ab hier zaehlt ein Richtungswechsel als Kurve
const CURVE_MIN_STEP_M = 70      // Mindestabstand zwischen Kurven-Messpunkten
const PROFILE_SAMPLES = 180      // Punkte des Hoehenprofils
const RENDER_POINTS = 600        // Zielgroesse des Karten-Tracks je Etappe
const NEAR_M = 700               // Overpass-Kandidaten bis hierher zur Route

// Zuordnung Quelldatei -> Etappen-Id (Reihenfolge = Tourverlauf)
const STAGES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  id: `t${n}`,
  src: `bbz0${n} def.gpx`,
  out: `t${n}.gpx`,
}))

// --- Geometrie ----------------------------------------------------------------
const R = 6_371_000, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI
function meters(a, b, c, d) {
  const dLat = rad(c - a), dLng = rad(d - b)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
function bearing(a, b, c, d) {
  const dLng = rad(d - b)
  const y = Math.sin(dLng) * Math.cos(rad(c))
  const x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(dLng)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

// --- GPX-Parsing (trkpt + rtept, mit/ohne ele, self-closing) ------------------
function parseGpx(text) {
  const pts = []
  const re = /<(?:trkpt|rtept)\s+[^>]*?lat="([^"]+)"[^>]*?lon="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/g
  let m
  while ((m = re.exec(text))) {
    const inner = m[3] || ''
    const em = /<ele>([^<]+)<\/ele>/.exec(inner)
    pts.push({ lat: +m[1], lng: +m[2], ele: em ? +em[1] : null })
  }
  return pts
}

// --- Open-Meteo Elevation (fuer Tracks ohne <ele>), gecacht -------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function fetchElevations(coords, cacheKey) {
  await mkdir(CACHE, { recursive: true })
  const cacheFile = join(CACHE, `elev-${cacheKey}.json`)
  // Resume: bereits geladene Hoehen aus dem Cache uebernehmen und fortsetzen.
  let out = []
  if (existsSync(cacheFile)) {
    out = JSON.parse(await readFile(cacheFile, 'utf8'))
    if (out.length >= coords.length) { console.log(`  Hoehe aus Cache (${out.length})`); return out.slice(0, coords.length) }
    console.log(`  Setze fort ab ${out.length}/${coords.length}`)
  }
  const BATCH = 100
  for (let i = Math.floor(out.length / BATCH) * BATCH; i < coords.length; i += BATCH) {
    if (i < out.length) continue // Teilbatch schon vorhanden (sollte nicht vorkommen)
    const batch = coords.slice(i, i + BATCH)
    const lat = batch.map((c) => c[0].toFixed(5)).join(',')
    const lon = batch.map((c) => c[1].toFixed(5)).join(',')
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`
    let ok = false
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      try {
        const res = await fetch(url)
        if (res.status === 429) throw new Error('429')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        out.push(...j.elevation)
        await writeFile(cacheFile, JSON.stringify(out)) // inkrementell sichern
        ok = true
      } catch (e) {
        const wait = e.message === '429' ? 15000 + attempt * 8000 : 2000 * (attempt + 1)
        process.stdout.write(`\r  Batch ${i / BATCH}: ${e.message}, warte ${Math.round(wait / 1000)}s… `)
        await sleep(wait)
      }
    }
    if (!ok) throw new Error('Open-Meteo nicht erreichbar (Rerun setzt am Cache fort)')
    process.stdout.write(`\r  Hoehe geladen: ${out.length}/${coords.length}   `)
    await sleep(1500) // Politeness gegen Rate-Limit
  }
  process.stdout.write('\n')
  return out.slice(0, coords.length)
}

// Track ohne Hoehe: an ~1 Punkt/200 m Hoehen holen und linear auf alle Punkte legen.
async function attachElevation(pts, cacheKey) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + meters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng))
  const total = cum[cum.length - 1]
  const SPACING = 200
  const sampleIdx = []
  let nextD = 0
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] >= nextD || i === pts.length - 1) { sampleIdx.push(i); nextD += SPACING }
  }
  const coords = sampleIdx.map((i) => [pts[i].lat, pts[i].lng])
  console.log(`  Track ohne <ele>: ${coords.length} Stuetzpunkte (~${Math.round(total / 1000)} km) via Open-Meteo`)
  const raw = await fetchElevations(coords, cacheKey)
  // Nulls/NaN durch den letzten gueltigen Wert ersetzen (Open-Meteo liefert vereinzelt null)
  let lastValid = raw.find((v) => typeof v === 'number' && Number.isFinite(v)) ?? 0
  const clean = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? (lastValid = v) : lastValid))
  // Stuetzhoehen glaetten (~600 m Fenster): SRTM-Spitzen in Schluchten wuerden sonst
  // die Hoehenmeter kuenstlich aufblaehen.
  const ele = smooth(clean, 2)
  // Lineare Interpolation der Stuetzhoehen auf alle Punkte (nach Distanz)
  for (let s = 0; s < sampleIdx.length - 1; s++) {
    const i0 = sampleIdx[s], i1 = sampleIdx[s + 1]
    const e0 = ele[s], e1 = ele[s + 1]
    const d0 = cum[i0], d1 = cum[i1]
    const denom = (d1 - d0) || 1 // doppelte GPS-Punkte (gleiche Distanz) nicht durch 0 teilen
    for (let i = i0; i <= i1; i++) {
      const t = (cum[i] - d0) / denom
      pts[i].ele = e0 + (e1 - e0) * t
    }
  }
  for (let i = sampleIdx[sampleIdx.length - 1]; i < pts.length; i++) pts[i].ele = ele[ele.length - 1]
}

// --- Messung (auf dem VOLLEN Track) ------------------------------------------
function smooth(vals, w) {
  return vals.map((_, i) => {
    let s = 0, c = 0
    for (let j = -w; j <= w; j++) { const k = i + j; if (k >= 0 && k < vals.length) { s += vals[k]; c++ } }
    return s / c
  })
}

function measure(pts) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + meters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng))
  const total = cum[cum.length - 1]
  const ele = smooth(pts.map((p) => (Number.isFinite(p.ele) ? p.ele : 0)), SMOOTH_WINDOW)

  let ascent = 0
  for (let i = 1; i < ele.length; i++) if (ele[i] > ele[i - 1]) ascent += ele[i] - ele[i - 1]
  const highest = Math.round(Math.max(...ele.filter(Number.isFinite)))

  // Hoehenprofil (gleichmaessig nach Distanz)
  const profile = []
  let j = 0
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    const d = (total * k) / (PROFILE_SAMPLES - 1)
    while (j < cum.length - 1 && cum[j + 1] < d) j++
    profile.push({ d: Math.round(d), e: Math.round(ele[j]) })
  }

  // Kurven
  const idx = [0]
  let last = 0
  for (let i = 1; i < pts.length; i++) if (cum[i] - cum[last] >= CURVE_MIN_STEP_M) { idx.push(i); last = i }
  let curves = 0
  for (let k = 1; k < idx.length - 1; k++) {
    const a = pts[idx[k - 1]], b = pts[idx[k]], c = pts[idx[k + 1]]
    let turn = bearing(b.lat, b.lng, c.lat, c.lng) - bearing(a.lat, a.lng, b.lat, b.lng)
    if (turn > 180) turn -= 360
    if (turn < -180) turn += 360
    if (Math.abs(turn) > CURVE_MIN_ANGLE) curves++
  }

  return { km: Math.round(total / 1000), ascent: Math.round(ascent), highest, profile, curves, cum, ele }
}

// --- Rendering-Track (nach Distanz ausgeduennt, MIT Hoehe) --------------------
function renderTrack(pts, cum) {
  const total = cum[cum.length - 1]
  const step = total / RENDER_POINTS
  const out = [pts[0]]
  let nextD = step
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] >= nextD) { out.push(pts[i]); nextD += step }
  }
  out.push(pts[pts.length - 1])
  return out
}

// --- Pass-Erkennung gegen den Gazetteer (Route kreuzt benannten Pass) ---------
function detectPasses(pts, cum, ele, passNames) {
  const passes = []
  const used = new Set()
  for (const gp of passNames) {
    let best = PASS_CROSS_THRESHOLD, bi = -1
    for (let i = 0; i < pts.length; i++) {
      const d = meters(gp.lat, gp.lng, pts[i].lat, pts[i].lng)
      if (d < best) { best = d; bi = i }
    }
    if (bi >= 0 && !used.has(gp.name)) {
      used.add(gp.name)
      passes.push({ name: gp.name, lat: gp.lat, lng: gp.lng, altitude: gp.ele || Math.round(ele[bi]), distFromStart: Math.round(cum[bi]) })
    }
  }
  passes.sort((a, b) => a.distFromStart - b.distFromStart)
  return passes
}

// --- Overpass: Col-Gazetteer nahe der (neuen) Route --------------------------
async function buildGazetteer(allPts) {
  let south = 90, west = 180, north = -90, east = -180
  const thinned = []
  for (const pts of allPts) for (let i = 0; i < pts.length; i += 20) {
    const p = pts[i]; thinned.push([p.lat, p.lng])
    south = Math.min(south, p.lat); north = Math.max(north, p.lat)
    west = Math.min(west, p.lng); east = Math.max(east, p.lng)
  }
  const pad = 0.1
  const bbox = `${(south - pad).toFixed(3)},${(west - pad).toFixed(3)},${(north + pad).toFixed(3)},${(east + pad).toFixed(3)}`
  console.log(`Overpass bbox ${bbox} (${thinned.length} Route-Punkte)`)
  const query = `[out:json][timeout:180];(node["mountain_pass"="yes"]["name"](${bbox});node["natural"="saddle"]["name"](${bbox}););out body;`
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ]
  let res
  for (const url of mirrors) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'onTour-gen-stages/1.0' },
        body: 'data=' + encodeURIComponent(query),
      })
      if (res.ok) break
      console.log(`  ${url} -> ${res.status}`)
    } catch (e) { console.log(`  ${url} -> ${e.message}`) }
    res = null
  }
  if (!res || !res.ok) throw new Error('alle Overpass-Mirrors fehlgeschlagen')
  const osm = (await res.json()).elements
    .filter((e) => e.tags && e.tags.name)
    .map((e) => ({ name: e.tags.name.trim(), lat: e.lat, lng: e.lon, ele: e.tags.ele ? Math.round(parseFloat(e.tags.ele)) : 0 }))
  const near = osm.filter((p) => thinned.some((q) => meters(p.lat, p.lng, q[0], q[1]) < NEAR_M))
  const seen = new Set()
  const uniq = near.filter((p) => { const k = p.name + '@' + p.lat.toFixed(3); if (seen.has(k)) return false; seen.add(k); return true })
  uniq.sort((a, b) => a.name.localeCompare(b.name))
  console.log(`Gazetteer: ${osm.length} benannte Paesse -> ${uniq.length} nahe der Route`)
  return uniq
}

// --- GPX-Ausgabe --------------------------------------------------------------
function toGpx(id, pts) {
  const body = pts.map((p) => p.ele != null
    ? `<trkpt lat="${p.lat.toFixed(5)}" lon="${p.lng.toFixed(5)}"><ele>${Math.round(p.ele)}</ele></trkpt>`
    : `<trkpt lat="${p.lat.toFixed(5)}" lon="${p.lng.toFixed(5)}"/>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="gen-stages" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${id}</name><trkseg>\n${body}\n</trkseg></trk>\n</gpx>\n`
}

// --- Hauptlauf ----------------------------------------------------------------
console.log('Lese Quell-GPX…')
const loaded = []
for (const st of STAGES) {
  const text = await readFile(join(SRC, st.src), 'utf8')
  const pts = parseGpx(text)
  const hasEle = pts.some((p) => p.ele != null)
  console.log(`${st.id}: ${pts.length} Punkte, ele=${hasEle}`)
  if (!hasEle) await attachElevation(pts, st.id)
  loaded.push({ ...st, pts })
}

// Gazetteer (Overpass; bei Fehler oder SKIP_OVERPASS bestehende passNames.ts nutzen)
let passNames
try {
  if (process.env.SKIP_OVERPASS) throw new Error('SKIP_OVERPASS gesetzt')
  passNames = await buildGazetteer(loaded.map((l) => l.pts))
  const gaz = `// Benannte Paesse nahe der Route (OSM mountain_pass/natural=saddle mit Name + ele).\n` +
    `// Gazetteer fuer die Pass-Erkennung. Generiert via scripts/gen-stages.mjs.\n` +
    `export interface NamedPass { name: string; lat: number; lng: number; ele: number }\n` +
    `export const passNames: NamedPass[] = [\n` +
    passNames.map((p) => `  { name: ${JSON.stringify(p.name)}, lat: ${p.lat.toFixed(5)}, lng: ${p.lng.toFixed(5)}, ele: ${p.ele} },`).join('\n') +
    `\n]\n`
  await writeFile(join(ROOT, 'src', 'data', 'passNames.ts'), gaz)
  console.log('-> src/data/passNames.ts')
} catch (e) {
  console.log(`Overpass fehlgeschlagen (${e.message}) – nutze bestehende passNames.ts`)
  const mod = await import('../src/data/passNames.ts').catch(() => null)
  if (mod) passNames = mod.passNames
  else { console.error('Keine passNames verfuegbar'); process.exit(1) }
}

// Messen, Paesse, Rendering-Track, Roadbook schreiben
await mkdir(ROADBOOKS, { recursive: true })
const genStage = {}
const genStats = {}
let totalKm = 0
for (const l of loaded) {
  const m = measure(l.pts)
  const passes = detectPasses(l.pts, m.cum, m.ele, passNames)
  const rt = renderTrack(l.pts, m.cum)
  await writeFile(join(ROADBOOKS, l.out), toGpx(l.id, rt))
  totalKm += m.km
  const first = l.pts[0], last = l.pts[l.pts.length - 1]
  genStage[l.id] = {
    start: [first.lat, first.lng],
    end: [last.lat, last.lng],
    plannedAscent: m.ascent,
    cols: passes.map((p) => ({ name: p.name, altitude: p.altitude })),
    track: rt.map((p) => [p.lat, p.lng]),
  }
  genStats[l.id] = { passes, highest: m.highest, ascent: m.ascent, km: m.km, profile: m.profile, curves: m.curves }
  console.log(`${l.id}: km=${m.km} hm=${m.ascent} hoechster=${m.highest} paesse=${passes.length} render=${rt.length}pts`)
}
console.log(`Summe km (gemessen, voller Track): ${totalKm}`)

// stages.generated.ts schreiben
const num = (n) => (Math.round(n * 1e5) / 1e5)
const fmtLatLng = (a) => `[${num(a[0])}, ${num(a[1])}]`
const fmtTrack = (t) => '[' + t.map(fmtLatLng).join(', ') + ']'
const fmtCols = (cs) => '[' + cs.map((c) => `{ name: ${JSON.stringify(c.name)}, altitude: ${c.altitude} }`).join(', ') + ']'
const fmtProfile = (pr) => '[' + pr.map((p) => `{ d: ${p.d}, e: ${p.e} }`).join(', ') + ']'
const fmtPasses = (ps) => '[' + ps.map((p) => `{ name: ${JSON.stringify(p.name)}, lat: ${num(p.lat)}, lng: ${num(p.lng)}, altitude: ${p.altitude}, distFromStart: ${p.distFromStart} }`).join(', ') + ']'

let out = `// GENERIERT von scripts/gen-stages.mjs – NICHT von Hand editieren.\n`
out += `// km/hm/Hoechster/Paesse aus dem VOLLEN Track gemessen (bbz06 mit Open-Meteo-Hoehe).\n`
out += `// track = fuers Rendering ausgeduennt (NICHT fuer Messung verwenden).\n`
out += `import type { StageStats } from '../lib/passes'\nimport type { Col, LatLng } from '../types'\n\n`
out += `export interface GeneratedStage { start: LatLng; end: LatLng; plannedAscent: number; cols: Col[]; track: LatLng[] }\n\n`
out += `export const generatedStage: Record<string, GeneratedStage> = {\n`
for (const id of Object.keys(genStage)) {
  const g = genStage[id]
  out += `  ${id}: { start: ${fmtLatLng(g.start)}, end: ${fmtLatLng(g.end)}, plannedAscent: ${g.plannedAscent}, cols: ${fmtCols(g.cols)}, track: ${fmtTrack(g.track)} },\n`
}
out += `}\n\n`
out += `export const generatedStats: Record<string, StageStats> = {\n`
for (const id of Object.keys(genStats)) {
  const s = genStats[id]
  out += `  ${id}: { passes: ${fmtPasses(s.passes)}, highest: ${s.highest}, ascent: ${s.ascent}, km: ${s.km}, profile: ${fmtProfile(s.profile)}, curves: ${s.curves} },\n`
}
out += `}\n`
await writeFile(join(ROOT, 'src', 'data', 'stages.generated.ts'), out)
console.log('-> src/data/stages.generated.ts')

// Alte Roadbooks der 7-Etappen-Tour entfernen, falls vorhanden
for (const f of await readdir(ROADBOOKS)) {
  if (/^t\d+\.(gpx|cues\.json)$/i.test(f) && !STAGES.some((s) => s.out === f)) {
    console.log(`(veraltet, bleibt liegen: ${f})`)
  }
}
console.log('Fertig.')
