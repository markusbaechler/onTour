export type LatLng = [number, number]

export interface Col {
  name: string
  altitude: number // Meter
}

/** Geplante Etappe (Soll) */
export interface Stage {
  id: string
  day: number
  from: string
  to: string
  plannedKm: number
  plannedAscent: number // Hoehenmeter
  cols: Col[]
  gpxUrl?: string // statisches Roadbook im Repo, z. B. /roadbooks/t1.gpx
  start: LatLng
  end: LatLng
  track?: LatLng[] // grober Streckenverlauf fuer die Karte (echte Form kommt aus GPX)
}

/** Gefahrene Etappe (Ist) \u2013 von Teilnehmenden erfasst */
export interface Actual {
  stageId: string
  ridden: boolean
  actualKm?: number
  actualAscent?: number
  movingTime?: string // "5:12"
  note?: string
  trackUrl?: string // hochgeladenes GPX der tatsaechlichen Fahrt (Ist)
  planTrackUrl?: string // optionaler Ersatz fuer das Soll-Roadbook dieser Etappe
}

export interface Photo {
  id: string
  stageId: string
  url: string
  thumbUrl: string
  author: string
  caption?: string
  createdAt: string // ISO
  lat?: number
  lng?: number
}

export interface Trip {
  title: string
  subtitle: string
  startDate: string
  endDate: string
  riders: string[]
  stages: Stage[]
}

/** Emoji-Reaktion auf ein Foto (ein Tipp, pro Autor+Emoji einmalig) */
export interface Reaction {
  photoId: string
  author: string
  emoji: string
  createdAt: string
}

/** Text-Kommentar (mit Emojis) unter einem Foto */
export interface Comment {
  id: string
  photoId: string
  author: string
  text: string
  createdAt: string
}

/** Manoever-Typ eines Cues (an Beeline/Valhalla angelehnt). */
export type CueType =
  | 'depart' | 'arrive'
  | 'left' | 'right'
  | 'slight-left' | 'slight-right'
  | 'sharp-left' | 'sharp-right'
  | 'straight' | 'uturn'
  | 'keep-left' | 'keep-right'
  | 'roundabout'

/**
 * Vorberechneter Navigationshinweis (Cue Sheet). Pro Roadbook eine Liste in
 * public/roadbooks/t{N}.cues.json. On-Bike wird nur abgespielt, nicht neu geroutet.
 */
export interface Cue {
  at: LatLng // Position des Manoevers
  type: CueType
  exit?: number // Kreisel-Ausfahrt
  text: string // Anweisung, z. B. "3. Ausfahrt"
  street?: string // Zielstrasse, z. B. "D902 -> Galibier"
  distFromStart: number // Meter ab Start entlang der Route
}

/** Letzter bekannter Standort eines Fahrers ("last seen", kein Hintergrund-GPS) */
export interface RiderLocation {
  rider: string
  lat: number
  lng: number
  at: string // ISO
  accuracy?: number
  speed?: number
  heading?: number
}
