import { useState } from 'react'
import { trip } from '../data/trip'
import { Avatar } from './Avatar'
import { IcX } from './Icons'

interface Props {
  current?: string
  onPick: (name: string) => void
  /** Vorhanden = abbrechbares "Wechseln"-Modal; fehlt = blockierender Erststart. */
  onClose?: () => void
}

/**
 * Fahrer-Identitaet ohne Login: einmal aus den 3 Fahrern waehlen oder als
 * Daheimgebliebene/r einen eigenen Namen eingeben. Wird in localStorage gemerkt
 * (useViewer), danach Auto-Login; "wechseln" oeffnet dasselbe Modal erneut.
 */
export function IdentityPicker({ current, onPick, onClose }: Props) {
  const firstRun = !onClose
  const isGuest = !!current && !trip.riders.includes(current)
  const [guest, setGuest] = useState(isGuest)
  const [draft, setDraft] = useState(isGuest ? current ?? '' : '')

  const saveGuest = () => { const t = draft.trim(); if (t) onPick(t) }

  return (
    <div onClick={onClose} style={overlay(firstRun)}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={card}>
        {onClose && (
          <button onClick={onClose} aria-label="Schliessen" style={closeBtn}><IcX size={20} /></button>
        )}
        <span className="eyebrow">{trip.title}</span>
        <h1 className="h1" style={{ marginTop: 6 }}>Wer bist du?</h1>
        <p className="muted" style={{ fontSize: 13, margin: '2px 0 8px' }}>
          Einmal wählen – wird auf diesem Gerät gemerkt.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trip.riders.map((r) => (
            <button
              key={r}
              className="row"
              onClick={() => onPick(r)}
              style={{ cursor: 'pointer', borderColor: r === current ? 'var(--signal)' : undefined }}
            >
              <Avatar name={r} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 500 }}>{r}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>Fahrer</span>
            </button>
          ))}
        </div>

        <div style={{ margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--slate)' }} />
          <span className="mono muted" style={{ fontSize: 10 }}>ODER</span>
          <span style={{ flex: 1, height: 1, background: 'var(--slate)' }} />
        </div>

        {!guest ? (
          <button className="btn ghost" style={{ width: '100%' }} onClick={() => setGuest(true)}>
            Daheimgebliebene/r – eigener Name
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveGuest()}
              placeholder="Dein Name"
              style={input}
            />
            <button className="btn" onClick={saveGuest} disabled={!draft.trim()}>OK</button>
          </div>
        )}
      </div>
    </div>
  )
}

function overlay(firstRun: boolean): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, zIndex: 90,
    background: firstRun ? 'var(--ink)' : 'rgba(8,7,10,.82)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
}
const card: React.CSSProperties = {
  position: 'relative', width: '100%', maxWidth: 360, padding: 18,
  display: 'flex', flexDirection: 'column',
}
const closeBtn: React.CSSProperties = {
  position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--snow)', display: 'flex', cursor: 'pointer',
}
const input: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--ink-2)', color: 'var(--snow)', border: '0.5px solid var(--slate)',
  borderRadius: 8, padding: '11px 13px', fontSize: 16, fontFamily: 'inherit',
}
