import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, Trash2, X } from 'lucide-react'
import { deleteStaffUser, staffError, type StaffUser } from '../lib/staff'

export function DeleteUserDialog({ user, onClose, onDeleted }: { user: StaffUser; onClose: () => void; onDeleted: () => void }) {
 const [reason,setReason]=useState(''), [days,setDays]=useState(30), [busy,setBusy]=useState(false), [error,setError]=useState('')
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow
  document.body.style.overflow='hidden'; dialog.current?.showModal()
  return ()=>{document.body.style.overflow=overflow; previous?.focus()}
 },[])
 const submit=async(event:FormEvent)=>{
  event.preventDefault(); setBusy(true); setError('')
  try { await deleteStaffUser(user.id,reason,days); onDeleted() }
  catch(error){setError(staffError(error)); setBusy(false)}
 }
 return <dialog ref={dialog} className="staff-modal staff-card staff-native-dialog" aria-labelledby="staff-delete-title" onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
  <button className="staff-modal-close icon-button" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={20}/></button>
  <Trash2 className="staff-accent" size={30}/><h2 id="staff-delete-title">Перенести профиль в корзину?</h2>
  <p><strong>{user.display_name || user.handle}</strong><br/>mylinks.bar/{user.handle}<br/>{user.email}</p>
  <p>Страница будет скрыта, вход отключён. До окончания срока профиль можно восстановить, если его email и user name не занял другой пользователь.</p>
  <form onSubmit={submit}>
   <label>Комментарий причины удаления <small>Необязательно</small><textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000} placeholder="Комментарий сохранится в журнале"/></label>
   <label>Срок хранения в корзине<select value={days} onChange={event=>setDays(Number(event.target.value))}><option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option></select></label>
   <small>После окончания срока аккаунт, ссылки и файлы удалятся безвозвратно.</small>
   {error&&<div className="staff-error" role="alert">{error}</div>}
   <div className="staff-modal-actions"><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="button button--primary" type="submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<Trash2 size={18}/>}В корзину</button></div>
  </form>
 </dialog>
}
