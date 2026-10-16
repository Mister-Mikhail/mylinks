import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Check, Eye, EyeOff, FileClock, LoaderCircle, LogOut, MessageSquareWarning, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, Users, X } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { CreateTemporaryUserDialog } from './CreateTemporaryUserDialog'
import { DeleteUserDialog } from './DeleteUserDialog'
import { TrashPanel } from './TrashPanel'
import { ReportsPanel } from './ReportsPanel'
import { supabase } from '../lib/supabase'
import { useStaffRole } from '../lib/useStaffRole'
import { actionLabels, roleLabels, staffChange, staffDetail, staffError, staffHistory, staffUsers, invalidatePublicProfile, type StaffAction, type StaffDetail, type StaffEvent, type StaffRole, type StaffUser, type StaffUsers, type UserFilter, type UserRole } from '../lib/staff'
import { isValidHttpUrl } from '../lib/validation'
import './admin.css'

const date = (value: string | null) => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(value)) : 'Ещё не входил'
const number = (value: number) => new Intl.NumberFormat('ru-RU').format(value)
const initials = (name: string) => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
const filters: { key: UserFilter; label: string }[] = [{ key: 'all', label: 'Все' }, { key: 'new', label: 'Новые за 7 дней' }, { key: 'restricted', label: 'Ограниченные' }, { key: 'staff', label: 'Сотрудники' }]
type PendingAction = { target: string; action: StaffAction; label: string }

export default function AdminPanel({ session }: { session: Session | null }) {
  const access = useStaffRole(session?.user.id)
  const [signOutError, setSignOutError] = useState('')
  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) setSignOutError(staffError(error))
  }
  if (!session) return <StaffLogin />
  if (access.loading) return <div className="staff-access"><LoaderCircle className="spin" /><span>Проверяем доступ…</span></div>
  if (!access.role) return <AccessShell><section className="staff-login-card"><ShieldOff size={42} /><h1>Доступ закрыт</h1><p>{access.error || 'У этого аккаунта нет прав администратора или модератора. Назначить роль может администратор mylinks.bar.'}</p>{access.error && <button className="button button--secondary" onClick={access.retry}>Повторить проверку</button>}<Link className="button button--primary" to="/">Перейти в профиль</Link><button className="button button--secondary" onClick={signOut}>Войти в другой аккаунт</button>{signOutError && <p role="alert">{signOutError}</p>}</section></AccessShell>
  return <StaffWorkspace key={session.user.id} role={access.role} email={session.user.email || ''} onSignOut={signOut} onRoleChange={access.retry} signOutError={signOutError} />
}

function AccessShell({ children }: { children: React.ReactNode }) {
  return <div className="staff-app staff-access-page"><header className="staff-header"><Link to="/" aria-label="mylinks.bar"><BrandMark /></Link><span>Управление mylinks.bar</span></header><main className="staff-access-layout"><aside className="staff-welcome"><img src="/admin/staff-access.webp" alt="" /><h2>Управление mylinks.bar</h2><p>Пользователи, публикации и история действий команды.</p></aside>{children}</main></div>
}

function StaffLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    } catch (error) { setError(staffError(error).includes('Invalid login credentials') ? 'Неверный email или пароль.' : staffError(error)) }
    finally { setBusy(false) }
  }
  return <AccessShell><section className="staff-login-card"><BrandMark /><h1>Вход для сотрудников</h1><p>Войдите в существующий аккаунт администратора или модератора.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label><label htmlFor="staff-password">Пароль</label><div className="staff-password"><input id="staff-password" type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShow(value => !value)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>{error && <div className="staff-error" role="alert">{error}</div>}<button type="submit" className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Войти'}</button></form><Link to="/auth/forgot-password" className="staff-muted-link">Забыли пароль?</Link><Link to="/" className="staff-muted-link">Вернуться на сайт</Link></section></AccessShell>
}

