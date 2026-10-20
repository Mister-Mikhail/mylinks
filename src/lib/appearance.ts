import type { CSSProperties } from 'react'
import type { Profile } from '../types'

const validColor = (value: string | null | undefined, fallback: string) => value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
const bounded = (value: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback

export function appearanceStyle(profile: Profile): CSSProperties {
  const primary = validColor(profile.background_primary, '#162638')
  const secondary = validColor(profile.background_secondary, '#24435b')
  const image = profile.background_image_url && !/[\\"<>]/.test(profile.background_image_url) ? profile.background_image_url : null
  const overlay = Math.min(80,Math.max(0,profile.background_overlay ?? 45))/100
  const legacy=profile.background_crop?.mode==='legacy'?profile.background_crop:null
  const x = bounded(legacy?legacy.x*100:profile.background_position_x, 50, 0, 100)
  const y = bounded(legacy?legacy.y*100:profile.background_position_y, 50, 0, 100)
  const zoom = bounded(legacy?legacy.zoom*100:profile.background_zoom, 100, 100, 300) / 100
  const imageBackground = profile.background_style === 'image' && image ? `linear-gradient(rgb(0 0 0 / ${overlay}),rgb(0 0 0 / ${overlay})), url("${image}") ${x}% ${y}% / cover no-repeat` : undefined
  const background = profile.background_style === 'solid' ? primary : profile.background_style === 'gradient' ? `linear-gradient(155deg, ${primary}, ${secondary})` : undefined
  const padding = Math.min(24, Math.max(8, Number(profile.card_padding) || 12))
  const border = Math.min(3, Math.max(0, Number(profile.card_border_width ?? 1)))
  const opacity = Math.min(100, Math.max(60, Number(profile.card_opacity) || 100))
  return { '--card-radius': `${Math.min(28, Math.max(4, profile.card_radius ?? 13))}px`, '--card-padding': `${padding}px`, '--card-border-width': `${border}px`, '--card-alpha': opacity / 100, ...(background ? { background } : {}), ...(imageBackground ? { '--profile-image-background': imageBackground, '--profile-image-scale': zoom, '--profile-image-origin': `${x}% ${y}%` } : {}) } as CSSProperties
}

export function appearanceTheme(profile: Profile) {
  if(profile.background_style === 'image')return 'midnight'
  if (profile.background_style !== 'solid' && profile.background_style !== 'gradient') return profile.background_preset
  const value = validColor(profile.background_primary, '#162638').slice(1)
  const channels = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255)
  const luminance = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return luminance[0] * .2126 + luminance[1] * .7152 + luminance[2] * .0722 > .42 ? 'mist' : 'midnight'
}
