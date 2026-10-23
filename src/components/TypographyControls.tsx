import { useEffect, useRef } from 'react'
import { ColorField } from './ColorField'
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
  const select=useRef<HTMLSelectElement>(null),tape=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const tapeTarget=useRef<number|null>(null)
  const cycle=(direction:number)=>{const current=FONT_OPTIONS.findIndex(option=>option.value===font);onChange(FONT_OPTIONS[(current+direction+FONT_OPTIONS.length)%FONT_OPTIONS.length].value,size)}
  useEffect(()=>{
    const element=select.current;if(!element)return
    const wheel=(event:WheelEvent)=>{if(document.activeElement!==element||!event.deltaY||event.ctrlKey)return;event.preventDefault();const current=FONT_OPTIONS.findIndex(option=>option.value===font);onChange(FONT_OPTIONS[(current+(event.deltaY>0?1:-1)+FONT_OPTIONS.length)%FONT_OPTIONS.length].value,size)}
    element.addEventListener('wheel',wheel,{passive:false});return ()=>element.removeEventListener('wheel',wheel)
  },[font,size,onChange])
  useEffect(()=>()=>clearTimeout(timer.current),[font,size,onChange])
  useEffect(()=>{
    const container=tape.current,option=container?.querySelector<HTMLElement>(`[data-font="${font}"]`)
    if(container&&option&&container.clientWidth){
      const left=Math.max(0,Math.min(container.scrollWidth-container.clientWidth,option.offsetLeft-(container.clientWidth-option.offsetWidth)/2))
      tapeTarget.current=left;container.scrollTo({left,behavior:'instant'})
    }
  },[font])
  const chooseCentered=()=>{
    const container=tape.current;if(!container)return
    const center=container.getBoundingClientRect().left+container.clientWidth/2
    const options=Array.from(container.querySelectorAll<HTMLElement>('[data-font]'))
    const closest=options.reduce<HTMLElement|null>((best,option)=>!best||Math.abs(option.getBoundingClientRect().left+option.clientWidth/2-center)<Math.abs(best.getBoundingClientRect().left+best.clientWidth/2-center)?option:best,null)
    if(closest?.dataset.font&&closest.dataset.font!==font)onChange(closest.dataset.font as FontKey,size)
  }
  const family = FONT_OPTIONS.find(option => option.value === font)?.family ?? FONT_OPTIONS[0].family
  return <div className="typography-controls" role="group" aria-label={`Оформление: ${label}`}>
    <label className="typography-controls__desktop-font">Шрифт<select ref={select} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();cycle(event.key==='ArrowDown'?1:-1)}}} aria-label={`Шрифт: ${label}`} value={font} onChange={event => onChange(event.target.value as FontKey, size)}>
      {FONT_GROUPS.map(([group, options]) => <optgroup key={group} label={group}>{options.map(option => <option key={option.value} value={option.value} style={{ fontFamily: option.family }}>{option.label}</option>)}</optgroup>)}
    </select><small className="typography-controls__wheel-hint">Колесо меняет шрифт, пока поле выбрано</small></label>
    <div className="font-tape" ref={tape} role="listbox" aria-label={`Образцы шрифтов: ${label}`} onScroll={()=>{clearTimeout(timer.current);const container=tape.current;if(container&&tapeTarget.current!==null){const target=tapeTarget.current;tapeTarget.current=null;if(Math.abs(container.scrollLeft-target)<1)return}timer.current=setTimeout(chooseCentered,180)}}>
      {FONT_GROUPS.map(([group,options])=><div className="font-tape__group" key={group} role="group" aria-label={group}><span className="font-tape__separator">{group}</span>{options.map(option=><button type="button" role="option" key={option.value} data-font={option.value} aria-selected={font===option.value} className={font===option.value?'selected':''} onClick={()=>{clearTimeout(timer.current);onChange(option.value,size)}}><span style={{fontFamily:option.family}}>{sample?.trim()||label}</span><small>{option.label}</small></button>)}</div>)}
    </div>
    <label>Размер<select aria-label={`Размер: ${label}`} value={size} onChange={event => onChange(font, Number(event.target.value))}>
      {TEXT_SIZES[slot].map(value => <option key={value} value={value}>{value} px</option>)}
    </select></label>
    {onColorChange && <ColorField label={label} value={color} onChange={onColorChange} />}
    <span className="typography-controls__sample" style={{ fontFamily: family, color: color || undefined, fontSize: `${size}px` }}>{sample?.trim() || 'Аа Бб 123'} <small>{FONT_OPTIONS.find(option => option.value === font)?.label}</small></span>
    {(font !== 'manrope' || size !== DEFAULT_SIZES[slot]) && <button type="button" className="typography-controls__reset" onClick={() => onChange('manrope', DEFAULT_SIZES[slot])} aria-label={`Сбросить шрифт и размер: ${label}`}>Сбросить</button>}
    {color && onColorChange && <button type="button" className="typography-controls__reset" onClick={() => onColorChange(null)} aria-label={`Вернуть автоматический цвет: ${label}`}>Цвет: авто</button>}
  </div>
}
