// Zentrale Track-Liste fuer Video-Studio und Diashow. Dateien liegen in public/music/
// (nicht im PWA-Precache – werden zur Laufzeit geladen). URL = `${BASE_URL}${file}`.

export interface TrackDef { id: string; label: string; file: string }

export const TRACKS: readonly TrackDef[] = [
  { id: 'cannonball', label: 'bbz Cannonball (Instrumental)', file: 'music/cannonball.mp3' },
  { id: 'france', label: 'Frankreich auf zwei Rädern', file: 'music/theme.mp3' },
] as const

export const DEFAULT_TRACK: TrackDef = TRACKS[0]

export function trackUrl(base: string, t: TrackDef): string { return `${base}${t.file}` }
