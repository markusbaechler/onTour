interface Props {
  ridden: boolean
  onChange: (ridden: boolean) => void
}

/** Segmented-Control "geplant / gefahren" im Cockpit-Stil. Schreibt nur das ridden-Flag. */
export function RiddenToggle({ ridden, onChange }: Props) {
  return (
    <div role="group" aria-label="Etappenstatus" style={wrap}>
      <button type="button" aria-pressed={!ridden} onClick={() => onChange(false)} style={seg(!ridden, 'geplant')}>
        geplant
      </button>
      <button type="button" aria-pressed={ridden} onClick={() => onChange(true)} style={seg(ridden, 'gefahren')}>
        gefahren
      </button>
    </div>
  )
}

const wrap: React.CSSProperties = {
  display: 'inline-flex',
  background: 'var(--ink-2)',
  border: '0.5px solid var(--slate)',
  borderRadius: 999,
  padding: 2,
}

function seg(active: boolean, kind: 'geplant' | 'gefahren'): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    padding: '5px 13px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    transition: 'background .15s ease, color .15s ease',
  }
  if (!active) return { ...base, background: 'transparent', color: 'var(--mist)' }
  return kind === 'gefahren'
    ? { ...base, background: 'var(--ok)', color: '#08221a', fontWeight: 700 }
    : { ...base, background: 'var(--slate-strong)', color: 'var(--snow)', fontWeight: 700 }
}