function StaffWorkspace({ role, email, onSignOut, onRoleChange, signOutError }: { role: StaffRole; email: string; onSignOut: () => void; onRoleChange: () => void; signOutError: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const isLog = location.pathname === '/admin/log'
  const isReports = location.pathname === '/admin/reports'
  const isTrash = location.pathname === '/admin/trash'
  const userId = location.pathname.match(/^\/admin\/users\/([0-9a-f-]{36})$/i)?.[1]
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')
  const [page, setPage] = useState(0)
  const [logPage, setLogPage] = useState(0)
  const [users, setUsers] = useState<StaffUsers | null>(null)
  const [detail, setDetail] = useState<StaffDetail | null>(null)
  const [history, setHistory] = useState<{ total: number; events: StaffEvent[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [newUsers, setNewUsers] = useState(0)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null)
  const previousTotal = useRef<number | null>(null)

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(0) }, 300); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !pending) setRevision(value => value + 1) }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [pending])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError('')
      try {
        if (userId) {
          const data = await staffDetail(userId)
          if (!cancelled) setDetail(data)
        } else if (isLog) {
          const data = await staffHistory(logPage)
          if (!cancelled) setHistory(data)
        } else if (!isReports && !isTrash) {
          const data = await staffUsers(search, filter, page)
          if (!cancelled) {
            if (previousTotal.current !== null && data.stats.total > previousTotal.current) setNewUsers(value => value + data.stats.total - previousTotal.current!)
            previousTotal.current = data.stats.total
            setUsers(data)
            if (page > 0 && data.users.length === 0) setPage(Math.max(0, Math.ceil(data.total / 25) - 1))
          }
        }
      } catch (error) { if (!cancelled) { setError(staffError(error)); setUsers(null); setDetail(null); setHistory(null) } }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [userId, isLog, isReports, isTrash, search, filter, page, logPage, revision])

  const refresh = () => setRevision(value => value + 1)
  const openAction = (target: string, action: StaffAction, label: string) => { setNotice(''); setPending({ target, action, label }) }
  const changed = async () => {
    if (detail?.user?.handle) await invalidatePublicProfile(detail.user.handle)
    setPending(null); setNotice('Изменение сохранено и добавлено в журнал.'); refresh(); onRoleChange()
  }

  return <div className="staff-app"><header id="viewport-1-winner-nav" className="staff-header"><Link to="/" aria-label="mylinks.bar"><BrandMark /></Link><div className="staff-account"><ShieldCheck size={19} /><div><strong>{email}</strong><span>{roleLabels[role]}</span></div><button className="icon-button" onClick={onSignOut} aria-label="Выйти"><LogOut size={19} /></button></div></header><div className="staff-layout"><nav id="viewport-1-winner-sidebar" className="staff-sidebar" aria-label="Панель управления"><Link className={!isLog && !isReports && !isTrash ? 'active' : ''} to="/admin"><Users size={20} />Пользователи</Link><Link className={isReports ? 'active' : ''} to="/admin/reports"><MessageSquareWarning size={20} />Жалобы</Link><Link className={isLog ? 'active' : ''} to="/admin/log"><FileClock size={20} />Журнал действий</Link>{role === 'admin' && <Link className={isTrash ? 'active' : ''} to="/admin/trash"><Trash2 size={20} />Корзина</Link>}<Link className="staff-editor-link" to="/">Вернуться в редактор</Link></nav><main id="viewport-1-winner-main" className="staff-main">
    <div className="staff-page-heading"><div><h1>{userId ? 'Карточка пользователя' : isLog ? 'Журнал действий' : isReports ? 'Жалобы' : isTrash ? 'Корзина' : 'Пользователи'}</h1><p>{isTrash ? 'Удалённые профили и восстановление.' : isLog ? 'Действия команды, их причины и время.' : isReports ? 'Сообщения о страницах и ссылках пользователей.' : userId ? 'Профиль, ссылки и права доступа.' : 'Регистрации, профили и роли на mylinks.bar.'}</p></div><div className="staff-heading-actions">{role === 'admin' && !userId && !isLog && !isReports && !isTrash && <button className="button button--primary button--small" onClick={() => setCreateUserOpen(true)}><Plus size={16} />Создать пользователя</button>}<button className="button button--secondary button--small" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />Обновить</button></div></div>
    {newUsers > 0 && !userId && !isLog && !isReports && !isTrash && <button className="staff-new" onClick={() => { setFilter('new'); setPage(0); setNewUsers(0) }}>Новых регистраций: {newUsers}. Посмотреть</button>}
    {(error || signOutError) && <div className="staff-error" role="alert">{error || signOutError}<button onClick={refresh}>Повторить</button></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18} />{notice}</div>}
    {loading && !users && !detail && !history && <div className="staff-empty" role="status"><LoaderCircle className="spin" />Загружаем данные…</div>}
    {isReports && <ReportsPanel />}
    {isTrash && (role === 'admin' ? <TrashPanel revision={revision} onChanged={refresh} /> : <p className="staff-empty">Корзина доступна только администратору.</p>)}
    {!userId && !isLog && !isReports && !isTrash && users && <>
      <section id="viewport-1-winner-main-stats" className="staff-stats" aria-label="Регистрации"><Stat label="Всего пользователей" value={users.stats.total} icon={<Users />} /><Stat label="Новые сегодня" value={users.stats.today} icon={<CalendarDays />} /><Stat label="За 7 дней" value={users.stats.week} icon={<CalendarDays />} /><Stat label="Ограниченные профили" value={users.stats.restricted} icon={<ShieldOff />} /></section>
      <section id="viewport-1-winner-main-filters" className="staff-filters"><label className="staff-search"><Search size={18} /><span className="visually-hidden">Поиск пользователей</span><input placeholder="Email, имя или @username" value={query} maxLength={200} onChange={event => setQuery(event.target.value.replace(/^@/, ''))} /></label><div className="staff-filter-tabs" aria-label="Фильтр пользователей">{filters.map(item => <button key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'active' : ''} onClick={() => { setFilter(item.key); setPage(0) }}>{item.label}</button>)}</div></section>
      <div className="staff-table-box"><div className="staff-table-scroll"><table id="viewport-1-winner-main-table" className="staff-table" aria-busy={loading}><thead><tr><th>Пользователь</th><th>Регистрация</th><th>Последний вход</th><th>Email</th><th>Роль</th><th>Публикация</th><th><span className="visually-hidden">Действие</span></th></tr></thead><tbody>{users.users.map(user => <tr key={user.id}><td><div className="staff-user"><span className="staff-avatar">{initials(user.display_name || user.handle || '?')}</span><div><strong>{user.display_name || user.handle || 'Профиль не заполнен'}</strong><span>{user.handle ? `@${user.handle}` : 'Без username'}</span><span>{user.email || 'Email не указан'}</span></div></div></td><td data-label="Регистрация">{date(user.created_at)}</td><td data-label="Последний вход">{date(user.last_sign_in_at)}</td><td data-label="Email"><span className={`staff-pill ${user.email_confirmed_at ? 'staff-pill--ok' : ''}`}>{user.email_confirmed_at ? 'Подтверждён' : 'Не подтверждён'}</span></td><td data-label="Роль"><span className="staff-pill">{roleLabels[user.role]}</span></td><td data-label="Публикация"><span className={`staff-pill ${user.restriction_reason ? 'staff-pill--warn' : ''}`}>{user.restriction_reason ? 'Ограничена' : user.is_published ? 'Опубликован' : 'Черновик'}</span></td><td><button className="button button--secondary button--small" aria-label={`Подробнее: ${user.handle || user.email || user.id}`} onClick={() => { setDetail(null); navigate(`/admin/users/${user.id}`) }}>Подробнее</button></td></tr>)}</tbody></table></div>{users.users.length === 0 && <div className="staff-empty">{search || filter !== 'all' ? 'Пользователи не найдены. Попробуйте другой поиск или фильтр.' : 'Пользователей пока нет.'}</div>}<Pagination page={page} total={users.total} onPage={setPage} disabled={loading} /><p className="staff-footnote">Даты по Москве · обновление каждые 30 секунд · новые — за последние 7 дней.</p></div>
    </>}
    {userId && !loading && !error && !detail?.user && <div className="staff-empty">Пользователь не найден.<Link to="/admin">Вернуться к списку</Link></div>}
    {userId && detail?.user?.id === userId && <UserDetails key={userId} detail={detail} role={role} onAction={openAction} onDelete={setDeleteTarget} />}
    {isLog && history && <div className="staff-table-box"><div className="staff-table-scroll"><table className="staff-table staff-history" aria-busy={loading}><thead><tr><th>Сотрудник</th><th>Объект</th><th>Действие</th><th>Время</th><th>Причина</th></tr></thead><tbody>{history.events.map(event => <tr key={event.id}><td data-label="Сотрудник">{event.actor_handle ? `@${event.actor_handle}` : 'Удалённый аккаунт'}</td><td data-label="Объект">{event.target_profile_id ? <Link to={`/admin/users/${event.target_profile_id}`}>@{event.target_handle}{event.target_link_label && <small>{event.target_link_label}</small>}</Link> : <span>{event.target_link_label || 'Удалённый объект'}<small>{event.target_id}</small></span>}</td><td data-label="Действие">{actionLabels[event.action] || event.action}</td><td data-label="Время">{date(event.created_at)}</td><td data-label="Причина">{event.reason}</td></tr>)}</tbody></table></div>{history.events.length === 0 && <div className="staff-empty">Действий на этой странице пока нет.</div>}<Pagination page={logPage} total={history.total} onPage={setLogPage} disabled={loading} /></div>}
  </main></div>{pending && <ConfirmAction pending={pending} onClose={() => setPending(null)} onSaved={changed} />}{createUserOpen && <CreateTemporaryUserDialog onClose={() => setCreateUserOpen(false)} onCreated={() => { setCreateUserOpen(false); setNotice('Созданы временные данные. Скопируйте и передайте их пользователю.'); refresh() }} />}{deleteTarget && <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => { if (deleteTarget.handle) void invalidatePublicProfile(deleteTarget.handle); setDeleteTarget(null); setDetail(null); navigate('/admin'); setNotice('Профиль перенесён в корзину. Его можно восстановить до окончания срока хранения.'); refresh() }} />}</div>
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <article className="staff-stat"><span className="staff-stat-icon">{icon}</span><div><p>{label}</p><strong>{number(value)}</strong></div></article>
}
function Pagination({ page, total, onPage, disabled }: { page: number; total: number; onPage: (page: number) => void; disabled: boolean }) {
  return <footer className="staff-pagination"><span>{total ? `${page * 25 + 1}–${Math.min((page + 1) * 25, total)} из ${number(total)}` : '0 записей'}</span><div><button className="button button--secondary button--small" disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>Назад</button><span>Страница {page + 1}</span><button className="button button--secondary button--small" disabled={disabled || (page + 1) * 25 >= total} onClick={() => onPage(page + 1)}>Далее</button></div></footer>
}

