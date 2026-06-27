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

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

/** Relative Zeit "gerade / vor 22 Min / vor 1 Std / vor 2 Tagen". */
export function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'gerade'
  if (min < 60) return `vor ${min} Min`
  const std = Math.floor(min / 60)
  if (std < 24) return `vor ${std} Std`
  const tg = Math.floor(std / 24)
  return `vor ${tg} ${tg === 1 ? 'Tag' : 'Tagen'}`
}
