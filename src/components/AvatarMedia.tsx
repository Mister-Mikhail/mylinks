import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { AvatarDraft, Profile } from '../types'

/** Shared by the editor, wizard and public page: no initials and no flattened GIFs. */
export function AvatarMedia({ profile, draft, alt = '' }: { profile: Profile; draft?: AvatarDraft | null; alt?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const media = useRef<HTMLElement>(null)
  const [displayWidth, setDisplayWidth] = useState(0)
  const [pixelRatio, setPixelRatio] = useState(() => window.devicePixelRatio || 1)
  const [videoFailed, setVideoFailed] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const src = draft?.src || profile.avatar_preview_url || profile.avatar_url
  const master = !draft ? profile.avatar_master_url : null
  const needsMeasurement = Boolean(master)
  useLayoutEffect(() => {
    if (!needsMeasurement) return
    const parent = media.current?.parentElement
    if (!parent) return
    const measure = () => { setDisplayWidth(Math.max(1, Math.ceil(parent.getBoundingClientRect().width))); setPixelRatio(window.devicePixelRatio || 1) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure) }
  }, [needsMeasurement, src, master])
  const highQuality = Boolean(master && displayWidth * pixelRatio > 560)
  const selectedSrc = highQuality ? master : src
  const poster = highQuality ? profile.avatar_master_poster_url || profile.avatar_poster_url : profile.avatar_poster_url
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduceMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!video.current) return
    if (reduceMotion) video.current.pause()
    else void video.current.play().catch(() => undefined)
  }, [reduceMotion, selectedSrc])
  useEffect(() => setVideoFailed(false), [selectedSrc])
  if (!src) return null
  const kind = draft?.kind || profile.avatar_media || 'image'
  // Stored files are already cropped and rotated on the server. Only the live draft needs CSS positioning.
  const crop = draft
  const frameAspect = profile.avatar_shape === 'full' ? 4 / 5 : 1
  const style: CSSProperties | undefined = crop ? {
    position: 'absolute', width: `${Math.max(1, crop.aspectRatio / frameAspect) * crop.zoom * 100}%`,
    height: `${Math.max(1, frameAspect / crop.aspectRatio) * crop.zoom * 100}%`,
    left: `${50 + crop.x * 100}%`, top: `${50 + crop.y * 100 * frameAspect}%`,
    maxWidth: 'none', transform: `translate(-50%, -50%) rotate(${draft?.rotation || 0}deg)`,
  } : undefined
  if ((reduceMotion || videoFailed) && !draft && poster) return <img ref={(node) => { media.current = node }} className="avatar__media" src={needsMeasurement && !displayWidth ? undefined : poster} alt={alt} />
  return kind === 'video' && !draft
    ? <video ref={(node) => { video.current = node; media.current = node }} className="avatar__media" src={needsMeasurement && !displayWidth ? undefined : selectedSrc || undefined} poster={poster || undefined} onError={() => setVideoFailed(true)} aria-label={alt || 'Видеоаватар'} style={style} autoPlay={!reduceMotion} muted loop playsInline preload="metadata" />
    : <img ref={(node) => { media.current = node }} className={draft ? 'avatar__draft' : 'avatar__media'} src={needsMeasurement && !displayWidth ? undefined : src || undefined} srcSet={master && displayWidth ? `${src} 560w, ${master} 1000w` : undefined} sizes={master && displayWidth ? `${displayWidth}px` : undefined} alt={alt} style={style} />
}
