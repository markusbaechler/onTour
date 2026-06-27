import { useState } from 'react'

interface Props {
  initial?: string
  title?: string
  hint?: string
  onSave: (name: string) => void
  onClose: () => void
}

/** Kleines Modal zum Erfassen/Aendern des Betrachter-Namens (Kommentare + Live-Standort). */
export function NamePrompt({ initial = '', title = 'Dein Name', hint = 'Wird neben deinen Beiträgen angezeigt.', onSave, onClose }: Props) {
  const [draft, setDraft] = useState(initial)
  const save = () => { const t = draft.trim(); if (t) onSave(t) }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="eyebrow">{title}</span>
        <div className="muted" style={{ fontSize: 13 }}>{hint}</div>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="z. B. Markus"
          style={{ background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)', borderRadius: 8, padding: '11px 13px', fontSize: 16 }}
        />
        <button className="btn" onClick={save} disabled={!draft.trim()}>Speichern</button>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,7,10,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}
