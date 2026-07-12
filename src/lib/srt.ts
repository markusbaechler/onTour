export interface SrtCue { start: number; end: number; text: string } // Sekunden

function tc(sec: number): string {
  const ms = Math.round(sec * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const rest = ms % 1000
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(rest).padStart(3, '0')}`
}

/** Baut eine gueltige SRT-Datei aus getimten Cues. */
export function toSrt(cues: SrtCue[]): string {
  return cues
    .filter((c) => c.text.trim() && c.end > c.start)
    .map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text.trim()}\n`)
    .join('\n')
}
