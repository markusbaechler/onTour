import { useEffect, useMemo, useRef, useState } from 'react'
import { trip } from '../../data/trip'
import { scorePhotos, type ScoreEntry } from '../../lib/photoScore'
import { autoCaption, defaultSelection, generateStoryboard, rankStages } from '../../lib/storyboard'
import { fetchTrack, decodeBlob, uploadedMusic, type MusicSource } from '../../lib/audio'
import { TRACKS, DEFAULT_TRACK } from '../../lib/music'
import { detectBeats } from '../../lib/beats'
import { renderVideo, renderCapability, type RenderResult } from '../../lib/render'
import type { Aspect } from '../../lib/cloudinaryCrop'
import { StoryboardPreview } from './StoryboardPreview'
import { IcX, IcFilm, IcPlay } from '../Icons'
import type { StageStats } from '../../lib/passes'
import type { Comment, Photo, Reaction } from '../../types'

interface Props {
  photos: Photo[]
  comments: Comment[]
  reactions: Reaction[]
  stats: Record<string, StageStats>
  base: string
  onClose: () => void
}

interface EditItem { id: string; caption: string; on: boolean }
const AudioCtor: typeof AudioContext | undefined =
  typeof AudioContext !== 'undefined' ? AudioContext : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

export function VideoStudio({ photos, comments, reactions, stats, base, onClose }: Props) {
  const stagesWithPhotos = useMemo(() => trip.stages.filter((s) => photos.some((p) => p.stageId === s.id)), [photos])
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos])

  const [step, setStep] = useState(1)
  const [scope, setScope] = useState<'all' | string>('all')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [music, setMusic] = useState<MusicSource | null>(null)
  const [bpm, setBpm] = useState<number | undefined>()
  const [musicDur, setMusicDur] = useState<number | undefined>()
  const [target, setTarget] = useState<number | 'music'>(90) // Ziel-Laenge in s (170 = 2:50) oder Musiklaenge
  const [scores, setScores] = useState<Map<string, ScoreEntry> | null>(null)
  const [analyzeProg, setAnalyzeProg] = useState<number | null>(null)
  const [edit, setEdit] = useState<Record<string, EditItem[]>>({})
  const [preview, setPreview] = useState(false)
  const [renderState, setRenderState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [renderPhase, setRenderPhase] = useState<'frames' | 'render'>('frames')
  const [renderProg, setRenderProg] = useState(0)
  const [renderDetail, setRenderDetail] = useState('')
  const [result, setResult] = useState<RenderResult | null>(null)
  const [error, setError] = useState('')
  const scoringRef = useRef(false)
  const control = useRef<{ cancelled: boolean }>({ cancelled: false })
  const resultUrl = useRef<string | null>(null)

  useEffect(() => () => { control.current.cancelled = true; if (resultUrl.current) URL.revokeObjectURL(resultUrl.current) }, [])

  const scopeStages = useMemo(() => (scope === 'all' ? stagesWithPhotos : stagesWithPhotos.filter((s) => s.id === scope)), [scope, stagesWithPhotos])

  // Standard-Track (cannonball) vorwaehlen
  useEffect(() => { fetchTrack(base, DEFAULT_TRACK).then((m) => { if (m) applyMusic(m) }) /* eslint-disable-next-line */ }, [])

  async function applyMusic(src: MusicSource) {
    setMusic(src); setBpm(undefined)
    if (!AudioCtor) return
    try { const ctx = new AudioCtor(); const buf = await decodeBlob(src.blob, ctx); setMusicDur(buf.duration); const bi = await detectBeats(buf); setBpm(bi.bpm); void ctx.close() }
    catch { setBpm(undefined) }
  }

  async function ensureScores() {
    if (scores || scoringRef.current) return
    scoringRef.current = true
    setAnalyzeProg(0)
    const sc = await scorePhotos(photos, comments, reactions, { onProgress: (d, t) => setAnalyzeProg(d / t) })
    setScores(sc)
    setAnalyzeProg(null)
    scoringRef.current = false
  }

  // Auswahl (edit) aufbauen, sobald Scores da sind oder der Umfang wechselt
  useEffect(() => {
    if (!scores) return
    const ranked = rankStages(photos, scores)
    const def = defaultSelection(photos, scores, 3)
    const next: Record<string, EditItem[]> = {}
    for (const s of scopeStages) {
      const list = ranked[s.id] ?? []
      next[s.id] = list.map((p) => ({ id: p.id, caption: autoCaption(p), on: def[s.id]?.includes(p.id) ?? false }))
    }
    setEdit(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, scope])

  const storyboard = useMemo(() => {
    if (!scores) return null
    const selection: Record<string, Array<{ photoId: string; caption: string }>> = {}
    for (const [sid, items] of Object.entries(edit)) selection[sid] = items.filter((i) => i.on).map((i) => ({ photoId: i.id, caption: i.caption }))
    return generateStoryboard(scope, { photos, stats, scores, selection, secPerShot: 2.6, aspect, musicName: music?.name ?? 'theme.mp3', bpm })
  }, [scores, edit, scope, aspect, music, bpm, photos, stats])

  const selectedCount = Object.values(edit).reduce((a, items) => a + items.filter((i) => i.on).length, 0)

  function goNext() {
    setError('')
    if (step === 2) ensureScores()
    setStep((s) => Math.min(5, s + 1))
  }
  function toggle(sid: string, id: string) { setEdit((e) => ({ ...e, [sid]: e[sid].map((i) => (i.id === id ? { ...i, on: !i.on } : i)) })) }
  function move(sid: string, idx: number, dir: -1 | 1) {
    setEdit((e) => { const arr = [...e[sid]]; const j = idx + dir; if (j < 0 || j >= arr.length) return e; [arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...e, [sid]: arr } })
  }
  function setCaption(sid: string, id: string, caption: string) { setEdit((e) => ({ ...e, [sid]: e[sid].map((i) => (i.id === id ? { ...i, caption } : i)) })) }

  async function doRender(budget: 'normal' | 'low' = 'normal') {
    if (!storyboard || !music) { setError('Musik fehlt.'); return }
    control.current = { cancelled: false }
    setRenderState('working'); setRenderProg(0); setError('')
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null }
    setResult(null)
    try {
      const maxSeconds = target === 'music' ? Math.min(170, Math.round(musicDur ?? 90)) : target
      const r = await renderVideo({
        storyboard, photos, stats, music: { blob: music.blob, name: music.name }, budget, maxSeconds, control: control.current,
        onPhase: (ph, pr, detail) => { setRenderPhase(ph); setRenderProg(pr); setRenderDetail(detail ?? '') },
      })
      resultUrl.current = r.url; setResult(r); setRenderState('done'); setRenderProg(1)
    } catch (e) {
      if (control.current.cancelled) { setRenderState('idle'); return }
      setError((e as Error).message || 'Render fehlgeschlagen.'); setRenderState('error')
    }
  }
  function download() {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url; a.download = `bbz-cannonball-${scope === 'all' ? 'tour' : scope}.${result.type}`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div style={overlay}>
      <div style={sheet}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <span className="eyebrow">Video-Studio · Schritt {step}/5</span>
            <h1 className="h1" style={{ fontSize: 20, marginTop: 4 }}>{STEP_TITLE[step - 1]}</h1>
          </div>
          <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {step === 1 && (
            <>
              <Label>Umfang</Label>
              <Chips>
                <Chip active={scope === 'all'} onClick={() => setScope('all')}>Ganze Tour</Chip>
                {stagesWithPhotos.map((s) => <Chip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)}>T{s.day}</Chip>)}
              </Chips>
              <Label>Format</Label>
              <Chips>
                <Chip active={aspect === '9:16'} onClick={() => setAspect('9:16')}>9:16 (Hochkant)</Chip>
                <Chip active={aspect === '16:9'} onClick={() => setAspect('16:9')}>16:9 (Quer)</Chip>
              </Chips>
            </>
          )}

          {step === 2 && (
            <>
              <Label>Musik</Label>
              <Chips>
                {TRACKS.map((tk) => <Chip key={tk.id} active={music?.label === tk.label} onClick={() => fetchTrack(base, tk).then((m) => m && applyMusic(m))}>{tk.label}</Chip>)}
              </Chips>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <IcFilm size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{music?.label ?? 'lädt Standard-Track…'}</div>
                  <div className="mono muted" style={{ fontSize: 11 }}>{bpm ? `${bpm} BPM` : 'BPM…'}{musicDur ? ` · ${Math.round(musicDur)}s` : ''}</div>
                </div>
              </div>
              <label className="btn ghost" style={{ width: '100%', fontSize: 13, cursor: 'pointer' }}>
                Eigener Track (Upload)
                <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) applyMusic(uploadedMusic(f)) }} />
              </label>
              <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>Standard: „bbz Cannonball (Instrumental)". Schnitt-Dauern werden auf die erkannten Beats gerundet.</p>
              <Label>Länge</Label>
              <Chips>
                <Chip active={target === 60} onClick={() => setTarget(60)}>60s</Chip>
                <Chip active={target === 90} onClick={() => setTarget(90)}>90s</Chip>
                <Chip active={target === 170} onClick={() => setTarget(170)}>2:50</Chip>
                <Chip active={target === 'music'} onClick={() => setTarget('music')}>An Musik{musicDur ? ` (${Math.min(170, Math.round(musicDur))}s)` : ''}</Chip>
              </Chips>
              <p className="muted" style={{ fontSize: 11 }}>Lange Videos rendern am Desktop mehrere Minuten (Chunk-Encoding).</p>
            </>
          )}

          {step === 3 && (
            analyzeProg != null ? (
              <Progress label="Analysiere Fotos" value={analyzeProg} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p className="muted" style={{ fontSize: 12 }}>Bestes zuerst. Antippen wählt aus/ab, ▲▼ ordnet, Caption ist editierbar.</p>
                {scopeStages.map((s) => (
                  <section key={s.id}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                      <span className="mono" style={{ color: 'var(--signal)', fontWeight: 700, fontSize: 13 }}>T{s.day}</span>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{s.from} → {s.to}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(edit[s.id] ?? []).map((it, i) => {
                        const p = photoById.get(it.id)
                        const score = Math.round((scores?.get(it.id)?.total ?? 0) * 100)
                        return (
                          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: it.on ? 'rgba(255,138,61,.08)' : 'var(--ink-2)', border: `0.5px solid ${it.on ? 'var(--signal-dim)' : 'var(--slate)'}`, borderRadius: 10, padding: 6 }}>
                            <button onClick={() => toggle(s.id, it.id)} style={{ position: 'relative', width: 46, height: 46, borderRadius: 8, overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, background: 'var(--ink)' }}>
                              {p && <img src={p.thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: it.on ? 1 : 0.5 }} />}
                              <span style={{ position: 'absolute', left: 2, bottom: 2, background: 'rgba(8,7,10,.75)', color: 'var(--signal)', fontSize: 9, fontWeight: 700, padding: '0 3px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{score}</span>
                            </button>
                            <input value={it.caption} onChange={(e) => setCaption(s.id, it.id, e.target.value)} placeholder="Caption…" style={{ flex: 1, minWidth: 0, background: 'var(--ink)', color: 'var(--snow)', border: '0.5px solid var(--slate)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13 }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <button onClick={() => move(s.id, i, -1)} aria-label="hoch" style={arrowBtn}>▲</button>
                              <button onClick={() => move(s.id, i, 1)} aria-label="runter" style={arrowBtn}>▼</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )
          )}

          {step === 4 && storyboard && (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="eyebrow">Storyboard</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>{storyboard.totalSeconds.toFixed(0)}s · {storyboard.aspect} · {bpm ?? '—'} BPM</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {storyboard.scenes.map((sc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span className="pill" style={{ color: 'var(--signal)', borderColor: 'var(--signal-dim)', minWidth: 66, justifyContent: 'center' }}>{SCENE_LABEL[sc.kind]}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.title}{sc.subtitle ? ` · ${sc.subtitle}` : ''}</span>
                      <span className="mono muted" style={{ fontSize: 11 }}>{sc.shots.length ? `${sc.shots.length}📷` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn" style={{ width: '100%' }} onClick={() => setPreview(true)}><IcPlay size={18} /> Vorschau abspielen</button>
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{selectedCount} Fotos ausgewählt.</p>
            </>
          )}

          {step === 5 && (() => {
            const cap = renderCapability()
            const working = renderState === 'working'
            const videoEl = result && renderState === 'done' ? <video src={result.url} controls playsInline style={{ width: '100%', borderRadius: 12, marginBottom: 12, background: '#000' }} /> : null
            const progressEl = working ? <Progress label={(renderPhase === 'frames' ? 'Bilder aufbereiten' : 'Render') + (renderDetail ? ` · ${renderDetail}` : '')} value={renderProg} /> : null
            if (cap.mobile) return (
              <>
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>Video-Render läuft am Desktop – hier kannst du kuratieren und in der Vorschau ansehen. Ein kurzer Versuch in niedriger Auflösung ist möglich.</p>
                {progressEl}{videoEl}
                {result ? (
                  <button className="btn" style={{ width: '100%' }} onClick={download}>Herunterladen (.{result.type})</button>
                ) : (
                  <button className="btn ghost" style={{ width: '100%' }} disabled={working || !music} onClick={() => doRender('low')}>Trotzdem versuchen (kurz · 540p)</button>
                )}
              </>
            )
            return (
              <>
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>Erzeugt ein MP4 direkt im Browser – kostenlos via ffmpeg.wasm (720p). Das kann ein bis mehrere Minuten dauern.</p>
                {progressEl}{videoEl}
                <button className="btn" style={{ width: '100%' }} disabled={working || !music} onClick={() => (result ? download() : doRender('normal'))}>
                  <IcFilm size={18} /> {working ? 'Rendere…' : result ? `Herunterladen (.${result.type})` : 'MP4 erstellen'}
                </button>
                {result && renderState === 'done' && <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => doRender('normal')}>Neu rendern</button>}
              </>
            )
          })()}

          {error && <p style={{ color: 'var(--bad)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--slate)' }}>
          {step > 1 && <button className="btn ghost" style={{ flex: 1 }} onClick={() => setStep((s) => s - 1)}>Zurück</button>}
          {step < 5 && <button className="btn" style={{ flex: 2 }} onClick={goNext} disabled={step === 3 && analyzeProg != null}>Weiter</button>}
        </div>
      </div>

      {preview && storyboard && <StoryboardPreview storyboard={storyboard} photos={photos} musicUrl={music?.url} musicLabel={music?.label} base={base} onClose={() => setPreview(false)} />}
    </div>
  )
}

const STEP_TITLE = ['Umfang & Format', 'Musik', 'Kuratierung', 'Storyboard', 'Export']
const SCENE_LABEL: Record<string, string> = { intro: 'Intro', chapter: 'Kapitel', finale: 'Finale', outro: 'Outro' }

function Label({ children }: { children: React.ReactNode }) { return <span className="lbl" style={{ display: 'block', margin: '4px 0 8px', color: 'var(--mist)', fontSize: 11 }}>{children}</span> }
function Chips({ children }: { children: React.ReactNode }) { return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>{children}</div> }
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ background: active ? 'var(--signal)' : 'var(--ink-2)', color: active ? '#1a0e04' : 'var(--snow)', border: `0.5px solid ${active ? 'var(--signal)' : 'var(--slate)'}`, borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer' }}>{children}</button>
}
function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ margin: '10px 0' }}>
      <div className="mono muted" style={{ fontSize: 11, marginBottom: 6 }}>{label}… {Math.round(value * 100)}%</div>
      <div style={{ height: 6, background: 'var(--ink-2)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: 'var(--signal)', transition: 'width .15s linear' }} /></div>
    </div>
  )
}

const arrowBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--mist)', cursor: 'pointer', fontSize: 10, lineHeight: 1.2, padding: '2px 4px' }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(8,7,10,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }
const sheet: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 'var(--shell)', height: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--ink-raised)', borderTop: '0.5px solid var(--slate)', borderRadius: '20px 20px 0 0', padding: '16px 18px calc(16px + env(safe-area-inset-bottom))' }
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer', padding: 6 }
