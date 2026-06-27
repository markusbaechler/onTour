import { useEffect, useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { clock, timeAgo } from '../lib/format'
import type { Comment, Photo, Reaction } from '../types'
import { Avatar } from './Avatar'
import { IdentityPicker } from './IdentityPicker'
import { IcMoodPlus, IcSend, IcSmile, IcX } from './Icons'

const REACTIONS = ['❤️', '🔥', '😮', '😍', '👏', '😂', '🙏', '💪']

interface Props {
  photos: Photo[] // geordnete Liste fuer die Story
  startId: string
  comments: Comment[]
  reactions: Reaction[]
  viewerName: string
  onClose: () => void
  onRemove: (id: string) => void
  onAddComment: (c: Comment) => void
  onToggleReaction: (photoId: string, author: string, emoji: string) => void
  onChangeName: (name: string) => void
}

export function PhotoLightbox({
  photos, startId, comments, reactions, viewerName,
  onClose, onRemove, onAddComment, onToggleReaction, onChangeName,
}: Props) {
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === startId)))
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(false)
  const [emojiBar, setEmojiBar] = useState(false)
  const [switching, setSwitching] = useState(false)
  const touchX = useRef<number | null>(null)

  const safeIndex = Math.min(index, photos.length - 1)
  const photo = photos[safeIndex]

  // Story leer -> schliessen (z. B. letztes Foto geloescht)
  useEffect(() => { if (photos.length === 0) onClose() }, [photos.length, onClose])
  // beim Wechsel Eingabe/Popovers zuruecksetzen
  useEffect(() => { setText(''); setPicker(false); setEmojiBar(false) }, [safeIndex])

  const go = (d: number) => setIndex((i) => Math.min(photos.length - 1, Math.max(0, Math.min(i, photos.length - 1) + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, onClose])

  const stageDay = trip.stages.find((s) => s.id === photo?.stageId)?.day
  const meta = useMemo(
    () => (photo ? [photo.caption, stageDay ? `T${stageDay}` : null, clock(photo.createdAt)].filter(Boolean).join(' · ') : ''),
    [photo, stageDay],
  )

  const aggregated = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>()
    for (const r of reactions) {
      if (!photo || r.photoId !== photo.id) continue
      const e = map.get(r.emoji) ?? { count: 0, mine: false }
      e.count++
      if (viewerName && r.author === viewerName) e.mine = true
      map.set(r.emoji, e)
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  }, [reactions, photo, viewerName])

  const thread = useMemo(
    () => (photo ? comments.filter((c) => c.photoId === photo.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []),
    [comments, photo],
  )

  if (!photo) return null

  function react(emoji: string) {
    setPicker(false)
    onToggleReaction(photo.id, viewerName, emoji)
  }
  function submit() {
    const body = text.trim()
    if (!body) return
    onAddComment({ id: crypto.randomUUID(), photoId: photo.id, author: viewerName, text: body, createdAt: new Date().toISOString() })
    setText('')
    setEmojiBar(false)
  }

  return (
    <div onClick={onClose} style={overlay}>
      {/* Story-Fortschritt */}
      <div style={progRow}>
        {photos.map((p, i) => (
          <span key={p.id} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i <= safeIndex ? 'var(--snow)' : 'rgba(242,241,245,.25)' }} />
        ))}
      </div>
      <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={26} /></button>

      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 16px' }}>
        <div
          style={{ position: 'relative' }}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current == null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
            touchX.current = null
          }}
        >
          <img key={photo.id} className="fade-swap" src={photo.url} alt={photo.caption ?? `Foto von ${photo.author}`} style={image} />
          {safeIndex > 0 && <button aria-label="Vorheriges" onClick={() => go(-1)} style={zone('left')}><span style={chev}>‹</span></button>}
          {safeIndex < photos.length - 1 && <button aria-label="Nächstes" onClick={() => go(1)} style={zone('right')}><span style={chev}>›</span></button>}
        </div>

        {/* Autor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '14px 0 12px' }}>
          <Avatar name={photo.author} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{photo.author}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>{meta}</div>
          </div>
          <span className="mono muted" style={{ fontSize: 11 }}>{safeIndex + 1}/{photos.length}</span>
          <button onClick={() => onRemove(photo.id)} className="pill plan" style={{ background: 'none', cursor: 'pointer' }}>Löschen</button>
        </div>

        {/* Reaktions-Leiste */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14, position: 'relative' }}>
          {aggregated.map(([emoji, { count, mine }]) => (
            <button key={emoji} onClick={() => react(emoji)} style={chip(mine)}>
              {emoji} <span className="mono" style={{ color: mine ? 'var(--snow)' : 'var(--mist)' }}>{count}</span>
            </button>
          ))}
          <button onClick={() => setPicker((v) => !v)} aria-label="Reaktion hinzufügen" style={{ ...chip(false), color: 'var(--mist)' }}>
            <IcMoodPlus size={16} />
          </button>
          {picker && (
            <div style={popover}>
              {REACTIONS.map((e) => <button key={e} onClick={() => react(e)} style={popEmoji}>{e}</button>)}
            </div>
          )}
        </div>

        {/* Kommentar-Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          {thread.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Noch keine Kommentare – sei die/der Erste.</div>}
          {thread.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <Avatar name={c.author} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13 }}><b style={{ fontWeight: 500 }}>{c.author}</b> <span style={{ color: 'var(--mist)' }}>· {timeAgo(c.createdAt)}</span></span>
                <div style={{ fontSize: 13, marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>

        {emojiBar && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {REACTIONS.map((e) => <button key={e} onClick={() => setText((t) => t + e)} style={popEmoji}>{e}</button>)}
          </div>
        )}

        <div style={inputBar}>
          <Avatar name={viewerName || 'Du'} size={22} />
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Kommentar schreiben…" style={textInput} />
          <button onClick={() => setEmojiBar((v) => !v)} aria-label="Emoji" style={iconBtn('var(--mist)')}><IcSmile size={19} /></button>
          <button onClick={submit} aria-label="Senden" disabled={!text.trim()} style={iconBtn('var(--signal)', !text.trim())}><IcSend size={18} /></button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 8 }}>
          Kommentierst als <b style={{ fontWeight: 500 }}>{viewerName}</b> ·{' '}
          <button onClick={() => setSwitching(true)} style={linkBtn}>wechseln</button>
        </div>
      </div>

      {switching && (
        <IdentityPicker current={viewerName} onPick={(n) => { onChangeName(n); setSwitching(false) }} onClose={() => setSwitching(false)} />
      )}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,7,10,.94)',
  overflowY: 'auto', padding: '40px 0 40px', WebkitOverflowScrolling: 'touch',
}
const progRow: React.CSSProperties = {
  position: 'fixed', top: 8, left: 0, right: 0, zIndex: 2,
  display: 'flex', gap: 3, maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 16px',
}
const closeBtn: React.CSSProperties = {
  position: 'fixed', top: 16, right: 14, zIndex: 3, background: 'none', border: 'none', color: 'var(--snow)',
}
const image: React.CSSProperties = {
  width: '100%', maxHeight: '56vh', objectFit: 'contain', display: 'block',
  borderRadius: 12, background: 'var(--ink-2)',
}
function zone(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: 0, bottom: 0, [side]: 0, width: '32%',
    display: 'flex', alignItems: 'center', justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
    padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer',
  }
}
const chev: React.CSSProperties = {
  fontSize: 30, lineHeight: 1, color: 'var(--snow)', background: 'rgba(8,7,10,.5)',
  width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
function chip(active: boolean): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--ink-2)', border: `0.5px solid ${active ? 'rgba(255,138,61,.5)' : 'var(--slate)'}`, borderRadius: 999, padding: '4px 10px', fontSize: 13, color: 'var(--snow)', cursor: 'pointer' }
}
const popover: React.CSSProperties = { position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 2, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240, background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 12, padding: 8 }
const popEmoji: React.CSSProperties = { background: 'none', border: 'none', fontSize: 20, lineHeight: 1, padding: 4, cursor: 'pointer' }
const inputBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 999 }
const textInput: React.CSSProperties = { flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--snow)', fontSize: 13, fontFamily: 'var(--font-body)' }
function iconBtn(color: string, disabled = false): React.CSSProperties {
  return { background: 'none', border: 'none', color, padding: 0, display: 'flex', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }
}
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--mist)', textDecoration: 'underline', padding: 0, fontSize: 11, cursor: 'pointer' }
