import JSZip from 'jszip'
import { trip } from '../data/trip'
import { collectPasses, type StageStats } from './passes'
import { cropForAspect } from './cloudinaryCrop'
import { toSrt, type SrtCue } from './srt'
import { flatten, type Storyboard } from './storyboard'
import type { MusicSource } from './audio'
import type { Photo } from '../types'

interface ExportOptions {
  storyboard: Storyboard
  photos: Photo[]
  stats: Record<string, StageStats>
  music: MusicSource
  scope: string
  onProgress?: (done: number, total: number) => void
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Erzeugt das CapCut-Paket (ZIP) clientseitig und startet den Download. */
export async function exportCapcut(opts: ExportOptions): Promise<void> {
  const { storyboard: sb, photos, stats, music, scope, onProgress } = opts
  const zip = new JSZip()
  const items = flatten(sb, photos)
  const photoItems = items.filter((i) => i.kind === 'photo' && i.photo)

  // Tour-Zahlen fuer regie.txt
  const totalKm = trip.stages.reduce((a, s) => a + (stats[s.id]?.km ?? s.plannedKm), 0)
  const passesAll = collectPasses(stats)
  const topCol = passesAll.reduce<{ name: string; altitude: number }>((m, p) => (p.altitude > m.altitude ? p : m), { name: '—', altitude: 0 })

  // fotos/ – in Reihenfolge, hochaufloesend im Zielformat
  const regieLines: string[] = []
  let n = 0
  for (let idx = 0; idx < photoItems.length; idx++) {
    const it = photoItems[idx]
    const photo = it.photo!
    const label = it.overlayTitle ? 'INTRO' : it.day ? `T${it.day}` : 'BEST'
    try {
      const res = await fetch(cropForAspect(photo.url, sb.aspect))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      n++
      const file = `${pad2(n)}_${label}.jpg`
      zip.file(`fotos/${file}`, blob)
      regieLines.push(`#${pad2(n)}  ${file}  ${it.end - it.start >= 0 ? (it.end - it.start).toFixed(1) : '0'}s  @Beat ${it.start.toFixed(1)}s  „${it.caption ?? ''}"`)
    } catch {
      // Foto nicht ladbar -> ueberspringen (Paket bleibt gueltig)
    }
    onProgress?.(idx + 1, photoItems.length)
  }

  // captions.srt – exakt nach Storyboard-Dauern
  const cues: SrtCue[] = items.map((it) => ({ start: it.start, end: it.end, text: it.kind === 'photo' ? (it.caption ?? '') : [it.title, it.subtitle, it.stats].filter(Boolean).join(' · ') }))
  zip.file('captions.srt', toSrt(cues))

  // regie.txt – Shotlist + globale Angaben
  const struktur = sb.scenes.map((sc) => (sc.kind === 'chapter' ? `${sc.title}` : sc.kind)).join(' → ')
  const header = [
    `bbz Cannonball – Regie / Shotlist`,
    `Titel:   ${sb.title}`,
    `Format:  ${sb.aspect}`,
    `BPM:     ${sb.bpm ?? '—'}`,
    `Länge:   ${sb.totalSeconds.toFixed(1)}s`,
    `Musik:   ${music.name}`,
    `Struktur: ${struktur}`,
    `Tour:    ${totalKm} km · ${passesAll.length} Pässe · höchster ${topCol.name} ${Math.round(topCol.altitude)} m`,
    ``,
    `Shots (Reihenfolge = fotos/-Sortierung):`,
    ...regieLines,
    ``,
  ].join('\n')
  zip.file('regie.txt', header)

  // musik/
  zip.file(`musik/${music.name}`, music.blob)

  // ANLEITUNG.txt
  zip.file('ANLEITUNG.txt', [
    `So baust du daraus in CapCut ein Video:`,
    ``,
    `1) Neues Projekt öffnen (Format ${sb.aspect}).`,
    `2) Ordner fotos/ importieren – die Dateien sind bereits sortiert (01, 02, 03 …).`,
    `   Alle in dieser Reihenfolge auf die Zeitleiste ziehen.`,
    `3) musik/${music.name} als Audiospur hinzufügen.`,
    `4) Beat-Sync: Audio auswählen → „Automatisch" (Beats markieren) und die`,
    `   Foto-Schnitte an den Beats ausrichten (die Shot-Dauern in regie.txt sitzen`,
    `   bereits auf ${sb.bpm ?? '—'} BPM).`,
    `5) captions.srt importieren/als Untertitel übernehmen (Timing passt zum Schnitt).`,
    `6) Optional: sanften Farb-Grade + Ken-Burns je Clip; Details in regie.txt.`,
    `7) Exportieren als MP4.`,
    ``,
    `Musik „theme.mp3" ist CC0 (frei nutzbar). Bei eigenem Track dessen Lizenz beachten.`,
  ].join('\n'))

  const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  download(out, `cannonball_video_${scope}.zip`)
}
