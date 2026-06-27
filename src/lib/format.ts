const nf = new Intl.NumberFormat('de-CH')

export const fmt = (n: number) => nf.format(Math.round(n))
export const km = (n: number) => `${fmt(n)} km`
export const hm = (n: number) => `${fmt(n)} hm`

export function dateRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long' }
  const a = new Date(startIso).toLocaleDateString('de-CH', { day: '2-digit', month: 'numeric' })
  const b = new Date(endIso).toLocaleDateString('de-CH', opts)
  return `${a} – ${b}`
}

export function stageDate(startIso: string, dayIndex: number): string {
  const d = new Date(startIso)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
