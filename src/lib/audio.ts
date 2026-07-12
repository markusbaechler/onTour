// Musikquelle fuers Video-Studio: Standard-Track (public/music/theme.mp3, CC0) oder Upload.
// url = fuer das <audio>-Element (Vorschau), blob = fuers Export-ZIP.

export interface MusicSource { name: string; url: string; blob: Blob }

/** Laedt den mitgelieferten CC0-Standardtrack. null, wenn nicht vorhanden/erreichbar. */
export async function defaultMusic(base: string): Promise<MusicSource | null> {
  try {
    const res = await fetch(`${base}music/theme.mp3`)
    if (!res.ok) return null
    const blob = await res.blob()
    return { name: 'theme.mp3', url: URL.createObjectURL(blob), blob }
  } catch {
    return null
  }
}

/** Erzeugt eine Musikquelle aus einer hochgeladenen Datei. */
export function uploadedMusic(file: File): MusicSource {
  return { name: file.name, url: URL.createObjectURL(file), blob: file }
}

/** Dekodiert einen Musik-Blob zu einem AudioBuffer (fuer die BPM-Erkennung). */
export async function decodeBlob(blob: Blob, ctx: AudioContext): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer())
}
