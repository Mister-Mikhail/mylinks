import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function DeleteAccount({ onDeleted, handle, open: controlledOpen, onOpenChange }: { onDeleted: () => Promise<void>; handle?: string; open?:boolean; onOpenChange?:(open:boolean)=>void }) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const setOpen = (value:boolean) => { setLocalOpen(value); onOpenChange?.(value) }
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (confirmation !== 'УДАЛИТЬ' || busy) return
    setBusy(true); setError('')
    try {
      // Purge while the account still exists: its JWT cannot authorize a purge after deletion.
      if (handle) {
        const { data: auth } = await supabase.auth.getSession()
        if (auth.session) await fetch('/profile-cache.php', { method: 'POST', headers: { Authorization: `Bearer ${auth.session.access_token}` }, body: new URLSearchParams() }).catch(() => undefined)
      }
      const { data, error: deletionError } = await supabase.functions.invoke('delete-own-account', { body: { confirmation } })
      if (deletionError) {
        const detail = await deletionError.context?.json?.().catch(() => null)
        throw new Error(detail?.error || 'Удаление не завершилось. Повторите попытку.')
      }
      if (!data?.deleted) throw new Error(data?.error || 'Не удалось удалить аккаунт.')
      await onDeleted()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось удалить аккаунт.') }
    finally { setBusy(false) }
  }
  return <>
    {controlledOpen === undefined && <button className="delete-account-trigger" type="button" onClick={() => { setOpen(true); setConfirmation(''); setError('') }}>Удалить мой профиль</button>}
    <dialog className="delete-account-dialog" ref={dialog} aria-labelledby="delete-account-title" onCancel={event => { if (busy) event.preventDefault(); else setOpen(false) }}>
      <h2 id="delete-account-title">Удалить профиль и аккаунт?</h2>
      <p>Страница, ссылки, контакты, статистика и аватар будут удалены без возможности восстановления. Войти в этот аккаунт больше не получится.</p>
      <form onSubmit={submit}>
        <label>Для подтверждения введите УДАЛИТЬ<input autoFocus value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /></label>
        {error && <p role="alert" className="form-message form-message--error">{error}</p>}
        <div className="delete-account-actions"><button type="button" className="button button--secondary" disabled={busy} onClick={() => setOpen(false)}>Отмена</button><button type="submit" className="button delete-account-confirm" disabled={busy || confirmation !== 'УДАЛИТЬ'}>{busy ? 'Удаляем…' : 'Удалить навсегда'}</button></div>
      </form>
    </dialog>
  </>
}
