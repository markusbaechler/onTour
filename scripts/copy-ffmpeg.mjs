#!/usr/bin/env node
// Kopiert den selbst gehosteten ffmpeg-Core NACH dem Vite/Workbox-Build nach dist/ffmpeg/.
// Bewusst als postbuild-Schritt: so sieht der PWA-Precache die 32-MB-wasm nie (kein Build-Fehler),
// die App laedt den Core aber same-origin von /ffmpeg/. Laeuft in CI (npm run build -> postbuild).

import { mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'ffmpeg-core')
const OUT = join(ROOT, 'dist', 'ffmpeg')

if (!existsSync(join(ROOT, 'dist'))) { console.log('copy-ffmpeg: kein dist/ – uebersprungen.'); process.exit(0) }
await mkdir(OUT, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  const s = join(SRC, f)
  if (!existsSync(s)) { console.warn('copy-ffmpeg: Quelle fehlt:', s); continue }
  await copyFile(s, join(OUT, f))
  console.log('copy-ffmpeg: ->', join('dist', 'ffmpeg', f))
}
