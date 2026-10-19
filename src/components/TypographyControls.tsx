import { DEFAULT_SIZES, FONT_OPTIONS, TEXT_SIZES, type FontKey, type TextSlot } from '../lib/typography'
import './typography-controls.css'

interface Props {
  label: string
  slot: TextSlot
  font?: FontKey
  size?: number
  color?: string | null
  onChange: (font: FontKey, size: number) => void
  onColorChange?: (color: string | null) => void
  sample?: string
}

const FONT_GROUPS = [
  ['Основные', FONT_OPTIONS.slice(0, 6)],
  ['Заголовки', FONT_OPTIONS.slice(6, 8)],
  ['Рукописные', FONT_OPTIONS.slice(8, 12)],
  ['Декоративные', FONT_OPTIONS.slice(12)],
] as const

export function TypographyControls({ label, slot, font = 'manrope', size = DEFAULT_SIZES[slot], color, onChange, onColorChange, sample }: Props) {
  const family = FONT_OPTIONS.find(option => option.value === font)?.family ?? FONT_OPTIONS[0].family
  return <div className="typography-controls" role="group" aria-label={`Оформление: ${label}`}>
    <label>Шрифт<select aria-label={`Шрифт: ${label}`} value={font} onChange={event => onChange(event.target.value as FontKey, size)}>
      {FONT_GROUPS.map(([group, options]) => <optgroup key={group} label={group}>{options.map(option => <option key={option.value} value={option.value} style={{ fontFamily: option.family }}>{option.label}</option>)}</optgroup>)}
    </select></label>
    <label>Размер<select aria-label={`Размер: ${label}`} value={size} onChange={event => onChange(font, Number(event.target.value))}>
      {TEXT_SIZES[slot].map(value => <option key={value} value={value}>{value} px</option>)}
    </select></label>
    {onColorChange && <label className="typography-controls__color">Цвет<input type="color" aria-label={`Цвет: ${label}`} value={color || '#ffffff'} onChange={event => onColorChange(event.target.value)} />{color || 'Авто'}</label>}
    <span className="typography-controls__sample" style={{ fontFamily: family, color: color || undefined, fontSize: `${size}px` }}>{sample?.trim() || 'Аа Бб 123'} <small>{FONT_OPTIONS.find(option => option.value === font)?.label}</small></span>
    {(font !== 'manrope' || size !== DEFAULT_SIZES[slot]) && <button type="button" className="typography-controls__reset" onClick={() => onChange('manrope', DEFAULT_SIZES[slot])} aria-label={`Сбросить шрифт и размер: ${label}`}>Сбросить</button>}
    {color && onColorChange && <button type="button" className="typography-controls__reset" onClick={() => onColorChange(null)} aria-label={`Вернуть автоматический цвет: ${label}`}>Цвет: авто</button>}
  </div>
}
