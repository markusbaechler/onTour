import type { Trip } from '../types'
import { generatedStage } from './stages.generated'

// Reale 8-Etappen-Tour. from/to sind kuratierte Labels (frei editierbar); plannedKm
// sind die geplanten Soll-Distanzen. start/end/track/cols/plannedAscent kommen aus der
// Messung der echten GPX (_gpx_files_def/bbz0N) via scripts/gen-stages.mjs – km/hm werden
// dort IMMER auf dem vollen Track gerechnet. Roadbooks liegen unter public/roadbooks/tN.gpx.
export const trip: Trip = {
  title: 'bbz Cannonball',
  subtitle: 'Tour de France',
  startDate: '2026-07-04',
  endDate: '2026-07-11', // 8 Etappen: 04.–11.07.
  riders: ['Markus', 'Alex', 'Marco'],
  stages: [
    { id: 't1', day: 1, from: 'Geroldswil, Huebwiesenstrasse', to: 'Bourg-Saint-Maurice', plannedKm: 410, gpxUrl: 'roadbooks/t1.gpx', ...generatedStage.t1 },
    { id: 't2', day: 2, from: 'Bourg-Saint-Maurice', to: 'Barcelonnette', plannedKm: 293, gpxUrl: 'roadbooks/t2.gpx', ...generatedStage.t2 },
    { id: 't3', day: 3, from: 'Barcelonnette', to: 'Menton', plannedKm: 231, gpxUrl: 'roadbooks/t3.gpx', ...generatedStage.t3 },
    { id: 't4', day: 4, from: 'Menton', to: 'Castellane', plannedKm: 292, gpxUrl: 'roadbooks/t4.gpx', ...generatedStage.t4 },
    { id: 't5', day: 5, from: 'Castellane', to: 'Joucas', plannedKm: 324, gpxUrl: 'roadbooks/t5.gpx', ...generatedStage.t5 },
    { id: 't6', day: 6, from: 'Joucas', to: 'Gresse-en-Vercors', plannedKm: 427, gpxUrl: 'roadbooks/t6.gpx', ...generatedStage.t6 },
    { id: 't7', day: 7, from: 'Gresse-en-Vercors', to: 'Verrières-de-Joux', plannedKm: 356, gpxUrl: 'roadbooks/t7.gpx', ...generatedStage.t7 },
    { id: 't8', day: 8, from: 'Verrières-de-Joux', to: 'Winkel, Schwärzen', plannedKm: 287, gpxUrl: 'roadbooks/t8.gpx', ...generatedStage.t8 },
  ],
}
