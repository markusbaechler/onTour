import { dismiss, useToasts, type ToastKind } from '../lib/toast'

const dotColor: Record<ToastKind, string> = {
  success: 'var(--ok)',
  error: 'var(--bad)',
  info: 'var(--glacier)',
}

/** Dezente Cockpit-Toasts, gestapelt ueber der Bottom-Nav. Tippen schliesst. */
export function Toaster() {
  const items = useToasts()
  if (!items.length) return null
  return (
    <div style={wrap}>
      {items.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)} className="toast" style={card}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor[t.kind], flexShrink: 0 }} />
          <span style={{ fontSize: 13, lineHeight: 1.3, textAlign: 'left' }}>{t.msg}</span>
        </button>
      ))}
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 'calc(72px + env(safe-area-inset-bottom))',
  zIndex: 55, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  padding: '0 16px', pointerEvents: 'none',
}
const card: React.CSSProperties = {
  pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9,
  maxWidth: 'min(92%, var(--shell))',
  background: 'var(--ink-raised)', color: 'var(--snow)',
  border: '0.5px solid var(--slate-strong)', borderRadius: 999, padding: '9px 15px',
  boxShadow: '0 6px 20px rgba(0,0,0,.45)', cursor: 'pointer',
}
