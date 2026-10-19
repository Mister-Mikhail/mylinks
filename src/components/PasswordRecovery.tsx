import { useEffect, useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, LoaderCircle, Mail, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isAuthSessionMissingError } from '@supabase/supabase-js'
import { BrandMark } from './BrandMark'
import { supabase } from '../lib/supabase'

let recoveryVerification: { token: string; promise: ReturnType<typeof supabase.auth.verifyOtp> } | null = null

export function PasswordRecoveryRequest() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || cooldown) return
    setBusy(true); setError('')
    const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://mylinks.bar/auth/reset',
    })
    if (requestError?.status === 429) { setError('Слишком много запросов. Повторите через минуту.'); setCooldown(60) }
    else { setSent(true); setCooldown(60) }
    setBusy(false)
  }
  return <main className="private-access-page"><BrandMark /><div className="private-access-card">
    <Mail size={28} /><h1>Восстановление пароля</h1>
    <p>{sent ? 'Если адрес зарегистрирован, мы отправили письмо.' : 'Укажите email вашего аккаунта. Мы пришлём ссылку для смены пароля.'}</p>
    <form className="confirmation-resend" onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
      <button className="button button--primary button--full" disabled={busy || cooldown > 0} type="submit">{busy ? <LoaderCircle className="spin" size={18} /> : <Mail size={17} />}{cooldown ? `Повторить через ${cooldown} с` : sent ? 'Отправить ещё раз' : 'Отправить ссылку'}</button>
    </form>
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    <Link className="button button--ghost" to="/">Вернуться ко входу</Link>
  </div></main>
}

export function PasswordRecoveryForm() {
  const [token] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const search = new URLSearchParams(window.location.search)
    return hash.get('token_hash') ?? search.get('token_hash')
  })
  const [linkError] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const search = new URLSearchParams(window.location.search)
    return hash.get('error_code') ?? search.get('error_code')
  })
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(Boolean(token))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    window.history.replaceState(null, '', '/auth/reset')
    if (recoveryVerification?.token !== token) recoveryVerification = { token, promise: supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' }) }
    void recoveryVerification.promise.then(({ error: verifyError }) => {
      if (!active) return
      setVerified(!verifyError); setChecking(false)
      if (verifyError) setError('Ссылка истекла или уже использована. Запросите новую.')
    }).catch(() => { if (active) { setChecking(false); setError('Не удалось проверить ссылку. Попробуйте запросить новую.') } })
    return () => { active = false }
  }, [token])

  const canReset = !linkError && !checking && Boolean(token && verified)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (password.length < 6) { setError('Пароль должен содержать не менее 6 символов.'); return }
    if (password !== confirm) { setError('Пароли не совпадают.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      if (updateError.code === 'same_password') {
        setError('Новый пароль должен отличаться от текущего. Придумайте другой пароль.')
      } else if (updateError.code === 'weak_password') {
        setError('Пароль не соответствует требованиям безопасности. Выберите более сложный пароль.')
      } else if (updateError.status === 429) {
        setError('Слишком много попыток. Подождите минуту и повторите.')
      } else if (isAuthSessionMissingError(updateError) || updateError.status === 401 || ['session_expired', 'session_not_found', 'refresh_token_not_found', 'reauthentication_needed'].includes(updateError.code ?? '')) {
        setError('Сеанс восстановления истёк. Запросите новое письмо.')
      } else {
        setError('Не удалось изменить пароль. Повторите попытку чуть позже.')
      }
    }
    else {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
      if (signOutError) setError('Пароль изменён, но не удалось завершить другие сеансы. Повторите выход на других устройствах.')
      setSaved(true); setPassword(''); setConfirm('')
    }
    setBusy(false)
  }
  return <main className="private-access-page"><BrandMark /><div className="private-access-card">
    {saved ? <Check size={28} /> : linkError || error ? <X size={28} /> : <Mail size={28} />}
    <h1>{saved ? 'Пароль изменён' : checking ? 'Проверяем ссылку…' : 'Новый пароль'}</h1>
    {saved ? <><p>Теперь вы можете открыть личный кабинет.</p><Link className="button button--primary" to="/">Перейти в кабинет</Link></> : canReset ? <>
      <p>Придумайте пароль не короче шести символов.</p>
      <form className="confirmation-resend" onSubmit={submit}>
        <label>Новый пароль<div className="password-field"><input type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={6} autoComplete="new-password" required /><button type="button" onClick={() => setShow(value => !value)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <label>Повторите пароль<div className="password-field"><input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={event => setConfirm(event.target.value)} minLength={6} autoComplete="new-password" required /><button type="button" onClick={() => setShowConfirm(value => !value)} aria-label={showConfirm ? 'Скрыть повтор пароля' : 'Показать повтор пароля'}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <button className="button button--primary button--full" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Сохранить пароль'}</button>
      </form>
    </> : <p>{checking ? 'Это займёт несколько секунд.' : 'Ссылка истекла или недействительна. Запросите новое письмо.'}</p>}
    {error && <p role="alert" className="form-message form-message--error">{error}</p>}
    {!saved && !checking && <Link className="button button--ghost" to="/auth/forgot-password">Отправить новое письмо</Link>}
  </div></main>
}
