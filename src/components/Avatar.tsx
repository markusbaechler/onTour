import { avatarColor, avatarInitial } from '../lib/viewer'

interface Props {
  name: string
  size?: number
}

/** Runder Avatar mit Initiale auf gehashter Farbe (siehe design/comments-mockup.html). */
export function Avatar({ name, size = 26 }: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: avatarColor(name),
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {avatarInitial(name)}
    </div>
  )
}
