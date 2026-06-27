import type { Col } from '../types'
import { fmt } from '../lib/format'

export function ColBadge({ col }: { col: Col }) {
  return (
    <span className="col-sign" title={`${col.name} – ${fmt(col.altitude)} m`}>
      <span className="name">{col.name.replace(/^Col(?: de la| de l'| du| de| d')?\s*/i, '')}</span>
      <span className="alt">{fmt(col.altitude)} m</span>
    </span>
  )
}
