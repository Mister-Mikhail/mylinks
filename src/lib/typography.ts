import type { CSSProperties } from 'react'

export const FONT_OPTIONS = [
  { value: 'manrope', label: 'Manrope', family: "'Manrope', Arial, sans-serif" },
  { value: 'arial', label: 'Arimo', family: 'Arimo, Arial, sans-serif' },
  { value: 'verdana', label: 'PT Sans', family: "'PT Sans', Arial, sans-serif" },
  { value: 'trebuchet', label: 'Comfortaa', family: 'Comfortaa, Arial, sans-serif' },
  { value: 'georgia', label: 'Lora', family: 'Lora, Georgia, serif' },
  { value: 'mono', label: 'Roboto Mono', family: "'Roboto Mono', 'Courier New', monospace" },
  { value: 'oswald', label: 'Oswald · узкий', family: "Oswald, Arial, sans-serif" },
  { value: 'cormorant', label: 'Cormorant Garamond · классический', family: "'Cormorant Garamond', Georgia, serif" },
  { value: 'caveat', label: 'Caveat · рукописный', family: 'Caveat, cursive' },
  { value: 'marck', label: 'Marck Script · каллиграфический', family: "'Marck Script', cursive" },
  { value: 'lobster', label: 'Lobster · ретро', family: 'Lobster, cursive' },
  { value: 'pacifico', label: 'Pacifico · кисть', family: 'Pacifico, cursive' },
  { value: 'ruslan', label: 'Ruslan Display · декоративный', family: "'Ruslan Display', fantasy" },
  { value: 'rubik-mono', label: 'Rubik Mono One · массивный', family: "'Rubik Mono One', monospace" },
  { value: 'pixel', label: 'Press Start 2P · пиксельный', family: "'Press Start 2P', monospace" },
] as const

export type FontKey = typeof FONT_OPTIONS[number]['value']
export type TextSlot = 'name' | 'bio' | 'handle' | 'link' | 'contactLabel' | 'contactValue'
export const TEXT_SIZES: Record<TextSlot, readonly number[]> = {
  name: [18, 20, 21, 22, 24, 26, 28],
  bio: [10, 11, 12, 13, 14],
  handle: [10, 11, 12, 13, 14],
  link: [11, 12, 13, 14, 15, 16],
  contactLabel: [10, 11, 12, 13, 14, 15, 16],
  contactValue: [9, 10, 11, 12, 13, 14],
}
export const DEFAULT_SIZES: Record<TextSlot, number> = { name: 21, bio: 10, handle: 10, link: 11, contactLabel: 10, contactValue: 9 }

export function textStyle(font: string | undefined, size: number | undefined, slot: TextSlot, color?: string | null): CSSProperties {
  return {
    fontFamily: (FONT_OPTIONS.find(option => option.value === font) ?? FONT_OPTIONS[0]).family,
    fontSize: 'var(--profile-display-size, var(--profile-font-size))',
    '--profile-font-size': TEXT_SIZES[slot].includes(Number(size)) ? `${size}px` : `${DEFAULT_SIZES[slot]}px`,
    ...(color && /^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}),
  } as CSSProperties
}
