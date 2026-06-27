import { useCallback, useState } from 'react'

// Betrachter-Name: lokal pro Geraet, beim ersten Schreiben abgefragt, jederzeit aenderbar.
const LS_NAME = 'alpes-name'

export function getViewerName(): string {
  return localStorage.getItem(LS_NAME) ?? ''
}

export function saveViewerName(name: string) {
  localStorage.setItem(LS_NAME, name.trim())
}

/** Reaktiver Zugriff auf den Betrachter-Namen (geteilt von Kommentaren und Live-Standort). */
export function useViewer() {
  const [name, setName] = useState(getViewerName)
  const change = useCallback((next: string) => {
    const t = next.trim()
    saveViewerName(t)
    setName(t)
  }, [])
  return { name, setName: change }
}

// Avatar = Initiale + aus dem Namen gehashte Farbe (deterministisch, gleicher Name -> gleiche Farbe).
const AVATAR_COLORS = ['#FF8A3D', '#6BD5E1', '#b07cc6', '#7c9ec6', '#5DCAA5', '#E2A24B', '#E2685F', '#9d8cff']

export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function avatarInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
