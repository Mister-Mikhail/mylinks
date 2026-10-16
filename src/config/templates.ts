import type { Profile } from '../types'

export type TemplateCategory = 'minimal' | 'creative' | 'professional'
export type AppearancePatch = Pick<Profile, 'background_preset' | 'card_preset' | 'card_radius' | 'name_font' | 'name_font_size' | 'bio_font' | 'handle_font' | 'name_color' | 'bio_color' | 'handle_color'> & Partial<Pick<Profile, 'background_style' | 'background_primary' | 'background_secondary'>>

export const appearanceKeys = ['background_preset', 'background_style', 'background_primary', 'background_secondary', 'card_preset', 'card_radius', 'name_font', 'name_font_size', 'bio_font', 'handle_font', 'name_color', 'bio_color', 'handle_color'] as const

export interface AppearanceTemplate {
  id: string
  name: string
  category: TemplateCategory
  description: string
  appearance: AppearancePatch
}

export const templates: AppearanceTemplate[] = [
  { id: 'night', name: 'Ночной', category: 'minimal', description: 'Спокойный тёмный профиль', appearance: { background_preset: 'midnight', card_preset: 'glass', card_radius: 13, name_font: 'manrope', name_font_size: 21, bio_font: 'manrope', handle_font: 'manrope', name_color: null, bio_color: null, handle_color: null } },
  { id: 'ink', name: 'Чернила', category: 'professional', description: 'Чёткие карточки и заголовок', appearance: { background_preset: 'midnight', card_preset: 'solid', card_radius: 8, name_font: 'oswald', name_font_size: 26, bio_font: 'arial', handle_font: 'mono', name_color: null, bio_color: null, handle_color: null } },
  { id: 'outline', name: 'Контур', category: 'minimal', description: 'Минимум деталей', appearance: { background_preset: 'midnight', card_preset: 'outline', card_radius: 4, name_font: 'cormorant', name_font_size: 28, bio_font: 'georgia', handle_font: 'manrope', name_color: null, bio_color: null, handle_color: null } },
  { id: 'linen', name: 'Лён', category: 'minimal', description: 'Мягкий светлый фон', appearance: { background_preset: 'mist', card_preset: 'glass', card_radius: 18, name_font: 'georgia', name_font_size: 24, bio_font: 'georgia', handle_font: 'manrope', name_color: null, bio_color: null, handle_color: null } },
  { id: 'editorial', name: 'Редакция', category: 'professional', description: 'Контрастная подача ссылок', appearance: { background_preset: 'mist', card_preset: 'solid', card_radius: 6, name_font: 'cormorant', name_font_size: 28, bio_font: 'arial', handle_font: 'mono', name_color: null, bio_color: null, handle_color: null } },
  { id: 'air', name: 'Воздух', category: 'creative', description: 'Свет и тонкие линии', appearance: { background_preset: 'mist', card_preset: 'outline', card_radius: 24, name_font: 'trebuchet', name_font_size: 22, bio_font: 'manrope', handle_font: 'manrope', name_color: null, bio_color: null, handle_color: null } },
  { id: 'signal', name: 'Сигнал', category: 'professional', description: 'Насыщенный синий', appearance: { background_preset: 'cobalt', card_preset: 'glass', card_radius: 16, name_font: 'rubik-mono', name_font_size: 18, bio_font: 'manrope', handle_font: 'mono', name_color: null, bio_color: null, handle_color: null } },
  { id: 'studio', name: 'Студия', category: 'creative', description: 'Акцент на содержании', appearance: { background_preset: 'cobalt', card_preset: 'solid', card_radius: 21, name_font: 'lobster', name_font_size: 28, bio_font: 'arial', handle_font: 'manrope', name_color: null, bio_color: null, handle_color: null } },
  { id: 'blueprint', name: 'Чертёж', category: 'creative', description: 'Графичный и собранный', appearance: { background_preset: 'cobalt', card_preset: 'outline', card_radius: 5, name_font: 'mono', name_font_size: 20, bio_font: 'mono', handle_font: 'mono', name_color: null, bio_color: null, handle_color: null } },
]

export function appearanceSnapshot(profile: Profile): AppearancePatch {
  return Object.fromEntries(appearanceKeys.map(key => [key, profile[key]])) as AppearancePatch
}
