import { useEffect, useState, type FormEvent } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MonitorSmartphone,
  Palette,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { BrandMark } from './components/BrandMark'
import { ProfilePreview } from './components/ProfilePreview'
import { capabilitiesForTier, FREE_CAPABILITIES } from './config/capabilities'
import { supabase } from './lib/supabase'
import { isValidHandle, isValidHttpUrl, normalizeHandle, normalizeUrl } from './lib/validation'
import type { EditableLink, LinkIcon as LinkIconName, Profile, ProfileLink } from './types'

type AuthMode = 'login' | 'register'
type EditorSection = 'content' | 'design'

const emptyProfile = (id = ''): Profile => ({
  id,
  handle: 'username',
  display_name: 'Ваше имя',
  bio: '',
  avatar_url: null,
  background_preset: 'midnight',
  card_preset: 'glass',
  avatar_shape: 'round',
  avatar_size: 'medium',
  is_published: false,
  created_at: '',
  updated_at: '',
})

const sampleProfile: Profile = {
  ...emptyProfile('sample'),
  handle: 'mylinks',
  display_name: 'Mylinks Studio',
  bio: 'Дизайн, проекты и всё важное — в одной аккуратной ссылке.',
}

const sampleLinks: EditableLink[] = [
  { localId: 'sample-1', label: 'Instagram', url: 'https://instagram.com/mylinks.bar', icon_key: 'instagram', position: 0, is_visible: true },
  { localId: 'sample-2', label: 'Telegram', url: 'https://t.me', icon_key: 'telegram', position: 1, is_visible: true },
  { localId: 'sample-3', label: 'Мой сайт', url: 'https://mylinks.bar', icon_key: 'website', position: 2, is_visible: true },
]

const iconOptions: Array<{ value: LinkIconName; label: string }> = [
  { value: 'link', label: 'Ссылка' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'website', label: 'Сайт' },
  { value: 'email', label: 'Email' },
]

const toEditable = (link: ProfileLink): EditableLink => ({
  id: link.id,
  profile_id: link.profile_id,
  localId: link.id,
  label: link.label,
  url: link.url,
  icon_key: link.icon_key,
  position: link.position,
  is_visible: link.is_visible,
  created_at: link.created_at,
  updated_at: link.updated_at,
})

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route path="/p/:handle" element={<PrivateProfilePage session={session} />} />
      <Route path="/" element={session ? <Dashboard user={session.user} /> : <Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <BrandMark />
      <LoaderCircle className="spin" size={22} />
    </main>
  )
}

function Landing() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)

  return (
    <div className="landing-shell">
      <header className="landing-nav container">
        <BrandMark />
        <div className="landing-nav__actions">
          <button className="button button--ghost" onClick={() => setAuthMode('login')}>Войти</button>
          <button className="button button--primary" onClick={() => setAuthMode('register')}>Создать профиль</button>
        </div>
      </header>

      <main>
        <section className="hero container">
          <div className="hero__copy">
            <span className="eyebrow"><span /> Бесплатный приватный MVP</span>
            <h1>Одна ссылка.<br /><em>Вся ваша история.</em></h1>
            <p>Соберите соцсети, проекты и контакты в персональном профиле, которым удобно делиться.</p>
            <div className="hero__actions">
              <button className="button button--primary button--large" onClick={() => setAuthMode('register')}>
                Создать мастер‑ссылку <ArrowRight size={18} />
              </button>
              <button className="button button--text" onClick={() => setAuthMode('login')}>У меня уже есть профиль</button>
            </div>
            <div className="trust-row">
              <span><Check size={15} /> Бесплатно</span>
              <span><Check size={15} /> Без рекламы</span>
              <span><LockKeyhole size={14} /> Пока доступно только вам</span>
            </div>
          </div>
          <div className="hero__visual">
            <div className="preview-orbit preview-orbit--one" />
            <div className="preview-orbit preview-orbit--two" />
            <div className="hero__phone">
              <ProfilePreview profile={sampleProfile} links={sampleLinks} showPrivacy={false} />
            </div>
            <div className="floating-note floating-note--top"><Sparkles size={16} /> Живой предпросмотр</div>
            <div className="floating-note floating-note--bottom"><Palette size={16} /> 3 визуальных темы</div>
          </div>
        </section>

        <section className="value-strip">
          <div className="container value-strip__grid">
            <article><span>01</span><h2>Быстро собрать</h2><p>Добавляйте и упорядочивайте ссылки без лишних настроек.</p></article>
            <article><span>02</span><h2>Сделать своим</h2><p>Выберите фон, рамки и форму аватара — всё сразу видно справа.</p></article>
            <article><span>03</span><h2>Поделиться позже</h2><p>Профиль уже готов к мастер‑ссылке, но остаётся закрытым до вашего решения.</p></article>
          </div>
        </section>
      </main>

      <footer className="landing-footer container">
        <BrandMark />
        <p>Private preview · 2026</p>
      </footer>

      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} />}
    </div>
  )
}

