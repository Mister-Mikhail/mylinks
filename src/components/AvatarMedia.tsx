import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { AvatarDraft, Profile } from '../types'

/** Shared by the editor, wizard and public page: no initials and no flattened GIFs. */
export function AvatarMedia({ profile, draft, alt = '' }: { profile: Profile; draft?: AvatarDraft | null; alt?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [videoFailed, setVideoFailed] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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
  }, [reduceMotion, profile.avatar_preview_url, draft?.src])
  const src = draft?.src || profile.avatar_preview_url || profile.avatar_url
  useEffect(() => setVideoFailed(false), [src])
  if (!src) return null
  const kind = draft?.kind || profile.avatar_media || 'image'
  const crop = draft || profile.avatar_crop
  const style: CSSProperties | undefined = crop ? {
    position: 'absolute', width: `${Math.max(1, crop.aspectRatio) * crop.zoom * 100}%`,
    height: `${Math.max(1, 1 / crop.aspectRatio) * crop.zoom * 100}%`,
    left: `${50 + crop.x * 100}%`, top: `${50 + crop.y * 100}%`,
    maxWidth: 'none', transform: 'translate(-50%, -50%)',
  } : undefined
  if ((reduceMotion || videoFailed) && !draft && profile.avatar_poster_url) return <img className="avatar__media" src={profile.avatar_poster_url} alt={alt} />
  return kind === 'video'
    ? <video ref={video} className="avatar__media" src={src} poster={profile.avatar_poster_url || undefined} onError={() => setVideoFailed(true)} aria-label={alt || 'Видеоаватар'} style={style} autoPlay={!reduceMotion} muted loop playsInline preload="metadata" />
    : <img className={draft ? 'avatar__draft' : 'avatar__media'} src={src} alt={alt} style={style} />
}
