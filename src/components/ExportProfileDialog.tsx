import { useState } from 'react'
import { Download, LoaderCircle, X } from 'lucide-react'
import { Modal } from './Modal'
import { defaultExportOptions, exportOwnProfile, type ExportOptions } from '../lib/exportProfile'
import { downloadBlob, profileFilename } from '../lib/profileUrl'
export function ExportProfileDialog({userId,onClose}:{userId:string;onClose:()=>void}){
 const [options,setOptions]=useState(defaultExportOptions),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false)
 const toggle=(key:keyof ExportOptions)=>setOptions(v=>({...v,[key]:!v[key]}))
 const run=async()=>{
  setBusy(true);setError('');setDone(false)
  try{const {blob,handle}=await exportOwnProfile(userId,options);downloadBlob(blob,`mylinks-${profileFilename(handle)}-${new Date().toISOString().slice(0,10)}.json`);setDone(true)}
  catch(e){setError(e instanceof Error?e.message:'Не удалось создать экспорт.')}
  finally{setBusy(false)}
 }
 return <Modal titleId="export-title" onClose={onClose} busy={busy}><header><h2 id="export-title">Экспорт данных</h2><button className="icon-button" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={20}/></button></header>
 <p>JSON-файл с сохранёнными данными вашей страницы. Несохранённые изменения редактора в него не попадут.</p>
 <fieldset disabled={busy} className="export-options"><legend className="visually-hidden">Разделы экспорта</legend>{([['metadata','Имя, описание и адрес страницы'],['links','Ссылки'],['contacts','Контакты'],['appearance','Оформление'],['assets','Список файлов аватара'],['statistics','Сводная статистика за всё время']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={options[key]} onChange={()=>toggle(key)}/>{label}</label>)}
 {options.contacts&&<label className="export-options__nested"><input type="checkbox" checked={options.privateContacts} onChange={()=>toggle('privateContacts')}/>Включить скрытые контакты</label>}
 {options.assets&&<label className="export-options__nested"><input type="checkbox" checked={options.assetUrls} onChange={()=>toggle('assetUrls')}/>Добавить ссылки на скачивание файлов на 5 минут</label>}
 </fieldset>
 <p className="profile-dialog__hint">Формат версии 1 подходит для переноса данных. Файлы аватара скачиваются отдельно по временным ссылкам, если вы их включили. Пароль и данные входа не экспортируются.</p>
 {error&&<p role="alert" className="toast toast--error">{error}</p>}{done&&<p role="status">Файл подготовлен. Проверьте загрузки браузера.</p>}
 <button className="button button--primary" disabled={busy||!(['metadata','links','contacts','appearance','assets','statistics'] as const).some(k=>options[k])} onClick={()=>void run()}>{busy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>} {busy?'Подготавливаем данные…':'Скачать JSON'}</button>
 </Modal>
}
