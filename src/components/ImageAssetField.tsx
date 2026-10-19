import { useEffect, useRef, useState } from 'react'
import { uploadProfileImage } from '../lib/profileImages'
export function ImageAssetField({label,owner,url,onChange}:{label:string;owner:string;url?:string|null;onChange:(path:string|null,url:string|null)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>controller.current?.abort(),[])
 return <div className="image-asset-field">
  {url&&<img src={url} alt={label} style={{width:'100%',maxHeight:180,objectFit:'cover',borderRadius:10}}/>}
  <label className="button button--secondary button--small">{busy?'Обрабатываем…':label}<input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={busy} style={{display:'none'}} onChange={async event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return
   const abort=new AbortController();controller.current=abort;setBusy(true);setError('')
   try{const result=await uploadProfileImage(file,owner,abort.signal);if(!abort.signal.aborted)onChange(result.path,result.url)}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить изображение.')}finally{if(!abort.signal.aborted)setBusy(false)}
  }}/></label>
  {url&&<button type="button" className="button button--ghost button--small" disabled={busy} onClick={()=>onChange(null,null)}>Удалить изображение</button>}
  <small>JPG, PNG, WebP · до 10 МБ. Уменьшим до 1600 px, удалим метаданные. Применится после сохранения страницы.</small>
  {error&&<p role="alert">{error}</p>}
 </div>
}
