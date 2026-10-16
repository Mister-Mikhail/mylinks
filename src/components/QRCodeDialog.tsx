import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, LoaderCircle, Share2, X } from 'lucide-react'
import { Modal } from './Modal'
import { copyText } from '../lib/clipboard'
import { downloadBlob, profileFilename, profileUrl, shareProfileUrl } from '../lib/profileUrl'

export function QRCodeDialog({ handle, published, updatedAt, avatarPath, onClose }: { handle: string; published: boolean; updatedAt?: string; avatarPath?: string | null; onClose: () => void }) {
 const [size,setSize]=useState(1024),[preview,setPreview]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [mobileShare,setMobileShare]=useState(false)
 const url=profileUrl(handle)
 const sharingUrl=shareProfileUrl(handle,updatedAt,avatarPath)
 useEffect(()=>{
  const query=window.matchMedia('(hover: none) and (pointer: coarse)')
  const update=()=>setMobileShare(query.matches&&typeof navigator.share==='function')
  update();query.addEventListener('change',update)
  return()=>query.removeEventListener('change',update)
 },[])
 useEffect(()=>{
  let active=true
  setPreview('');setError('')
  void QRCode.toDataURL(url,{width:size,margin:4,errorCorrectionLevel:'Q',color:{dark:'#f7fafcff',light:'#101923ff'}}).then(data=>{if(active)setPreview(data)}).catch(()=>{if(active)setError('Не удалось создать QR-код. Попробуйте ещё раз.')})
  return()=>{active=false}
 },[url,size])
 const download=async(format:'png'|'svg')=>{
  setError('')
  try {
   const blob=format==='svg'?new Blob([await QRCode.toString(url,{type:'svg',width:size,margin:4,errorCorrectionLevel:'Q',color:{dark:'#f7fafcff',light:'#101923ff'}})],{type:'image/svg+xml'}):await(await fetch(preview)).blob()
   downloadBlob(blob,`mylinks-${profileFilename(handle)}-qr.${format}`)
  }catch{setError('Не удалось сохранить QR-код. Попробуйте снова.')}
 }
 const share=async()=>{
  try{await navigator.share({title:'Моя страница mylinks.bar',url:sharingUrl})}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError('Не удалось поделиться. Скопируйте ссылку ниже.')}
 }
 return <Modal titleId="qr-title" onClose={onClose}>
  <header><h2 id="qr-title">QR-код страницы</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></header>
  <p className="profile-dialog__url">{url}</p>
  {!published&&<p className="toast toast--error" role="status">Страница пока закрыта. QR-код начнёт открывать её для других людей после публикации.</p>}
  <div className="qr-print-preview">{preview?<img src={preview} width={256} height={256} alt={`QR-код страницы ${handle}`}/>:<LoaderCircle className="spin"/>}</div>
  <div className="profile-dialog__fields"><label>Размер PNG<select aria-label="Размер PNG" value={size} onChange={e=>setSize(Number(e.target.value))}><option value={1024}>1024 × 1024</option><option value={2048}>2048 × 2048</option></select></label></div>
  <p className="profile-dialog__hint">QR-код сохраняется в тёмном оформлении. Проверьте его камерой телефона перед печатью тиража. После смены user name понадобится новый QR-код.</p>
  {error&&<p className="toast toast--error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <div className="profile-dialog__actions"><button className="button button--primary" disabled={!preview} onClick={()=>void download('png')}><Download size={16}/>PNG</button><button className="button button--secondary" disabled={!preview} onClick={()=>void download('svg')}><Download size={16}/>SVG</button><button className="button button--secondary" onClick={async()=>setNotice(await copyText(url)?'Ссылка скопирована.':'Не удалось скопировать. Выделите адрес выше.')}><Copy size={16}/>Ссылка</button>{mobileShare&&<button className="button button--secondary" onClick={()=>void share()}><Share2 size={16}/>Поделиться</button>}</div>
 </Modal>
}
