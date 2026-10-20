import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'
import { ColorField } from './ColorField'
import { Modal } from './Modal'
import { CroppedImage } from './CroppedImage'
import { useCropGestures } from '../hooks/useCropGestures'
import { frameCrop, isFrameCrop, legacyToFrame, type ImageCrop, type FrameCrop, type Point } from '../lib/imageCrop'
import './image-crop.css'

export function ImageCropEditor({src,aspect,crop,onApply,onCancel,label}:{src:string;aspect:number;crop?:ImageCrop|null;onApply:(crop:FrameCrop)=>void;onCancel:()=>void;label:string}) {
 const title=useId(),viewportRef=useRef<HTMLDivElement>(null)
 const [draft,setDraft]=useState<FrameCrop>(()=>isFrameCrop(crop)?crop:frameCrop(aspect))
 const [ready,setReady]=useState(false),[error,setError]=useState('')
 const [zoom,setZoom]=useState(draft.zoom),[offset,setOffset]=useState<Point>({x:draft.x,y:draft.y})
 const normalized={...draft,zoom,x:offset.x,y:offset.y}
 const gestures=useCropGestures({viewportRef,enabled:ready,zoom,setZoom,offset,setOffset,normalized:true})
 const load=(image:HTMLImageElement)=>{
  const sourceAspect=image.naturalWidth/image.naturalHeight
  const initial=isFrameCrop(crop)?{...crop,aspect,sourceAspect}:crop?.mode==='legacy'?legacyToFrame(crop,aspect,sourceAspect):frameCrop(aspect,sourceAspect)
  setDraft(initial);setZoom(initial.zoom)
  setOffset({x:initial.x,y:initial.y});setReady(true)
 }
 const reset=()=>{setDraft(frameCrop(aspect,draft.sourceAspect));setZoom(1);setOffset({x:0,y:0});gestures.resetPointers()}
 return createPortal(<Modal titleId={title} onClose={onCancel} className="avatar-crop-dialog image-crop-dialog"><section className="avatar-cropper image-crop-editor">
  <div className="avatar-cropper__heading"><div><span className="eyebrow">{label}</span><h2 id={title}>Настройте кадр</h2></div><button type="button" className="icon-button" aria-label="Закрыть редактор кадра" onClick={onCancel}><X size={18}/></button></div>
  <div ref={viewportRef} role="group" tabIndex={0} aria-label={`Кадр: ${label}. Перетащите фото или используйте стрелки`} className="image-crop-editor__viewport" style={{aspectRatio:aspect}} onPointerDown={gestures.startDrag} onPointerMove={gestures.drag} onPointerUp={gestures.stopDrag} onPointerCancel={gestures.stopDrag} onLostPointerCapture={gestures.stopDrag} onKeyDown={gestures.moveWithKeyboard}>
   <CroppedImage src={src} crop={normalized} alt="Выбранный кадр"/>
   <img hidden src={src} alt="" onLoad={event=>load(event.currentTarget)} onError={()=>setError('Не удалось открыть фото. Попробуйте загрузить его снова.')}/>
   <span className="avatar-cropper__grid"/>
  </div>
  <p className="image-crop-editor__hint">Перетащите фото. Масштаб — колесом или двумя пальцами.</p>
  <div className="image-crop-editor__tools"><button className="icon-button" type="button" aria-label="Уменьшить фото" onClick={()=>setZoom(v=>Math.max(.25,v/1.15))}><Minus size={18}/></button><output aria-label="Масштаб кадра">{Math.round(zoom*100)}%</output><button className="icon-button" type="button" aria-label="Увеличить фото" onClick={()=>setZoom(v=>Math.min(3,v*1.15))}><Plus size={18}/></button><button className="button button--ghost button--small" type="button" onClick={reset}><RotateCcw size={15}/>Сбросить кадр</button></div>
  <label className="image-crop-editor__fill">Свободное поле<select aria-label="Заполнение свободного поля" value={draft.fill} onChange={event=>setDraft({...draft,fill:event.target.value as FrameCrop['fill']})}><option value="blur">Размытие фото</option><option value="color">Цвет</option></select></label>
  {draft.fill==='color'&&<ColorField label="Цвет свободного поля" value={draft.color} onChange={color=>setDraft({...draft,color:color||'#162638'})}/>}
  {error&&<p role="alert">{error}</p>}
  <div className="avatar-cropper__actions"><button type="button" className="button button--ghost" onClick={onCancel}>Отмена</button><button type="button" className="button button--primary" disabled={!ready||!!error} onClick={()=>onApply({...normalized,x:Math.min(2,Math.max(-2,normalized.x)),y:Math.min(2,Math.max(-2,normalized.y))})}>Применить</button></div>
 </section></Modal>,document.body)
}
