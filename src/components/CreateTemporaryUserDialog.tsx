import { useState, type FormEvent } from 'react'
import { Copy, LoaderCircle, Users, X } from 'lucide-react'
import { createTemporaryAccount, staffError } from '../lib/staff'

export function CreateTemporaryUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value) }
    catch { setError('Не удалось скопировать. Выделите данные и скопируйте вручную.') }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await createTemporaryAccount(handle, displayName.trim())
      setCredentials({ login: result.login, password: result.password })
    } catch (caught) { setError(staffError(caught)) }
    finally { setBusy(false) }
  }
  return <div className="staff-modal-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <section className="staff-modal staff-card staff-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-temp-title">
      <button className="staff-modal-close icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
      <Users className="staff-accent" size={28} /><h2 id="create-temp-title">{credentials ? 'Доступ создан' : 'Создать страницу пользователя'}</h2>
      {credentials ? <>
        <p>Скопируйте данные и передайте их пользователю. Пароль больше не будет показан. Войти можно до 10 раз в течение 30 дней, затем страницу удалит система.</p>
        <label>Временный логин<div className="staff-generated-credential"><code>{credentials.login}</code><button type="button" className="icon-button" onClick={() => void copy(credentials.login)} aria-label="Скопировать логин"><Copy size={17} /></button></div></label>
        <label>Временный пароль<div className="staff-generated-credential"><code>{credentials.password}</code><button type="button" className="icon-button" onClick={() => void copy(credentials.password)} aria-label="Скопировать пароль"><Copy size={17} /></button></div></label>
        {error && <div className="staff-error" role="alert">{error}</div>}
        <div className="staff-modal-actions"><button className="button button--primary" onClick={onCreated}>Готово</button></div>
      </> : <form onSubmit={submit}>
        <p>Задайте имя и адрес страницы. После входа пользователь выберет свой email и пароль.</p>
        <label>Имя<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required /></label>
        <label>Адрес страницы<div className="input-prefix"><span>mylinks.bar/</span><input value={handle} onChange={event => setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9._-]+/g, ''))} maxLength={30} autoCapitalize="none" autoCorrect="off" required /></div></label>
        {error && <div className="staff-error" role="alert">{error}</div>}
        <div className="staff-modal-actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Отмена</button><button className="button button--primary" type="submit" disabled={busy || !displayName.trim() || handle.length < 3}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Создать доступ'}</button></div>
      </form>}
    </section>
  </div>
}
