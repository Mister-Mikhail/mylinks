import { useEffect, useRef, useState } from 'react'
import { ImageCropEditor } from './ImageCropEditor'
import type { ImageCrop, FrameCrop } from '../lib/imageCrop'
import { CroppedImage } from './CroppedImage'
import { isFrameCrop } from '../lib/imageCrop'
import { uploadProfileImage } from '../lib/profileImages'
export function ImageAssetField({label,owner,url,onChange,crop,aspect,onCropChange}:{crop?:ImageCrop|null;aspect?:number;onCropChange?:(crop:FrameCrop)=>void;label:string;owner:string;url?:string|null;onChange:(path:string|null,url:string|null,crop?:ImageCrop|null)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [editing,setEditing]=useState(false)
 const [pending,setPending]=useState<{path:string;url:string|null}|null>(null)
 const input=useRef<HTMLInputElement>(null)
 const controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>controller.current?.abort(),[])
 return <div className="image-asset-field">
  {url&&(aspect?<button className="image-asset-field__preview" style={{maxWidth:`${200*aspect}px`}} type="button" aria-label={`Изменить кадр: ${label}`} onClick={()=>setEditing(true)}>{isFrameCrop(crop)?<CroppedImage src={url} crop={crop} alt={label}/>:<img src={url} alt={label}/>}</button>:<img src={url} alt={label} style={{width:'100%',maxHeight:180,objectFit:'cover',borderRadius:10}}/>)}
  <div><button type="button" className="button button--secondary button--small" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Обрабатываем…':label}</button><input ref={input} type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy} style={{display:'none'}} onChange={async event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return
   const abort=new AbortController();controller.current=abort;setBusy(true);setError('')
   try{const result=await uploadProfileImage(file,owner,abort.signal);if(!abort.signal.aborted){if(aspect){setPending(result);setEditing(true)}else onChange(result.path,result.url)}}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить изображение.')}finally{if(!abort.signal.aborted)setBusy(false)}
  }}/></div>
  {url&&aspect&&<button type="button" className="button button--ghost button--small" onClick={()=>setEditing(true)}>Изменить кадр</button>}
  {editing&&(pending?.url||url)&&aspect&&onCropChange&&<ImageCropEditor label={label} src={(pending?.url||url)!} aspect={aspect} crop={pending?null:crop} onCancel={()=>{setPending(null);setEditing(false)}} onApply={next=>{if(pending)onChange(pending.path,pending.url,next);else onCropChange(next);setPending(null);setEditing(false)}}/>}
  {busy&&<button type="button" className="button button--ghost button--small" onClick={()=>{controller.current?.abort();setBusy(false)}}>Отменить загрузку</button>}
  {url&&<button type="button" className="button button--ghost button--small" disabled={busy} onClick={()=>onChange(null,null)}>Удалить изображение</button>}
  <small>JPG, PNG, WebP · до 10 МБ. Уменьшим до 1600 px, удалим метаданные. Применится после сохранения страницы.</small>
  {error&&<p role="alert">{error}</p>}
 </div>
}
