export interface BeatInfo { bpm: number; beats: number[] }

/** BPM/Beatgrid via web-audio-beat-detector (lazy); Fallback: Energie-Onset-Detektor. */
export async function detectBeats(buffer: AudioBuffer): Promise<BeatInfo> {
  try {
    const { guess } = await import('web-audio-beat-detector')
    const { bpm, offset } = await guess(buffer)
    if (bpm && Number.isFinite(bpm)) return { bpm, beats: grid(bpm, offset ?? 0, buffer.duration) }
    throw new Error('kein bpm')
  } catch {
    return onsetFallback(buffer)
  }
}

function grid(bpm: number, offset: number, duration: number): number[] {
  const iv = 60 / bpm
  const beats: number[] = []
  let t = offset % iv
  if (t < 0) t += iv
  for (; t < duration; t += iv) beats.push(t)
  return beats
}

/** Snappt eine Wunschdauer auf ein ganzzahliges Vielfaches der Beatlaenge (min. 1 Beat). */
export function snapSeconds(sec: number, bpm: number | undefined, minBeats = 1): number {
  if (!bpm || !Number.isFinite(bpm)) return sec
  const iv = 60 / bpm
  return Math.max(minBeats, Math.round(sec / iv)) * iv
}

function onsetFallback(buffer: AudioBuffer): BeatInfo {
  const ch = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const hop = Math.max(1, Math.floor(sr * 0.02))
  const win = hop * 2
  const env: number[] = []
  for (let i = 0; i + win < ch.length; i += hop) { let s = 0; for (let j = 0; j < win; j++) { const v = ch[i + j]; s += v * v } env.push(Math.sqrt(s / win)) }
  const flux = env.map((e, i) => (i > 0 ? Math.max(0, e - env[i - 1]) : 0))
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1)
  let sd = 0
  for (const f of flux) sd += (f - mean) ** 2
  sd = Math.sqrt(sd / (flux.length || 1))
  const thr = mean + 1.2 * sd
  const beats: number[] = []
  let last = -1
  for (let i = 1; i < flux.length - 1; i++) if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) { const t = (i * hop) / sr; if (t - last > 0.28) { beats.push(t); last = t } }
  if (beats.length < 8) { const out: number[] = []; for (let t = 0; t < buffer.duration; t += 0.5) out.push(t); return { bpm: 120, beats: out } }
  const iv: number[] = []
  for (let i = 1; i < beats.length; i++) iv.push(beats[i] - beats[i - 1])
  iv.sort((a, b) => a - b)
  return { bpm: Math.round(60 / (iv[Math.floor(iv.length / 2)] || 0.5)), beats }
}
