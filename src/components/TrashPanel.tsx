import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { LoaderCircle, RotateCcw, Trash2 } from 'lucide-react'
import { deleteStaffUser, restoreStaffUser, staffError, staffTrash, type TrashUser } from '../lib/staff'
const date=(value:string)=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(value))
export function TrashPanel({ onChanged, revision: externalRevision }: { onChanged: () => void; revision: number }) {
 const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[data,setData]=useState<{total:number;items:TrashUser[]}|null>(null)
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState<TrashUser|null>(null)
 useEffect(()=>{let active=true; void staffTrash(page).then(result=>{if(active){setData(result);if(page>0&&!result.items.length)setPage(page-1)}}).catch(e=>{if(active)setError(staffError(e))});return()=>{active=false}},[page,revision,externalRevision])
 const restore=async(user:TrashUser)=>{
  setBusy(user.id);setError('');setNotice('')
  try {if(user.state==='pending') await deleteStaffUser(user.id,user.reason);else await restoreStaffUser(user.id);setNotice(user.state==='pending'?'Перенос в корзину завершён.':'Профиль восстановлен.');setConfirm(null);onChanged()}
  catch(e){setError(staffError(e))}
  finally{setBusy('');setRevision(v=>v+1)}
 }
 return <section className="staff-trash"><p className="staff-footnote">Удалённые профили хранятся до указанной даты. После неё выполняется автоматическое безвозвратное удаление. Если email или user name были заняты повторно, восстановление недоступно.</p>
  {error&&<p role="alert" className="staff-error">{error}</p>}{notice&&<p role="status" className="staff-notice">{notice}</p>}
  {!data?<LoaderCircle className="spin"/>:data.items.length===0?<p className="staff-empty">Корзина пуста.</p>:<div className="staff-trash-list">{data.items.map(user=><article className="staff-card staff-trash-item" key={user.id}><div><h3>{user.display_name||user.handle}</h3><p>@{user.handle} · {user.email}</p><p>{user.reason||'Без комментария'}</p><small>Удалён: {date(user.deleted_at)}<br/>Хранится до: {date(user.expires_at)}</small>{user.restore_blocked&&<p className="staff-reason">{user.restore_blocked}</p>}</div><button className="button button--secondary" disabled={Boolean(busy)||(Boolean(user.restore_blocked)&&user.state!=='pending')} onClick={()=>{setError('');if(user.state==='pending')void restore(user);else setConfirm(user)}}>{busy===user.id?<LoaderCircle className="spin" size={17}/>:user.state==='pending'?<Trash2 size={17}/>:<RotateCcw size={17}/>} {user.state==='pending'?'Завершить перенос':'Восстановить'}</button></article>)}</div>}
  {data&&data.total>25&&<div className="staff-pagination"><button className="button button--secondary" disabled={page===0||Boolean(busy)} onClick={()=>setPage(page-1)}>Назад</button><span>{page+1} / {Math.ceil(data.total/25)}</span><button className="button button--secondary" disabled={(page+1)*25>=data.total||Boolean(busy)} onClick={()=>setPage(page+1)}>Далее</button></div>}
  {confirm&&<Modal className="staff-modal staff-card staff-native-dialog" titleId="restore-title" onClose={()=>setConfirm(null)} busy={Boolean(busy)}><h2 id="restore-title">Восстановить профиль?</h2><p>@{confirm.handle} · {confirm.email}</p><p>Профиль вернётся с прежними ссылками, аватаром и настройками. Существовавшие до удаления ограничения сохранятся.</p>{error&&<p role="alert" className="staff-error">{error}</p>}<div className="staff-modal-actions"><button className="button button--secondary" disabled={Boolean(busy)} onClick={()=>setConfirm(null)}>Отмена</button><button className="button button--primary" disabled={Boolean(busy)} onClick={()=>void restore(confirm)}>Подтвердить восстановление</button></div></Modal>}
 </section>
}
