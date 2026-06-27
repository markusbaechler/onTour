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
  trackUrl?: string // hochgeladenes GPX der tatsaechlichen Fahrt
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
