// Overlays/Titelkarten als PNG-Blobs im Browser-Canvas gezeichnet (volle Font-Qualitaet).
// Die App-Fonts werden vor dem Zeichnen via document.fonts.ready sichergestellt.

const INK = '#0E0D11', SNOW = '#F2F1F5', MIST = '#A8A6B2', SIGNAL = '#FF8A3D', GLACIER = '#6BD5E1'
const DISP = '"Space Grotesk", system-ui, sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const BODY = 'Inter, system-ui, sans-serif'

let fontsReady: Promise<unknown> | null = null
function ensureFonts(): Promise<unknown> {
  if (!fontsReady) fontsReady = (document.fonts?.ready ?? Promise.resolve())
  return fontsReady
}
function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'))
}
function make(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  return { c, ctx }
}
function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
function bottomGradient(ctx: CanvasRenderingContext2D, w: number, h: number, from = 0.55) {
  const g = ctx.createLinearGradient(0, h * from, 0, h)
  g.addColorStop(0, 'rgba(8,7,10,0)'); g.addColorStop(1, 'rgba(8,7,10,0.92)')
  ctx.fillStyle = g; ctx.fillRect(0, h * from, w, h * (1 - from))
}

/** Transparentes Caption-Overlay (Verlauf unten, T{day}, Caption, Autor). */
export async function renderCaptionPng(w: number, h: number, o: { day?: number; caption?: string; author?: string }): Promise<Blob> {
  await ensureFonts()
  const { c, ctx } = make(w, h)
  bottomGradient(ctx, w, h, 0.6)
  const pad = Math.round(w * 0.06)
  let y = h - Math.round(h * 0.06)
  if (o.author) { ctx.fillStyle = MIST; ctx.font = `400 ${Math.round(w * 0.026)}px ${BODY}`; ctx.fillText(o.author, pad, y); y -= Math.round(w * 0.05) }
  if (o.caption) { ctx.fillStyle = SNOW; ctx.font = `600 ${Math.round(w * 0.045)}px ${DISP}`; ctx.fillText(clip(ctx, o.caption, w - pad * 2), pad, y); y -= Math.round(w * 0.05) }
  if (o.day != null) { ctx.fillStyle = SIGNAL; ctx.font = `700 ${Math.round(w * 0.032)}px ${MONO}`; ctx.fillText(`T${o.day}`, pad, y) }
  return toBlob(c)
}

/** Titelkarte: opak (Kapitel/Finale/Outro) oder als transparentes Overlay (Intro über Hero). */
export async function renderTitleCardPng(w: number, h: number, o: { title?: string; subtitle?: string; stats?: string; eyebrow?: string; overlay?: boolean }): Promise<Blob> {
  await ensureFonts()
  const { c, ctx } = make(w, h)
  const pad = Math.round(w * 0.08)
  if (o.overlay) {
    bottomGradient(ctx, w, h, 0.4)
    let y = h - Math.round(h * 0.12)
    ctx.textAlign = 'left'
    if (o.title) { ctx.fillStyle = SNOW; ctx.font = `700 ${Math.round(w * 0.085)}px ${DISP}`; ctx.fillText(clip(ctx, o.title, w - pad * 2), pad, y); y += Math.round(w * 0.055) }
    if (o.subtitle) { ctx.fillStyle = SIGNAL; ctx.font = `500 ${Math.round(w * 0.034)}px ${BODY}`; ctx.fillText(o.subtitle, pad, y) }
    return toBlob(c)
  }
  ctx.fillStyle = INK; ctx.fillRect(0, 0, w, h)
  // dezenter Amber-Schimmer oben
  const g = ctx.createRadialGradient(w / 2, h * 0.32, 0, w / 2, h * 0.32, w * 0.7)
  g.addColorStop(0, 'rgba(255,138,61,0.10)'); g.addColorStop(1, 'rgba(255,138,61,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  let y = h / 2 - Math.round(w * 0.02)
  if (o.eyebrow) { ctx.fillStyle = MIST; ctx.font = `400 ${Math.round(w * 0.028)}px ${BODY}`; ctx.fillText(o.eyebrow.toUpperCase(), w / 2, y - Math.round(w * 0.09)) }
  if (o.title) { ctx.fillStyle = SNOW; ctx.font = `700 ${Math.round(w * 0.08)}px ${DISP}`; ctx.fillText(clip(ctx, o.title, w - pad * 2), w / 2, y) }
  if (o.subtitle) { ctx.fillStyle = SNOW; ctx.font = `500 ${Math.round(w * 0.04)}px ${BODY}`; ctx.fillText(clip(ctx, o.subtitle, w - pad * 2), w / 2, y + Math.round(w * 0.07)) }
  if (o.stats) { ctx.fillStyle = GLACIER; ctx.font = `500 ${Math.round(w * 0.03)}px ${MONO}`; ctx.fillText(clip(ctx, o.stats, w - pad * 2), w / 2, y + Math.round(w * 0.13)) }
  return toBlob(c)
}
