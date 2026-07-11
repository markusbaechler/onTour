#!/usr/bin/env node
// Laedt ein vorkonvertiertes NIMA-tfjs-GraphModel (Basis: idealo image-quality-assessment,
// Apache-2.0) nach public/models/nima/. Die konkrete Quelle wird per Env NIMA_URL uebergeben
// (vollstaendige URL zu model.json). Ist keine gesetzt oder scheitert der Download, wird nur
// gewarnt und mit Exit 0 beendet – die App laeuft dann im Heuristik-Modus (kein KI-Aesthetik).
//   NIMA_URL="https://…/model.json" npm run fetch-nima

import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'models', 'nima')
const BASE = process.env.NIMA_URL

async function main() {
  if (!BASE) {
    console.warn('fetch-nima: kein NIMA_URL gesetzt – ueberspringe Download. App laeuft im Heuristik-Modus.')
    return
  }
  await mkdir(OUT, { recursive: true })
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(`model.json HTTP ${res.status}`)
  const modelJson = await res.json()
  await writeFile(join(OUT, 'model.json'), JSON.stringify(modelJson))
  const dir = BASE.slice(0, BASE.lastIndexOf('/') + 1)
  const shards = new Set()
  for (const g of modelJson.weightsManifest ?? []) for (const p of g.paths ?? []) shards.add(p)
  for (const s of shards) {
    const r = await fetch(dir + s)
    if (!r.ok) throw new Error(`${s} HTTP ${r.status}`)
    await writeFile(join(OUT, s), Buffer.from(await r.arrayBuffer()))
    console.log('fetch-nima: geladen', s)
  }
  console.log(`fetch-nima: NIMA-Modell (${shards.size} Shards) in public/models/nima/ abgelegt.`)
}

main().catch((e) => {
  console.warn('fetch-nima: Download fehlgeschlagen –', e.message, '(Heuristik-Modus bleibt aktiv).')
  // bewusst kein Fehler-Exit: Feature bleibt ohne Modell funktionsfaehig
})