function UserDetails({ detail, role, onAction, onDelete }: { detail: StaffDetail; role: StaffRole; onAction: (target: string, action: StaffAction, label: string) => void; onDelete: (user: StaffUser) => void }) {
  const user = detail.user!
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const targetRole = selectedRole || user.role
  return <section className="staff-detail"><Link to="/admin" className="staff-muted-link">К списку пользователей</Link><div className="staff-detail-actions"><Link className="button button--secondary" to={`/admin/users/${user.id}/preview`}><Eye size={17} />Посмотреть профиль</Link>{role === 'admin' && user.role === 'user' && <Link className="button button--primary" to={`/admin/users/${user.id}/edit`}><Pencil size={17} />Открыть редактор пользователя</Link>}</div><div className="staff-detail-grid"><section className="staff-card"><div className="staff-user staff-user--large"><span className="staff-avatar">{initials(user.display_name || user.handle || '?')}</span><div><h2>{user.display_name || user.handle || 'Профиль не заполнен'}</h2><p>{user.email || 'Email не указан'}</p>{user.handle && <Link to={`/${user.handle}`} target="_blank" rel="noopener noreferrer">mylinks.bar/{user.handle}</Link>}</div></div><dl className="staff-user-facts"><div><dt>Регистрация</dt><dd>{date(user.created_at)}</dd></div><div><dt>Последний вход</dt><dd>{date(user.last_sign_in_at)}</dd></div><div><dt>Email</dt><dd>{user.email_confirmed_at ? 'Подтверждён' : 'Не подтверждён'}</dd></div><div><dt>Роль</dt><dd>{roleLabels[user.role]}</dd></div></dl><h3>О пользователе</h3><p className="staff-bio">{detail.profile?.bio || 'Описание не заполнено.'}</p></section><section className="staff-card staff-management"><h2>Управление профилем</h2><span className={`staff-pill ${user.restriction_reason ? 'staff-pill--warn' : ''}`}>{user.restriction_reason ? 'Публикация ограничена' : user.is_published ? 'Опубликован' : 'Черновик'}</span>{user.restriction_reason && <p className="staff-reason">{user.restriction_reason}</p>}<p>Ограничение скрывает профиль и все его ссылки от посетителей.</p><button className="button button--secondary" disabled={user.role !== 'user'} onClick={() => onAction(user.id, user.restriction_reason ? 'restore_profile' : 'restrict_profile', `@${user.handle || user.email || user.id}`)}>{user.restriction_reason ? 'Восстановить публикацию' : 'Ограничить публикацию'}</button>{user.role !== 'user' && <small>Для ограничения сначала снимите роль сотрудника.</small>}{role === 'admin' && <div className="staff-role-control"><label>Роль пользователя<select value={targetRole} onChange={event => setSelectedRole(event.target.value as UserRole)}>{(['user', 'moderator', 'admin'] as UserRole[]).map(value => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label><button className="button button--primary" disabled={targetRole === user.role || Boolean(user.restriction_reason)} onClick={() => onAction(user.id, targetRole, `@${user.handle || user.email || user.id}`)}>Изменить роль</button></div>}{role === 'admin' && user.role === 'user' && user.handle && <button className="button button--secondary" type="button" onClick={() => onDelete(user)}><Trash2 size={17} />Удалить пользователя</button>}</section></div><section className="staff-card staff-links"><h2>Ссылки пользователя ({detail.links.length})</h2>{detail.links.length === 0 && <p>Ссылки пока не добавлены.</p>}{detail.links.map(link => <article key={link.id}><div><strong>{link.label}</strong>{isValidHttpUrl(link.url) ? <a href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a> : <span>{link.url}</span>}<small>{link.restriction_reason ? `Ограничена: ${link.restriction_reason}` : link.is_visible ? 'Видна в опубликованном профиле' : 'Скрыта владельцем'}</small></div><button className="button button--secondary button--small" disabled={user.role !== 'user'} onClick={() => onAction(link.id, link.restriction_reason ? 'restore_link' : 'restrict_link', link.label)}>{link.restriction_reason ? 'Снять ограничение' : 'Ограничить ссылку'}</button></article>)}</section></section>
}

function ConfirmAction({ pending, onClose, onSaved }: { pending: PendingAction; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const container = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    container.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    return () => { document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await staffChange(pending.target, pending.action, reason.trim()); await onSaved() }
    catch (error) { setError(staffError(error)); setBusy(false) }
  }
  return <div className="staff-modal-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}><section className="staff-modal staff-card" ref={container} role="dialog" aria-modal="true" aria-labelledby="staff-confirm-title" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose()
    if (event.key === 'Tab') {
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea') || [])
      const first = elements[0]; const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}><button className="staff-modal-close icon-button" disabled={busy} onClick={onClose} aria-label="Закрыть"><X size={20} /></button><ShieldCheck className="staff-accent" size={30} /><h2 id="staff-confirm-title">{actionLabels[pending.action]}</h2><p>{pending.label}</p><form onSubmit={submit}><label>Причина<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} required placeholder="Причина будет сохранена в журнале действий" /></label>{error && <div className="staff-error" role="alert">{error}</div>}<div className="staff-modal-actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Отмена</button><button className="button button--primary" type="submit" disabled={busy || reason.trim().length < 3}>{busy ? <LoaderCircle size={18} className="spin" /> : 'Подтвердить'}</button></div></form></section></div>
}

