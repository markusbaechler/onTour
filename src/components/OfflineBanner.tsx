import { useOutbox } from '../lib/outbox'

/** Sichtbarer Offline-/Sync-Status: Banner + "{n} warten". */
export function OfflineBanner() {
  const { online, pending } = useOutbox()
  if (online && pending === 0) return null

  const offline = !online
  return (
    <div
      role="status"
      style={{
        position: 'sticky', top: 0, zIndex: 45,
        background: offline ? 'var(--warn)' : 'var(--ink-2)',
        color: offline ? '#1a0e04' : 'var(--snow)',
        borderBottom: '0.5px solid var(--slate)',
        padding: '7px 16px',
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: offline ? '#1a0e04' : 'var(--signal)' }} />
      {offline ? 'Offline' : 'Synchronisiere'}
      {pending > 0 && <span style={{ opacity: 0.85 }}>· {pending} warten</span>}
    </div>
  )
}
