import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle, Trash2, X } from 'lucide-react'
import { deleteStaffUser, staffError, type StaffUser } from '../lib/staff'

const confirmationHandle = (value: string) => {
  const trimmed = value.trim().toLowerCase()
  if (/^(?:https?:\/\/)?(?:www\.)?mylinks\.bar\//.test(trimmed)) {
    try {
      const url = new URL(/^https?:/.test(trimmed) ? trimmed : `https://${trimmed}`)
      return decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\/$/, ''))
    } catch { return '' }
  }
  return trimmed.replace(/^@/, '')
}

export function DeleteUserDialog({ user, onClose, onDeleted }: {
  user: StaffUser
  onClose: () => void
  onDeleted: () => void
}) {
  const [handle, setHandle] = useState('')
  const [reason, setReason] = useState('Удаление по запросу администратора')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const container = useRef<HTMLElement>(null)
  const matches = Boolean(user.handle && confirmationHandle(handle) === user.handle)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    container.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user.handle || !matches || reason.trim().length < 3) return
    setBusy(true)
    setError('')
    try {
      await deleteStaffUser(user.id, user.handle, reason.trim())
      onDeleted()
    } catch (caught) {
      setError(staffError(caught))
      setBusy(false)
    }
  }

  return <div className="staff-modal-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className="staff-modal staff-card" ref={container} role="dialog" aria-modal="true" aria-labelledby="staff-delete-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose() }}>
      <button className="staff-modal-close icon-button" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
      <Trash2 className="staff-accent" size={30} />
      <h2 id="staff-delete-title">Удалить пользователя</h2>
      <p>Аккаунт <strong>@{user.handle}</strong> и его профиль будут удалены без возможности восстановления. Ссылки, контакты, статистика и файлы аватара также исчезнут. Запись о действии сохранится в журнале.</p>
      <form onSubmit={submit}>
        <label>Адрес страницы или user name<input value={handle} onChange={event => setHandle(event.target.value)} placeholder={`mylinks.bar/${user.handle}`} autoComplete="off" spellCheck={false} aria-describedby="delete-handle-hint" aria-invalid={Boolean(handle) && !matches} required /></label>
        <small id="delete-handle-hint" aria-live="polite">{matches ? 'Адрес совпадает.' : `Введите ${user.handle}, @${user.handle} или полную ссылку mylinks.bar/${user.handle}.`}</small>
        <label>Причина<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} required placeholder="Причина будет сохранена в журнале" /></label>
        {reason.trim().length < 3 && <small>Укажите причину: минимум 3 символа.</small>}
        {error && <div className="staff-error" role="alert">{error}</div>}
        <div className="staff-modal-actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="button button--primary" type="submit" disabled={busy || !matches || reason.trim().length < 3}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <Trash2 size={17} />} Удалить аккаунт
          </button>
        </div>
      </form>
    </section>
  </div>
}

