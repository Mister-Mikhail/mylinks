import type { Profile } from '../types'

export function avatarFingerprint(profile: Profile) {
  const source = [profile.avatar_path, profile.avatar_master_path, profile.avatar_poster_path].join('|')
  let hash = 2166136261
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function publicAvatarUrls(profile: Profile) {
  if (!profile.is_published || !profile.avatar_path) return {}
  const root = `/avatar/${encodeURIComponent(profile.handle)}/${avatarFingerprint(profile)}`
  const extension = profile.avatar_media === 'video' ? 'mp4' : 'webp'
  return {
    avatar_preview_url: `${root}-560.${extension}`,
    avatar_master_url: profile.avatar_master_path ? `${root}-1000.${extension}` : null,
    avatar_poster_url: profile.avatar_poster_path ? `${root}-560-poster.webp` : null,
    avatar_master_poster_url: profile.avatar_master_path && profile.avatar_media === 'video' ? `${root}-1000-poster.webp` : null,
  }
}
