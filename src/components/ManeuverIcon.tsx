import type { CueType } from '../types'

const BASE = '#3a3942'
const ACTIVE = '#FF8A3D'

// Drehwinkel der Pfeilspitze: 0 = geradeaus, positiv = rechts.
const ANGLE: Partial<Record<CueType, number>> = {
  straight: 0,
  'slight-right': 38, right: 85, 'sharp-right': 130,
  'slight-left': -38, left: -85, 'sharp-left': -130,
}

function TurnArrow({ angle }: { angle: number }) {
  const px = 31, py = 30, len = 19
  const a = (angle * Math.PI) / 180
  const dx = Math.sin(a), dy = -Math.cos(a)
  const ex = px + dx * len, ey = py + dy * len
  const s = 8, w = 6
  const bx = -dx, by = -dy // zurueck
  const perpx = -dy, perpy = dx
  const h1 = `${ex + bx * s + perpx * w},${ey + by * s + perpy * w}`
  const h2 = `${ex + bx * s - perpx * w},${ey + by * s - perpy * w}`
  return (
    <>
      <path d={`M31,57 L${px},${py} L${ex},${ey}`} fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${ex},${ey} L${h1} M${ex},${ey} L${h2}`} fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

export function ManeuverIcon({ type, exit, size = 62 }: { type: CueType; exit?: number; size?: number }) {
  let body: React.ReactNode

  if (type in ANGLE) {
    body = <TurnArrow angle={ANGLE[type] ?? 0} />
  } else if (type === 'roundabout') {
    body = (
      <>
        <path d="M31,57 L31,46" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="31" cy="31" r="13" fill="none" stroke={BASE} strokeWidth="4.5" />
        <path d="M44,26 L52,20" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" />
        <path d="M52,20 L45,19 M52,20 L51,27" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {exit ? <text x="31" y="35" textAnchor="middle" fontSize="13" fontWeight="700" fill={ACTIVE} fontFamily="var(--font-mono)">{exit}</text> : null}
      </>
    )
  } else if (type === 'uturn') {
    body = (
      <>
        <path d="M40,57 L40,30 A9,9 0 0,0 22,30 L22,40" fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22,40 L17,33 M22,40 L27,33" fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  } else if (type === 'keep-left' || type === 'keep-right') {
    const right = type === 'keep-right'
    body = (
      <>
        <path d="M31,57 L31,40" stroke={BASE} strokeWidth="4.5" strokeLinecap="round" />
        <path d={right ? 'M31,40 L43,22' : 'M31,40 L19,22'} stroke={BASE} strokeWidth="4.5" strokeLinecap="round" />
        <path d={right ? 'M31,40 L31,20' : 'M31,40 L31,20'} stroke={BASE} strokeWidth="4.5" strokeLinecap="round" opacity="0.5" />
        <path d={right ? 'M31,57 L31,40 L43,22' : 'M31,57 L31,40 L19,22'} fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={right ? 'M43,22 L36,21 M43,22 L42,29' : 'M19,22 L26,21 M19,22 L20,29'} fill="none" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  } else if (type === 'arrive') {
    body = (
      <>
        <path d="M31,57 L31,30" stroke={ACTIVE} strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="31" cy="22" r="9" fill="none" stroke={ACTIVE} strokeWidth="4.5" />
        <circle cx="31" cy="22" r="3" fill={ACTIVE} />
      </>
    )
  } else {
    // depart / Fallback: gerader Pfeil
    body = <TurnArrow angle={0} />
  }

  return (
    <svg width={size} height={size} viewBox="0 0 62 62" aria-hidden="true">
      {body}
    </svg>
  )
}
