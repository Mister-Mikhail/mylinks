import { useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { hexToHsl, hslToHex, normalizeColor } from '../lib/color'
import { copyText } from '../lib/clipboard'
import './color-field.css'
export function ColorField({label,value,onChange}:{label:string;value?:string|null;onChange:(value:string)=>void}) {
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[invalid,setInvalid]=useState(false),[copied,setCopied]=useState(false)
 const [hsl,setHsl]=useState<[number,number,number]>([0,0,100])
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
 useEffect(()=>{
  if(!open)return
  const outside=(event:Event)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);document.addEventListener('keydown',escape)
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',escape)}
 },[open])
 const change=(next:string)=>{onChange(next);setCopied(false);setInvalid(false)}
 const commit=()=>{const normalized=normalizeColor(draft);if(normalized){change(normalized);setEditing(false)}else setInvalid(true)}
 return <div className="color-field" ref={root}>
  <span className="color-field__label">{label}</span>
  <div className="color-field__row">
   <button type="button" className="color-field__swatch" ref={trigger} aria-label={`Палитра: ${label}`} aria-expanded={open} style={{background:value || '#ffffff'}} onClick={()=>{setHsl(hexToHsl(value || '#ffffff'));setOpen(!open)}} />
   <input type="text" aria-label={`Цвет: ${label}`} aria-invalid={invalid} autoComplete="off" spellCheck={false} placeholder="#rrggbb" value={editing?draft:value || ''} onFocus={()=>{setDraft(value || '');setEditing(true)}} onChange={event=>{setDraft(event.target.value);setInvalid(false);const normalized=normalizeColor(event.target.value);if(normalized)change(normalized)}} onBlur={()=>{if(draft.trim())commit();else{setEditing(false);setInvalid(false)}}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit()}if(event.key==='Escape'){setEditing(false);setInvalid(false);event.currentTarget.blur()}}} />
   <button type="button" className="icon-button" aria-label={`Скопировать цвет: ${label}`} disabled={!value} onClick={async()=>setCopied(await copyText(value || ''))}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>
  </div>
  {invalid&&<small role="alert">Введите HEX или RGB: 255 255 255</small>}
  {open&&<div className="color-field__popover" role="group" aria-label={`Палитра цвета: ${label}`}>
   <div className="color-field__heading"><strong>{value || 'Цвет'}</strong><button type="button" className="icon-button" aria-label="Закрыть палитру" onClick={()=>{setOpen(false);trigger.current?.focus()}}><X size={16}/></button></div>
   <div className="color-field__presets">{['#ffffff','#111827','#e17209','#ef4444','#facc15','#22c55e','#38bdf8','#a78bfa'].map(color=><button key={color} type="button" style={{background:color}} aria-label={`Выбрать ${color}`} onClick={()=>{change(color);setHsl(hexToHsl(color))}} />)}</div>
   {(['Тон','Насыщенность','Яркость'] as const).map((name,index)=><label key={name}>{name}<input type="range" aria-label={`${name}: ${label}`} min="0" max={index===0?359:100} value={hsl[index]} onChange={event=>{const next=[...hsl] as [number,number,number];next[index]=Number(event.target.value);setHsl(next);change(hslToHex(...next))}} /></label>)}
   <small>HEX #e17209 или RGB 225 114 9</small>
  </div>}
 </div>
}
