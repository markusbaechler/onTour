import { useState } from 'react'

interface Props {
  src: string
  alt?: string
  style?: React.CSSProperties
}

/** Bild mit Blur-up/Fade-in: startet unscharf/transparent, wird beim Laden scharf. */
export function BlurImage({ src, alt = '', style }: Props) {
  const [ready, setReady] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`blurup${ready ? ' ready' : ''}`}
      onLoad={() => setReady(true)}
      onError={() => setReady(true)}
      style={style}
    />
  )
}
