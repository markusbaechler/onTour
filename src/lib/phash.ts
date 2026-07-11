// Wahrnehmungs-Hash (average hash) fuer die Duplikat-Erkennung. 8x8-Graustufen -> 64 Bit.

/** aHash aus einer 8x8-Graustufen-Reihe (0..255). */
export function aHash(gray8x8: number[]): bigint {
  let sum = 0
  for (const g of gray8x8) sum += g
  const avg = sum / gray8x8.length
  let h = 0n
  for (const g of gray8x8) h = (h << 1n) | (g >= avg ? 1n : 0n)
  return h
}

/** Hamming-Distanz zweier 64-Bit-Hashes. */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b
  let c = 0
  while (x > 0n) { c += Number(x & 1n); x >>= 1n }
  return c
}

export interface Hashed { id: string; hash: bigint; score: number }

/**
 * Clustert nahe Duplikate (Hamming <= maxDist) und behaelt je Cluster nur das
 * hoechstbewertete Foto. Liefert das Set der zu behaltenden Foto-Ids.
 */
export function dedupeKeep(items: Hashed[], maxDist = 8): Set<string> {
  const keep = new Set<string>()
  const used = new Array(items.length).fill(false)
  // Nach Score absteigend: der Cluster-Repraesentant ist immer der beste.
  const order = items.map((_, i) => i).sort((a, b) => items[b].score - items[a].score)
  for (const i of order) {
    if (used[i]) continue
    keep.add(items[i].id)
    used[i] = true
    for (const j of order) {
      if (used[j] || j === i) continue
      if (hamming(items[i].hash, items[j].hash) <= maxDist) used[j] = true // Duplikat -> verwerfen
    }
  }
  return keep
}
