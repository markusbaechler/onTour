const nf = new Intl.NumberFormat('de-CH')

export const fmt = (n: number) => nf.format(Math.round(n))
export const km = (n: number) => `${fmt(n)} km`
export const hm = (n: number) => `${fmt(n)} hm`

export function dateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const end = e.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) // "10. Juli 2026"
  if (sameMonth) {
    const startDay = s.toLocaleDateString('de-CH', { day: 'numeric' }) // "4"
    return `${startDay}. – ${end}` // "4. – 10. Juli 2026"
  }
  const start = s.toLocaleDateString('de-CH', { day: 'numeric', month: 'long' }) // "4. Juli"
  return `${start} – ${end}`
}

export function stageDate(startIso: string, dayIndex: number): string {
  const d = new Date(startIso)
  d.setDate(d.getDate() + dayIndex)
  return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Startdatum einer Etappe als Date (Mitternacht lokal). */
export function stageStart(startIso: string, dayIndex: number): Date {
  const d = new Date(startIso)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dayIndex)
  return d
}

/** Etappe ist erst ab ihrem Datum „gefahren"-fähig (Datum <= heute). */
export function stageUnlocked(startIso: string, dayIndex: number): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return stageStart(startIso, dayIndex).getTime() <= today.getTime()
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
