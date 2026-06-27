import { fmt } from '../lib/format'

/** Col-Schild. Akzeptiert benannte Cols und GPX-erkannte Paesse (Name optional). */
export function ColBadge({ col }: { col: { name?: string; altitude: number } }) {
  const label = col.name ? col.name.replace(/^Col(?: de la| de l'| du| de| d')?\s*/i, '') : 'Pass'
  return (
    <span className="col-sign" title={`${col.name ?? 'Pass'} – ${fmt(col.altitude)} m`}>
      <span className="name">{label}</span>
      <span className="alt">{fmt(col.altitude)} m</span>
    </span>
  )
}
