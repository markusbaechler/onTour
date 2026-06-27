import { useMemo, useRef, useState } from 'react'
import { trip } from '../data/trip'
import { clock, timeAgo } from '../lib/format'
import type { Comment, Photo, Reaction } from '../types'
import { Avatar } from './Avatar'
import { IcMoodPlus, IcSend, IcSmile, IcX } from './Icons'

const REACTIONS = ['❤️', '🔥', '😮', '😍', '👏', '😂', '🙏', '💪']

interface Props {
  photo: Photo
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
  photo, comments, reactions, viewerName,
  onClose, onRemove, onAddComment, onToggleReaction, onChangeName,
}: Props) {
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(false)
  const [emojiBar, setEmojiBar] = useState(false)
  const [askName, setAskName] = useState(false)
  const [nameDraft, setNameDraft] = useState(viewerName)
  const pending = useRef<((name: string) => void) | null>(null)

  const stageDay = trip.stages.find((s) => s.id === photo.stageId)?.day
  const meta = [photo.caption, stageDay ? `T${stageDay}` : null, clock(photo.createdAt)]
    .filter(Boolean)
    .join(' · ')

  // Reaktionen dieses Fotos nach Emoji aggregieren (Count + ob der Betrachter selbst reagiert hat).
  const aggregated = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>()
    for (const r of reactions) {
      if (r.photoId !== photo.id) continue
      const e = map.get(r.emoji) ?? { count: 0, mine: false }
      e.count++
      if (viewerName && r.author === viewerName) e.mine = true
      map.set(r.emoji, e)
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  }, [reactions, photo.id, viewerName])

  const thread = useMemo(
    () => comments.filter((c) => c.photoId === photo.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [comments, photo.id],
  )

  // Aktion, die einen Namen braucht: vorhanden -> sofort, sonst Name abfragen und danach ausfuehren.
  function withName(action: (name: string) => void) {
    if (viewerName) { action(viewerName); return }
    pending.current = action
    setNameDraft('')
    setAskName(true)
  }

  function confirmName() {
    const t = nameDraft.trim()
    if (!t) return
    onChangeName(t)
    setAskName(false)
    const next = pending.current
    pending.current = null
    next?.(t)
  }

  function react(emoji: string) {
    setPicker(false)
    withName((name) => onToggleReaction(photo.id, name, emoji))
  }

  function submit() {
    const body = text.trim()
    if (!body) return
    withName((name) => {
      onAddComment({ id: crypto.randomUUID(), photoId: photo.id, author: name, text: body, createdAt: new Date().toISOString() })
      setText('')
      setEmojiBar(false)
    })
  }

  return (
    <div onClick={onClose} style={overlay}>
      <button onClick={onClose} aria-label="Schliessen" style={closeBtn}>
        <IcX size={26} />
      </button>

      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 'var(--shell)', margin: '0 auto', padding: '0 16px' }}>
        <img src={photo.url} alt={photo.caption ?? `Foto von ${photo.author}`} style={image} />

        {/* Autor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '14px 0 12px' }}>
          <Avatar name={photo.author} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{photo.author}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--mist)' }}>{meta}</div>
          </div>
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
              {REACTIONS.map((e) => (
                <button key={e} onClick={() => react(e)} style={popEmoji}>{e}</button>
              ))}
            </div>
          )}
        </div>

        {/* Kommentar-Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          {thread.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>Noch keine Kommentare – sei die/der Erste.</div>
          )}
          {thread.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9 }}>
              <Avatar name={c.author} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>
                  <b style={{ fontWeight: 500 }}>{c.author}</b>{' '}
                  <span style={{ color: 'var(--mist)' }}>· {timeAgo(c.createdAt)}</span>
                </span>
                <div style={{ fontSize: 13, marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Emoji-Schnellauswahl fuer den Kommentartext */}
        {emojiBar && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {REACTIONS.map((e) => (
              <button key={e} onClick={() => setText((t) => t + e)} style={popEmoji}>{e}</button>
            ))}
          </div>
        )}

        {/* Eingabe */}
        <div style={inputBar}>
          <Avatar name={viewerName || 'Du'} size={22} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Kommentar schreiben…"
            style={textInput}
          />
          <button onClick={() => setEmojiBar((v) => !v)} aria-label="Emoji" style={iconBtn('var(--mist)')}>
            <IcSmile size={19} />
          </button>
          <button onClick={submit} aria-label="Senden" disabled={!text.trim()} style={iconBtn('var(--signal)', !text.trim())}>
            <IcSend size={18} />
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 8 }}>
          {viewerName ? <>Kommentierst als <b style={{ fontWeight: 500 }}>{viewerName}</b> · </> : 'Beim ersten Kommentar fragen wir nach deinem Namen · '}
          <button onClick={() => { setNameDraft(viewerName); pending.current = null; setAskName(true) }} style={linkBtn}>Name ändern</button>
        </div>
      </div>

      {askName && (
        <div onClick={(e) => { e.stopPropagation(); setAskName(false) }} style={nameOverlay}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="eyebrow">Dein Name</span>
            <div className="muted" style={{ fontSize: 13 }}>Wird neben deinen Kommentaren und Reaktionen angezeigt.</div>
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmName()}
              placeholder="z. B. Markus"
              style={{ background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)', borderRadius: 8, padding: '11px 13px', fontSize: 16 }}
            />
            <button className="btn" onClick={confirmName} disabled={!nameDraft.trim()}>Speichern</button>
          </div>
        </div>
      )}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,7,10,.94)',
  overflowY: 'auto', padding: '56px 0 40px', WebkitOverflowScrolling: 'touch',
}
const closeBtn: React.CSSProperties = {
  position: 'fixed', top: 14, right: 14, zIndex: 1, background: 'none', border: 'none', color: 'var(--snow)',
}
const image: React.CSSProperties = {
  width: '100%', maxHeight: '52vh', objectFit: 'contain', display: 'block',
  borderRadius: 12, background: 'var(--ink-2)',
}
function chip(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'var(--ink-2)', border: `0.5px solid ${active ? 'rgba(255,138,61,.5)' : 'var(--slate)'}`,
    borderRadius: 999, padding: '4px 10px', fontSize: 13, color: 'var(--snow)', cursor: 'pointer',
  }
}
const popover: React.CSSProperties = {
  position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 2,
  display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240,
  background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 12, padding: 8,
}
const popEmoji: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 20, lineHeight: 1, padding: 4, cursor: 'pointer',
}
const inputBar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
  background: 'var(--ink-raised)', border: '0.5px solid var(--slate)', borderRadius: 999,
}
const textInput: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
  color: 'var(--snow)', fontSize: 13, fontFamily: 'var(--font-body)',
}
function iconBtn(color: string, disabled = false): React.CSSProperties {
  return { background: 'none', border: 'none', color, padding: 0, display: 'flex', opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }
}
const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--mist)', textDecoration: 'underline', padding: 0, fontSize: 11, cursor: 'pointer',
}
const nameOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,7,10,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}