function AuthDialog({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)

    try {
      if (mode === 'register') {
        const safeHandle = normalizeHandle(handle)
        if (!isValidHandle(safeHandle)) throw new Error('Имя ссылки: 3–30 латинских символов, цифр или дефисов.')
        if (password.length < 8) throw new Error('Пароль должен содержать не менее 8 символов.')

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { handle: safeHandle, display_name: displayName.trim() || safeHandle },
            emailRedirectTo: window.location.origin,
          },
        })
        if (signUpError) throw signUpError
        if (!data.session) setMessage('Проверьте почту и подтвердите адрес. После этого вернитесь и войдите.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => {
    setMode((current) => current === 'login' ? 'register' : 'login')
    setError('')
    setMessage('')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="dialog-close" onClick={onClose} aria-label="Закрыть"><X size={19} /></button>
        <BrandMark />
        <div className="auth-dialog__heading">
          <span className="eyebrow">{mode === 'register' ? 'Новый профиль' : 'С возвращением'}</span>
          <h2 id="auth-title">{mode === 'register' ? 'Создайте мастер‑ссылку' : 'Войдите в редактор'}</h2>
          <p>{mode === 'register' ? 'Первый профиль полностью бесплатный.' : 'Продолжите настраивать свой профиль.'}</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <>
              <label>Имя<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Михаил" autoComplete="name" /></label>
              <label>Адрес мастер‑ссылки<div className="input-prefix"><span>mylinks.bar/</span><input value={handle} onChange={(event) => setHandle(normalizeHandle(event.target.value))} placeholder="mikhail" autoCapitalize="none" /></div></label>
            </>
          )}
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Минимум 8 символов" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /></label>

          {error && <div className="form-message form-message--error">{error}</div>}
          {message && <div className="form-message form-message--success">{message}</div>}

          <button className="button button--primary button--full" type="submit" disabled={busy || Boolean(message)}>
            {busy ? <LoaderCircle className="spin" size={18} /> : mode === 'register' ? 'Создать профиль' : 'Войти'}
          </button>
        </form>
        <button className="auth-switch" onClick={switchMode}>
          {mode === 'register' ? 'Уже зарегистрированы? Войти' : 'Нет профиля? Создать бесплатно'}
        </button>
      </section>
    </div>
  )
}

