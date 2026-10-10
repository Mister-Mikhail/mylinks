import { useState, type FormEvent } from 'react'
import { LoaderCircle, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { normalizeHandle } from '../lib/validation'

interface TemporaryState {
  is_temporary: boolean
  expired?: boolean
  login_count?: number
  remaining_logins?: number
}

export function TemporaryAccountGate({ account, onClaimed }: { account: TemporaryState; onClaimed: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const { error: claimError } = await supabase.functions.invoke('claim-temporary-account', {
      body: { display_name: displayName.trim(), handle: normalizeHandle(handle), password },
    })
    if (claimError) setError(claimError.message)
    else {
      setNotice('Логин и пароль сохранены. Теперь можно заполнить страницу.')
      window.setTimeout(onClaimed, 600)
    }
    setBusy(false)
  }

  const signOut = async () => { await supabase.auth.signOut() }
  if (account.expired) return <main className="temporary-gate-page"><section className="temporary-gate-card"><ShieldCheck size={28} /><h1>Временный доступ завершён</h1><p>Страница отключена и будет удалена. Если вы хотите её сохранить, свяжитесь с администратором mylinks.bar.</p><button className="temporary-gate-secondary" onClick={() => void signOut()}><LogOut size={16} />Выйти</button></section></main>

  return <main className="temporary-gate-page"><section className="temporary-gate-card">
    <span className="temporary-gate-brand">mylinks.bar</span>
    <span className="temporary-gate-count">Вход {account.login_count || 1} из 10 · осталось {account.remaining_logins ?? 9}</span>
    <h1>Закрепите страницу за собой</h1>
    <p>Выберите адрес, который станет вашим логином, и задайте постоянный пароль. Это займёт минуту.</p>
    {(account.remaining_logins ?? 9) === 0 && <p className="temporary-gate-warning">Это последний вход. Если не сохранить данные, страница будет удалена в течение суток.</p>}
    <form onSubmit={submit}>
      <label>Ваше имя<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required placeholder="Имя для страницы" /></label>
      <label>Логин и адрес страницы<div className="temporary-gate-handle"><span>mylinks.bar/</span><input value={handle} onChange={event => setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9._-]+/g,''))} maxLength={30} autoCapitalize="none" autoCorrect="off" required placeholder="your.name_01" /></div></label>
      <small>После подтверждения входите по этому имени пользователя или по email.</small>
      <label>Новый пароль<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required placeholder="Не менее 6 символов" /></label>
      {error && <div className="temporary-gate-error" role="alert">{error}</div>}
      {notice && <div className="temporary-gate-success" role="status">{notice}</div>}
      <button className="temporary-gate-primary" type="submit" disabled={busy || handle.length < 3 || password.length < 6}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Сохранить и продолжить'}</button>
    </form>
    <button className="temporary-gate-secondary" type="button" onClick={() => void signOut()} disabled={busy}><LogOut size={16} />Выйти</button>
  </section></main>
}
