import { DEFAULT_SIZES, FONT_OPTIONS, TEXT_SIZES, type FontKey, type TextSlot } from '../lib/typography'

interface Props {
  label: string
  slot: TextSlot
  font?: FontKey
  size?: number
  onChange: (font: FontKey, size: number) => void
}

export function TypographyControls({ label, slot, font = 'manrope', size = DEFAULT_SIZES[slot], onChange }: Props) {
  return <div className="typography-controls" role="group" aria-label={`Оформление: ${label}`}>
    <label>Шрифт<select aria-label={`Шрифт: ${label}`} value={font} onChange={event => onChange(event.target.value as FontKey, size)}>
      {FONT_OPTIONS.map(option => <option key={option.value} value={option.value} style={{ fontFamily: option.family }}>{option.label}</option>)}
    </select></label>
    <label>Размер<select aria-label={`Размер: ${label}`} value={size} onChange={event => onChange(font, Number(event.target.value))}>
      {TEXT_SIZES[slot].map(value => <option key={value} value={value}>{value} px</option>)}
    </select></label>
  </div>
}
