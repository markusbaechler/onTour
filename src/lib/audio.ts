import { trackUrl, type TrackDef } from './music'

// Musikquelle fuers Video-Studio / die Diashow: mitgelieferter Track (public/music/*) oder
// Upload. url = fuer das <audio>-Element (Vorschau), blob = fuer den Render. name = Dateiname
// (fuer die Endung im Render), label = Anzeigename.

export interface MusicSource { name: string; label: string; url: string; blob: Blob }

/** Laedt einen der mitgelieferten Tracks. null, wenn nicht erreichbar. */
export async function fetchTrack(base: string, t: TrackDef): Promise<MusicSource | null> {
  try {
    const res = await fetch(trackUrl(base, t))
    if (!res.ok) return null
    const blob = await res.blob()
    return { name: t.file.split('/').pop() ?? 'track.mp3', label: t.label, url: URL.createObjectURL(blob), blob }
  } catch {
    return null
  }
}

/** Musikquelle aus einer hochgeladenen Datei. */
export function uploadedMusic(file: File): MusicSource {
  return { name: file.name, label: file.name, url: URL.createObjectURL(file), blob: file }
}

/** Dekodiert einen Musik-Blob zu einem AudioBuffer (fuer BPM/Dauer). */
export async function decodeBlob(blob: Blob, ctx: AudioContext): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer())
}
