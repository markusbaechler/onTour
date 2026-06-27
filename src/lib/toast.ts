import { useEffect, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem { id: number; kind: ToastKind; msg: string }

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  notify()
}

function push(kind: ToastKind, msg: string) {
  const id = ++seq
  items = [...items, { id, kind, msg }].slice(-4) // max. 4 gleichzeitig
  notify()
  setTimeout(() => dismiss(id), kind === 'error' ? 5000 : 2800)
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string) => push('info', m),
}

export function useToasts(): ToastItem[] {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return items
}
