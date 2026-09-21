export type BackgroundPreset = 'midnight' | 'mist' | 'cobalt'
export type CardPreset = 'glass' | 'solid' | 'outline'
export type AvatarShape = 'round' | 'square'
export type AvatarSize = 'small' | 'medium' | 'large'
export type LinkIcon = 'instagram' | 'telegram' | 'youtube' | 'tiktok' | 'website' | 'email' | 'link'

export interface Profile {
  id: string
  handle: string
  display_name: string
  bio: string
  avatar_url: string | null
  background_preset: BackgroundPreset
  card_preset: CardPreset
  avatar_shape: AvatarShape
  avatar_size: AvatarSize
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface ProfileLink {
  id: string
  profile_id: string
  label: string
  url: string
  icon_key: LinkIcon
  position: number
  is_visible: boolean
  created_at?: string
  updated_at?: string
}

export interface EditableLink extends Omit<ProfileLink, 'id' | 'profile_id'> {
  id?: string
  profile_id?: string
  localId: string
}