function Dashboard({ user }: { user: User }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile>(emptyProfile(user.id))
  const [links, setLinks] = useState<EditableLink[]>([])
  const [originalLinkIds, setOriginalLinkIds] = useState<string[]>([])
  const [section, setSection] = useState<EditorSection>('content')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const capabilities = capabilitiesForTier('free')

  const loadData = async () => {
    setLoading(true)
    setError('')
    const [profileResult, linksResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profile_links').select('*').eq('profile_id', user.id).order('position'),
    ])

    if (profileResult.error) setError(profileResult.error.message)
    else setProfile(profileResult.data as Profile)

    if (linksResult.error) setError(linksResult.error.message)
    else {
      const nextLinks = (linksResult.data as ProfileLink[]).map(toEditable)
      setLinks(nextLinks)
      setOriginalLinkIds(nextLinks.flatMap((link) => link.id ? [link.id] : []))
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
    // The active user id is the stable key for this dashboard instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  const addLink = () => {
    if (links.length >= capabilities.maxLinks) return
    setLinks((current) => [...current, {
      localId: crypto.randomUUID(),
      label: '',
      url: '',
      icon_key: 'link',
      position: current.length,
      is_visible: true,
    }])
  }

  const updateLink = (localId: string, patch: Partial<EditableLink>) => {
    setLinks((current) => current.map((link) => link.localId === localId ? { ...link, ...patch } : link))
  }

  const removeLink = (localId: string) => {
    setLinks((current) => current.filter((link) => link.localId !== localId).map((link, index) => ({ ...link, position: index })))
  }

  const moveLink = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= links.length) return
    setLinks((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((link, position) => ({ ...link, position }))
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (!isValidHandle(profile.handle)) throw new Error('Адрес мастер‑ссылки должен содержать 3–30 латинских символов, цифр или дефисов.')
      const readyLinks = links.filter((link) => link.label.trim() || link.url.trim())
      const invalidLink = readyLinks.find((link) => !link.label.trim() || !isValidHttpUrl(link.url))
      if (invalidLink) throw new Error('У каждой добавленной ссылки должны быть название и корректный адрес.')

      const { error: profileError } = await supabase.from('profiles').update({
        handle: profile.handle,
        display_name: profile.display_name.trim(),
        bio: profile.bio.trim(),
        avatar_url: profile.avatar_url?.trim() || null,
        background_preset: profile.background_preset,
        card_preset: profile.card_preset,
        avatar_shape: profile.avatar_shape,
        avatar_size: profile.avatar_size,
      }).eq('id', user.id)
      if (profileError) throw profileError

      const keptIds = readyLinks.flatMap((link) => link.id ? [link.id] : [])
      const removedIds = originalLinkIds.filter((id) => !keptIds.includes(id))
      if (removedIds.length) {
        const { error: deleteError } = await supabase.from('profile_links').delete().in('id', removedIds)
        if (deleteError) throw deleteError
      }

      const existing = readyLinks.filter((link) => link.id).map((link, position) => ({
        id: link.id,
        profile_id: user.id,
        label: link.label.trim(),
        url: normalizeUrl(link.url),
        icon_key: link.icon_key,
        position,
        is_visible: link.is_visible,
      }))
      if (existing.length) {
        const { error: updateError } = await supabase.from('profile_links').upsert(existing)
        if (updateError) throw updateError
      }

      const fresh = readyLinks.filter((link) => !link.id).map((link, position) => ({
        profile_id: user.id,
        label: link.label.trim(),
        url: normalizeUrl(link.url),
        icon_key: link.icon_key,
        position: existing.length + position,
        is_visible: link.is_visible,
      }))
      if (fresh.length) {
        const { error: insertError } = await supabase.from('profile_links').insert(fresh)
        if (insertError) throw insertError
      }

      await loadData()
      setNotice('Изменения сохранены')
      window.setTimeout(() => setNotice(''), 2600)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить изменения.')
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <BrandMark />
        <div className="dashboard-topbar__meta">
          <span className="status-chip"><span /> Закрытая версия</span>
          <button className="button button--ghost button--small" onClick={() => navigate(`/p/${profile.handle}`)}><Eye size={16} /> Открыть страницу</button>
          <button className="button button--primary button--small" onClick={save} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Сохранить
          </button>
          <button className="icon-button" onClick={signOut} aria-label="Выйти"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="editor-nav">
          <div>
            <p className="editor-nav__label">Редактор</p>
            <button className={section === 'content' ? 'active' : ''} onClick={() => setSection('content')}><LayoutGrid size={18} /> Контент</button>
            <button className={section === 'design' ? 'active' : ''} onClick={() => setSection('design')}><Palette size={18} /> Оформление</button>
          </div>
          <div className="editor-nav__account">
            <div className="avatar avatar--small"><span>{profile.display_name.slice(0, 2).toUpperCase() || 'ML'}</span></div>
            <div><strong>{profile.display_name}</strong><span>{user.email}</span></div>
          </div>
        </aside>

        <main className="editor-panel">
          <div className="editor-panel__heading">
            <div><span className="eyebrow">{section === 'content' ? 'Структура профиля' : 'Визуальный стиль'}</span><h1>{section === 'content' ? 'Ваши ссылки' : 'Оформление'}</h1></div>
            <span className="autosave-hint">Сохраняется вручную</span>
          </div>

          {notice && <div className="toast toast--success"><Check size={16} /> {notice}</div>}
          {error && <div className="toast toast--error">{error}</div>}

          {section === 'content' ? (
            <ContentEditor profile={profile} setProfile={setProfile} links={links} addLink={addLink} updateLink={updateLink} removeLink={removeLink} moveLink={moveLink} />
          ) : (
            <DesignEditor profile={profile} setProfile={setProfile} />
          )}
        </main>

        <aside className="preview-panel">
          <div className="preview-panel__heading">
            <div><MonitorSmartphone size={17} /><span>Предпросмотр</span></div>
            <button className="button button--icon-text" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/p/${profile.handle}`)}><Copy size={14} /> Скопировать</button>
          </div>
          <div className="device-frame">
            <div className="device-frame__speaker" />
            <ProfilePreview profile={profile} links={links} />
          </div>
          <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Публичный доступ выключен</strong><span>Страница доступна только владельцу MVP.</span></div></div>
        </aside>
      </div>
    </div>
  )
}

interface ContentEditorProps {
  profile: Profile
  setProfile: (profile: Profile) => void
  links: EditableLink[]
  addLink: () => void
  updateLink: (localId: string, patch: Partial<EditableLink>) => void
  removeLink: (localId: string) => void
  moveLink: (index: number, direction: -1 | 1) => void
}

function ContentEditor({ profile, setProfile, links, addLink, updateLink, removeLink, moveLink }: ContentEditorProps) {
  return (
    <div className="editor-stack">
      <section className="settings-card">
        <div className="settings-card__title"><UserRound size={18} /><div><h2>Профиль</h2><p>Имя, описание и адрес вашей страницы.</p></div></div>
        <div className="field-grid">
          <label>Отображаемое имя<input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} maxLength={60} /></label>
          <label>Мастер‑ссылка<div className="input-prefix"><span>mylinks.bar/</span><input value={profile.handle} onChange={(event) => setProfile({ ...profile, handle: normalizeHandle(event.target.value) })} /></div></label>
          <label className="field-grid__full">О себе<textarea value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} maxLength={160} rows={3} placeholder="Чем вы занимаетесь?" /><small>{profile.bio.length}/160</small></label>
          <label className="field-grid__full">Ссылка на аватар<input type="url" value={profile.avatar_url ?? ''} onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })} placeholder="https://…" /></label>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__title settings-card__title--action">
          <div className="settings-card__title-copy"><Link2 size={18} /><div><h2>Ссылки</h2><p>{links.length} из {FREE_CAPABILITIES.maxLinks}</p></div></div>
          <button className="button button--secondary button--small" onClick={addLink} disabled={links.length >= FREE_CAPABILITIES.maxLinks}><Plus size={16} /> Добавить</button>
        </div>

        <div className="links-editor">
          {links.length === 0 && (
            <button className="empty-links" onClick={addLink}><span><Plus size={21} /></span><strong>Добавьте первую ссылку</strong><p>Instagram, Telegram, сайт или любой другой адрес.</p></button>
          )}
          {links.map((link, index) => (
            <article className="link-editor" key={link.localId}>
              <div className="link-editor__grip"><GripVertical size={18} /></div>
              <div className="link-editor__body">
                <div className="link-editor__row">
                  <select aria-label="Тип ссылки" value={link.icon_key} onChange={(event) => updateLink(link.localId, { icon_key: event.target.value as LinkIconName })}>
                    {iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input aria-label="Название ссылки" value={link.label} onChange={(event) => updateLink(link.localId, { label: event.target.value })} placeholder="Название" maxLength={80} />
                </div>
                <input aria-label="Адрес ссылки" value={link.url} onChange={(event) => updateLink(link.localId, { url: event.target.value })} placeholder="https://…" />
              </div>
              <div className="link-editor__actions">
                <button className="icon-button" onClick={() => updateLink(link.localId, { is_visible: !link.is_visible })} aria-label={link.is_visible ? 'Скрыть' : 'Показать'}>{link.is_visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
                <button className="icon-button" onClick={() => moveLink(index, -1)} disabled={index === 0} aria-label="Переместить выше"><ArrowUp size={16} /></button>
                <button className="icon-button" onClick={() => moveLink(index, 1)} disabled={index === links.length - 1} aria-label="Переместить ниже"><ArrowDown size={16} /></button>
                <button className="icon-button icon-button--danger" onClick={() => removeLink(link.localId)} aria-label="Удалить"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function DesignEditor({ profile, setProfile }: { profile: Profile; setProfile: (profile: Profile) => void }) {
  return (
    <div className="editor-stack">
      <section className="settings-card">
        <div className="settings-card__title"><Palette size={18} /><div><h2>Фон</h2><p>Выберите настроение профиля.</p></div></div>
        <div className="theme-picker">
          {([
            ['midnight', 'Полночь'],
            ['mist', 'Туман'],
            ['cobalt', 'Кобальт'],
          ] as const).map(([value, label]) => (
            <button className={`theme-option theme-option--${value} ${profile.background_preset === value ? 'selected' : ''}`} onClick={() => setProfile({ ...profile, background_preset: value })} key={value}>
              <span className="theme-option__swatch"><i /><i /></span><strong>{label}</strong>{profile.background_preset === value && <Check size={16} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__title"><LayoutGrid size={18} /><div><h2>Карточки ссылок</h2><p>Стиль рамок и подложки.</p></div></div>
        <div className="segmented-picker">
          {([
            ['glass', 'Стекло'],
            ['solid', 'Плотные'],
            ['outline', 'Контур'],
          ] as const).map(([value, label]) => <button className={profile.card_preset === value ? 'selected' : ''} onClick={() => setProfile({ ...profile, card_preset: value })} key={value}>{label}</button>)}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__title"><UserRound size={18} /><div><h2>Аватар</h2><p>Форма и размер фотографии.</p></div></div>
        <div className="design-row">
          <div><span className="field-caption">Форма</span><div className="segmented-picker segmented-picker--small"><button className={profile.avatar_shape === 'round' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'round' })}>Круг</button><button className={profile.avatar_shape === 'square' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_shape: 'square' })}>Квадрат</button></div></div>
          <div><span className="field-caption">Размер</span><div className="segmented-picker segmented-picker--small"><button className={profile.avatar_size === 'small' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_size: 'small' })}>S</button><button className={profile.avatar_size === 'medium' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_size: 'medium' })}>M</button><button className={profile.avatar_size === 'large' ? 'selected' : ''} onClick={() => setProfile({ ...profile, avatar_size: 'large' })}>L</button></div></div>
        </div>
      </section>

      <section className="future-card">
        <div><Sparkles size={19} /><span>Подготовлено к расширению</span></div>
        <p>Собственные фоны и расширенная аналитика смогут подключаться через capabilities без переделки редактора.</p>
      </section>
    </div>
  )
}

function PrivateProfilePage({ session }: { session: Session | null }) {
  const { handle = '' } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [links, setLinks] = useState<EditableLink[]>([])
  const [loading, setLoading] = useState(Boolean(session))

  useEffect(() => {
    if (!session) return

    const load = async () => {
      const { data: profileData } = await supabase.from('profiles').select('*').eq('handle', handle).eq('id', session.user.id).maybeSingle()
      if (!profileData) {
        setLoading(false)
        return
      }
      const typedProfile = profileData as Profile
      const { data: linksData } = await supabase.from('profile_links').select('*').eq('profile_id', typedProfile.id).order('position')
      setProfile(typedProfile)
      setLinks(((linksData ?? []) as ProfileLink[]).map(toEditable))
      setLoading(false)
    }

    void load()
  }, [handle, session])

  if (!session) {
    return (
      <main className="private-access-page">
        <BrandMark />
        <div className="private-access-card"><LockKeyhole size={28} /><h1>Страница пока закрыта</h1><p>Этот MVP доступен только владельцу. Публичный просмотр будет включён после отдельного подтверждения.</p><Link className="button button--primary" to="/">Вернуться на главную</Link></div>
      </main>
    )
  }

  if (loading) return <LoadingScreen />
  if (!profile) return <Navigate to="/" replace />

  return (
    <main className={`public-preview-page theme-${profile.background_preset}`}>
      <button className="back-button" onClick={() => navigate('/')}><ArrowLeft size={17} /> В редактор</button>
      <div className="public-preview-page__content"><ProfilePreview profile={profile} links={links} interactive /></div>
    </main>
  )
}

export default App
