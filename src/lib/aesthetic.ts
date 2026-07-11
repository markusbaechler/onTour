// Optionaler KI-Aesthetik-Score (NIMA) via TensorFlow.js. STRIKT lazy: tfjs wird nur
// per dynamischem import() geladen, damit das Haupt-Bundle schlank bleibt. Fehlt das
// Modell oder scheitert das Laden, faellt alles sauber auf Heuristik zurueck.

type TF = typeof import('@tensorflow/tfjs')
type GraphModel = import('@tensorflow/tfjs').GraphModel

let tf: TF | null = null
let model: GraphModel | null = null
let tried = false
let available = false

export function aiAvailable(): boolean { return available }

/** Leichter Verfuegbarkeits-Check ohne tfjs zu laden (fuer die UI: Toggle nur wenn Modell da). */
export async function modelReachable(): Promise<boolean> {
  const url = (import.meta.env.VITE_NIMA_MODEL_URL as string | undefined) ?? `${import.meta.env.BASE_URL}models/nima/model.json`
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok } catch { return false }
}

/** Laedt tfjs + NIMA-Modell einmalig. Gibt zurueck, ob die KI-Aesthetik nutzbar ist. */
export async function initAesthetic(): Promise<boolean> {
  if (tried) return available
  tried = true
  try {
    tf = await import('@tensorflow/tfjs')
    const url = (import.meta.env.VITE_NIMA_MODEL_URL as string | undefined)
      ?? `${import.meta.env.BASE_URL}models/nima/model.json`
    model = await tf.loadGraphModel(url)
    // Warmlauf (deckt Formfehler frueh auf)
    tf.tidy(() => {
      const warm = tf!.zeros([1, 224, 224, 3])
      const out = model!.predict(warm) as import('@tensorflow/tfjs').Tensor
      out.dataSync()
    })
    available = true
  } catch {
    available = false
    model = null
  }
  return available
}

/** NIMA-Mittelwert (Verteilung 1..10) normalisiert auf 0..1, oder null wenn nicht verfuegbar. */
export function scoreAesthetic(img: HTMLImageElement | HTMLCanvasElement): number | null {
  if (!tf || !model) return null
  try {
    const mean = tf.tidy(() => {
      const x = tf!.browser.fromPixels(img).resizeBilinear([224, 224]).toFloat().div(127.5).sub(1).expandDims(0)
      const out = model!.predict(x) as import('@tensorflow/tfjs').Tensor
      const p = out.reshape([-1]) // 10-Klassen-Verteilung
      const idx = tf!.tensor1d([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      return tf!.sum(tf!.mul(p, idx)).dataSync()[0]
    })
    if (!Number.isFinite(mean)) return null
    return Math.min(1, Math.max(0, (mean - 1) / 9))
  } catch {
    return null
  }
}
