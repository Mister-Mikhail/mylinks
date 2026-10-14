import type { FontKey } from './lib/typography'

export type BackgroundPreset = 'midnight' | 'mist' | 'cobalt'
export type CardPreset = 'glass' | 'solid' | 'outline'
export type AvatarShape = 'round' | 'square'
export type AvatarSize = 'small' | 'medium' | 'large'
export type LinkIcon = 'instagram' | 'telegram' | 'youtube' | 'tiktok' | 'whatsapp' | 'onlyfans' | 'vk' | 'facebook' | 'x' | 'website' | 'email' | 'link'
export type ContactKind = 'address' | 'phone' | 'email'

export interface Profile {
  id: string
  handle: string
  display_name: string
  bio: string
  name_font?: FontKey
  name_font_size?: number
  bio_font?: FontKey
  bio_font_size?: number
  handle_font?: FontKey
  handle_font_size?: number
  avatar_url: string | null
  avatar_path: string | null
  avatar_preview_url?: string | null
  avatar_media?: 'image' | 'gif' | 'video'
  avatar_crop?: AvatarCrop | null
  avatar_poster_path?: string | null
  avatar_poster_url?: string | null
  background_preset: BackgroundPreset
  card_preset: CardPreset
  avatar_shape: AvatarShape
  avatar_size: AvatarSize
  avatar_scale: number
  is_published: boolean
  onboarding_completed?: boolean
  onboarding_progress?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProfileLink {
  id: string
  profile_id: string
  label: string
  url: string
  label_font?: FontKey
  label_font_size?: number
  icon_key: LinkIcon
  position: number
  is_visible: boolean
  is_sensitive: boolean
  created_at?: string
  updated_at?: string
}

export interface EditableLink extends Omit<ProfileLink, 'id' | 'profile_id'> {
  id?: string
  profile_id?: string
  localId: string
}

export interface ProfileContact {
  id: string
  profile_id: string
  kind: ContactKind
  latitude?: number | null
  longitude?: number | null
  label: string
  value: string
  label_font?: FontKey
  label_font_size?: number
  value_font?: FontKey
  value_font_size?: number
  position: number
  is_visible: boolean
  created_at?: string
  updated_at?: string
}

export interface EditableContact extends Omit<ProfileContact, 'id' | 'profile_id'> {
  id?: string
  profile_id?: string
  localId: string
}

/** Temporary local crop presentation; never stored as profile data. */
export interface AvatarDraft {
  src: string
  aspectRatio: number
  zoom: number
  x: number
  y: number
  kind?: 'image' | 'gif' | 'video'
}

export interface AvatarCrop { aspectRatio: number; zoom: number; x: number; y: number }
export interface AvatarUploadOptions { kind: 'image' | 'gif' | 'video'; crop?: AvatarCrop; poster?: Blob }


