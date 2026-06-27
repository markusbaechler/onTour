import type { Actual, Photo } from '../types'

const API = import.meta.env.VITE_DATA_API
export const dataApiReady = Boolean(API)

export interface Store {
  actuals: Actual[]
  photos: Photo[]
}

const LS_KEY = 'alpes-tour-store'
const empty: Store = { actuals: [], photos: [] }

function readLocal(): Store {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') }
  } catch {
    return { ...empty }
  }
}

function writeLocal(s: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

/** Liest den gesamten gemeinsamen Stand. */
export async function loadStore(): Promise<Store> {
  if (!dataApiReady) return readLocal()
  try {
    const res = await fetch(API!, { method: 'GET' })
    if (!res.ok) throw new Error()
    const data = (await res.json()) as Partial<Store>
    return { ...empty, ...data }
  } catch {
    return readLocal()
  }
}

/**
 * Speichert den gesamten Stand. Apps Script erwartet text/plain, um den
 * CORS-Preflight zu vermeiden (einfacher, kein OPTIONS noetig).
 */
export async function saveStore(s: Store): Promise<void> {
  writeLocal(s)
  if (!dataApiReady) return
  await fetch(API!, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(s),
  })
}
