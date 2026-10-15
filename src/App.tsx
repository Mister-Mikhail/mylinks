import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  BarChart3,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  MonitorSmartphone,
  Palette,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BrandMark } from './components/BrandMark'
import { OnboardingWizard } from './components/OnboardingWizard'
import { TemporaryAccountGate } from './components/TemporaryAccountGate'
import { DeleteAccount } from './components/DeleteAccount'
import { AvatarMedia } from './components/AvatarMedia'
import { AvatarEditor } from './components/AvatarEditor'
import { ProfilePreview } from './components/ProfilePreview'
import { TypographyControls } from './components/TypographyControls'
import { LinkIcon } from './components/LinkIcon'
import { ProfileTools } from './components/ProfileTools'
import { StatisticsPanel } from './components/StatisticsPanel'
import './components/extras.css'
import './components/admin.css'
import { capabilitiesForTier, FREE_CAPABILITIES } from './config/capabilities'
import {
  buildPlatformUrl,
  getLinkPlatform,
  inferLinkLabel,
  LINK_PLATFORMS,
  platformUsernameFromUrl,
} from './config/linkPlatforms'
import { supabase } from './lib/supabase'
import { copyText, profileUrl } from './lib/clipboard'
import { useStaffRole } from './lib/useStaffRole'
import { loadStaffProfile, saveStaffProfile, uploadStaffAvatar } from './lib/staff'
import { CONTACT_OPTIONS, contactPlaceholder, isValidContactValue } from './lib/contacts'
import { isKnownSensitiveUrl } from './lib/sensitiveLinks'
import { isValidDisplayName, isValidHandle, isValidNewHandle, isValidHttpUrl, normalizeDisplayNameInput, normalizeHandle, normalizeHandleInput, normalizeUrl } from './lib/validation'
import type { AvatarDraft, AvatarUploadOptions, ContactKind, EditableContact, EditableLink, LinkIcon as LinkIconName, Profile, ProfileContact, ProfileLink } from './types'

type AuthMode = 'login' | 'register'
const AdminPanel = lazy(() => import('./components/AdminPanel'))
type EditorSection = 'links' | 'design' | 'stats'

interface EditorSnapshot {
  userId: string
  profile: Profile
  links: EditableLink[]
  contacts: EditableContact[]
}

interface PreviewLocationState {
  profile: Profile
  links: EditableLink[]
  contacts: EditableContact[]
}

let editorSnapshot: EditorSnapshot | null = null
// React StrictMode and quick route remounts must not consume a one-use token twice.
let emailVerification: { token: string; promise: ReturnType<typeof supabase.auth.verifyOtp> } | null = null

const emptyProfile = (id = ''): Profile => ({
  id,
  handle: 'username',
  display_name: 'Ваше имя',
  bio: '',
  avatar_url: null,
  avatar_path: null,
  avatar_preview_url: null,
  background_preset: 'midnight',
  card_preset: 'glass',
  card_radius: 13,
  avatar_shape: 'round',
  avatar_size: 'medium',
  avatar_scale: 28,
  is_published: false,
  show_qr: true,
  qr_size: 176,
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
  { localId: 'sample-1', label: 'Instagram', url: 'https://instagram.com/mylinks.bar', icon_key: 'instagram', position: 0, is_visible: true, is_sensitive: false },
  { localId: 'sample-2', label: 'Telegram', url: 'https://t.me', icon_key: 'telegram', position: 1, is_visible: true, is_sensitive: false },
  { localId: 'sample-3', label: 'Мой сайт', url: 'https://mylinks.bar', icon_key: 'website', position: 2, is_visible: true, is_sensitive: false },
]

const toEditable = (link: ProfileLink): EditableLink => ({
  id: link.id,
  profile_id: link.profile_id,
  localId: link.id,
  label: link.label,
  label_font: link.label_font,
  label_font_size: link.label_font_size,
  url: link.url,
  icon_key: link.icon_key,
  position: link.position,
  is_visible: link.is_visible,
  is_sensitive: link.is_sensitive ?? false,
  created_at: link.created_at,
  updated_at: link.updated_at,
})

const toEditableContact = (contact: ProfileContact): EditableContact => ({
  id: contact.id,
  profile_id: contact.profile_id,
  localId: contact.id,
  kind: contact.kind,
  label: contact.label,
  value: contact.value,
  latitude: contact.latitude, longitude: contact.longitude,
  label_font: contact.label_font,
  label_font_size: contact.label_font_size,
  value_font: contact.value_font,
  value_font_size: contact.value_font_size,
  position: contact.position,
  is_visible: contact.is_visible,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
})

const withAvatarPreview = async (profile: Profile) => {
  const normalizedProfile = {
    ...profile,
    avatar_scale: Number(profile.avatar_scale) || ({ small: 12, medium: 28, large: 40 }[profile.avatar_size] ?? 28),
  }
  if (!profile.avatar_path) return { ...normalizedProfile, avatar_preview_url: null }
  const [avatar, poster] = await Promise.all([
    supabase.storage.from('avatars').createSignedUrl(profile.avatar_path, 60 * 60),
    profile.avatar_poster_path ? supabase.storage.from('avatars').createSignedUrl(profile.avatar_poster_path, 60 * 60) : Promise.resolve(null),
  ])
  return { ...normalizedProfile, avatar_preview_url: avatar.data?.signedUrl ?? null, avatar_poster_url: poster?.data?.signedUrl ?? null }
}

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
      <Route path="/auth/confirmed" element={<AuthConfirmation session={session} />} />
      <Route path="/admin/*" element={<Suspense fallback={<LoadingScreen />}><AdminPanel session={session} /></Suspense>} />
      <Route path="/admin/users/:targetId/edit" element={session ? <StaffProfileEditor user={session.user} /> : <Navigate to="/admin" replace />} />
      <Route path="/admin/users/:targetId/preview" element={session ? <StaffProfilePreview user={session.user} /> : <Navigate to="/admin" replace />} />
      <Route path="/p/:handle" element={<LegacyProfileRedirect />} />
      <Route path="/" element={session ? <Dashboard user={session.user} /> : <Landing />} />
      <Route path="/:handle" element={<ProfilePage session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function LegacyProfileRedirect() {
  const { handle = '' } = useParams()
  const location = useLocation()
  return <Navigate to={`/${handle}`} replace state={location.state} />
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <BrandMark />
      <LoaderCircle className="spin" size={22} />
    </main>
  )
}

function AuthConfirmation({ session }: { session: Session | null }) {
  const navigate = useNavigate()
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const search = new URLSearchParams(window.location.search)
  const errorCode = hash.get('error_code') ?? search.get('error_code')
  const [tokenHash] = useState(() => hash.get('token_hash') ?? search.get('token_hash'))
  const [confirmed, setConfirmed] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tokenHash) return
    let active = true
    setBusy(true)
    setError('')
    window.history.replaceState(null, '', '/auth/confirmed')
    if (emailVerification?.token !== tokenHash) {
      emailVerification = { token: tokenHash, promise: supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }) }
    }
    void emailVerification.promise.then(({ error: verifyError }) => {
      if (!active) return
      if (verifyError) setError('Ссылка уже использована или недействительна. Если почта уже подтверждена, войдите с email и паролем. Иначе запросите новое письмо.')
      else setConfirmed(true)
      setBusy(false)
    }).catch(() => { if (active) { setBusy(false); setError('Не удалось подтвердить почту. Проверьте соединение и откройте ссылку ещё раз.') } })
    return () => { active = false }
  }, [tokenHash])

  const isConfirmed = confirmed || Boolean(session?.user.email_confirmed_at && !tokenHash)
  useEffect(() => {
    if (!isConfirmed) return
    const timer = window.setTimeout(() => navigate('/', { replace: true }), 1200)
    return () => window.clearTimeout(timer)
  }, [isConfirmed, navigate])

  const resendConfirmation = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmed` },
    })

    if (resendError) setError(resendError.message)
    else setMessage('Если адрес ещё не подтверждён, проверьте входящие и папку «Спам» — письмо может прийти с задержкой. Если письмо не приходит, попробуйте войти: возможно, адрес уже подтверждён.')
    setBusy(false)
  }

  return (
    <main className="private-access-page">
      <BrandMark />
      <div className="private-access-card">
        {isConfirmed ? <Check size={28} /> : <Mail size={28} />}
        <h1>{isConfirmed ? 'Почта подтверждена' : busy && tokenHash ? 'Подтверждаем почту…' : errorCode === 'otp_expired' ? 'Ссылка уже недействительна' : 'Подтверждение почты'}</h1>
        <p>{isConfirmed ? 'Переходим в личный кабинет mylinks.bar…' : busy && tokenHash ? 'Это займёт несколько секунд.' : 'Если ссылка истекла, укажите адрес регистрации и запросите новое письмо.'}</p>
        {(!tokenHash || Boolean(error)) && !isConfirmed && (
          <form className="confirmation-resend" onSubmit={resendConfirmation}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
            <button className="button button--primary button--full" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <Mail size={17} />}
              {busy ? 'Отправляем…' : 'Отправить письмо ещё раз'}
            </button>
          </form>
        )}
        {error && <div className="form-message form-message--error">{error}</div>}
        {message && <div className="form-message form-message--success">{message}</div>}
        <Link className={`button ${isConfirmed ? 'button--primary' : 'button--ghost'}`} to="/">Перейти в mylinks.bar</Link>
      </div>
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
            <span className="eyebrow"><span /> Бесплатный MVP</span>
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
              <span><LockKeyhole size={14} /> Вы сами решаете, когда публиковать</span>
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
            <article><span>03</span><h2>Поделиться по готовности</h2><p>Сначала настройте страницу, затем откройте её друзьям одним переключателем.</p></article>
          </div>
        </section>
      </main>

      <footer className="landing-footer container">
        <BrandMark />
        <p>Free MVP · 2026</p>
      </footer>

      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} />}
    </div>
  )
}

function AuthDialog({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string } | null>(null)

  useEffect(() => {
    if (!pendingSignup) return
    let active = true, checking = false, nextCheck = 0
    const expires = Date.now() + 15 * 60 * 1000
    const check = async () => {
      if (!active || checking || document.visibilityState === 'hidden' || Date.now() < nextCheck || Date.now() > expires) return
      checking = true; nextCheck = Date.now() + 10000
      try {
        // Credentials stay only in this form's memory, never local/session storage.
        // This also covers confirmation in a different browser or on another device.
        const { error: signInError } = await supabase.auth.signInWithPassword(pendingSignup)
        if (active && signInError && signInError.code !== 'email_not_confirmed') {
          if (signInError.status === 429) nextCheck = Date.now() + 60000
          else if (signInError.code === 'invalid_credentials') {
            setPendingSignup(null); setMode('login'); setMessage('Почта могла быть подтверждена. Введите пароль и нажмите «Войти».')
          }
        }
      } catch {
        // A temporary connection failure must not interrupt the registration form.
      } finally { checking = false }
    }
    const interval = window.setInterval(() => void check(), 10000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [pendingSignup])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)

    try {
      if (mode === 'register') {
        if (password.length < 6) throw new Error('Пароль должен содержать не менее 6 символов.')

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { onboarding_version: 2 },
            emailRedirectTo: `${window.location.origin}/auth/confirmed`,
          },
        })
        if (signUpError) throw signUpError
        if (!data.session && data.user?.identities?.length === 0) {
          throw new Error('Этот email уже зарегистрирован. Переключитесь на вход и используйте прежний пароль.')
        }
        if (!data.session) {
          setPendingSignup({ email: email.trim(), password })
          setMessage('Откройте ссылку из письма. После подтверждения эта вкладка автоматически продолжит регистрацию.')
        }
      } else if (email.includes('@')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) throw signInError
      } else {
        const { data, error: loginError } = await supabase.functions.invoke('login-by-handle', { body: { handle: normalizeHandle(email), password } })
        if (loginError) throw loginError
        if (!data?.session) throw new Error('Неверный логин или пароль.')
        const { error: sessionError } = await supabase.auth.setSession(data.session)
        if (sessionError) throw sessionError
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить действие.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => {
    setPendingSignup(null)
    setMode((current) => current === 'login' ? 'register' : 'login')
    setError('')
    setMessage('')
    setShowPassword(false)
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="dialog-close" onClick={onClose} aria-label="Закрыть"><X size={19} /></button>
        <BrandMark />
        <div className="auth-dialog__heading">
          <span className="eyebrow">{mode === 'register' ? 'Новый профиль' : 'С возвращением'}</span>
          <h2 id="auth-title">{mode === 'register' ? 'Создайте страницу' : 'Войдите в редактор'}</h2>
          <p>{mode === 'register' ? 'Первый профиль полностью бесплатный.' : 'Продолжите настраивать свой профиль.'}</p>
        </div>

        <form onSubmit={submit} className="auth-form" autoComplete={mode === 'register' ? 'off' : 'on'} data-form-type={mode === 'register' ? 'other' : undefined}>
          <label>{mode === 'register' ? 'Email' : 'Email или имя пользователя'}<input type={mode === 'register' ? 'email' : 'text'} value={email} readOnly={Boolean(pendingSignup)} onChange={(event) => setEmail(event.target.value)} placeholder={mode === 'register' ? 'you@example.com' : 'Email или логин страницы'} autoCapitalize="none" autoCorrect="off" inputMode={mode === 'register' ? 'email' : 'text'} autoComplete={mode === 'register' ? 'email' : 'username'} required /></label>
          <label>Пароль<div className="password-field"><input type={showPassword ? 'text' : 'password'} name={mode === 'register' ? 'mylinks-registration-password' : 'password'} value={password} readOnly={Boolean(pendingSignup)} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Минимум 6 символов' : 'Ваш пароль'} minLength={mode === 'register' ? 6 : undefined} autoComplete={mode === 'register' ? 'off' : 'current-password'} data-form-type={mode === 'register' ? 'other' : undefined} data-lpignore={mode === 'register' ? 'true' : undefined} data-1p-ignore={mode === 'register' ? 'true' : undefined} data-bwignore={mode === 'register' ? 'true' : undefined} required /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>

          {error && <div className="form-message form-message--error">{error}</div>}
          {message && <div className="form-message form-message--success">{message}</div>}
          {mode === 'register' && message && <Link className="auth-switch" to="/auth/confirmed">Письмо не пришло? Запросить ещё раз</Link>}

          <button className="button button--primary button--full" type="submit" disabled={busy || Boolean(pendingSignup)}>
            {busy ? <LoaderCircle className="spin" size={18} /> : pendingSignup ? 'Ожидаем подтверждение почты…' : mode === 'register' ? 'Создать профиль' : 'Войти'}
          </button>
        </form>
        <button className="auth-switch" onClick={switchMode}>
          {mode === 'register' ? 'Уже зарегистрированы? Войти' : 'Нет профиля? Создать бесплатно'}
        </button>
      </section>
    </div>
  )
}

function StaffProfileEditor({ user }: { user: User }) {
  const { targetId = '' } = useParams()
  const access = useStaffRole(user.id)
  if (access.loading) return <LoadingScreen />
  if (access.role !== 'admin') return <Navigate to="/admin" replace />
  return <Dashboard key={targetId} user={user} targetId={targetId} />
}

function StaffProfilePreview({ user }: { user: User }) {
  const { targetId = '' } = useParams()
  const access = useStaffRole(user.id)
  const [data, setData] = useState<PreviewLocationState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!access.role) return
    let active = true
    void loadStaffProfile(targetId).then(result => { if (active) setData(result) }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Не удалось открыть профиль.') })
    return () => { active = false }
  }, [targetId, access.role])
  if (access.loading) return <LoadingScreen />
  if (!access.role) return <Navigate to="/admin" replace />
  return <main className="staff-profile-preview"><Link className="button button--secondary" to={`/admin/users/${targetId}`}>← К пользователю</Link>{access.role === 'admin' && <Link className="button button--secondary" to={`/admin/users/${targetId}/edit`}>Открыть редактор</Link>}
    {error ? <p role="alert">{error}</p> : data ? <ProfilePreview profile={data.profile} links={data.links} contacts={data.contacts} interactive={false} showPrivacy={!data.profile.is_published} /> : <LoadingScreen />}
  </main>
}

function Dashboard({ user, targetId }: { user: User; targetId?: string }) {
  const navigate = useNavigate()
  const ownerId = targetId || user.id
  const { role: staffRole } = useStaffRole(user.id)
  const cachedSnapshot = !targetId && editorSnapshot?.userId === user.id ? editorSnapshot : null
  const skipInitialLoad = useRef(Boolean(cachedSnapshot))
  const [profile, setProfile] = useState<Profile>(cachedSnapshot?.profile ?? emptyProfile(ownerId))
  const persistedHandle = useRef(cachedSnapshot?.profile.handle ?? '')
  const persistedPublished = useRef(cachedSnapshot?.profile.is_published ?? false)
  const [links, setLinks] = useState<EditableLink[]>(cachedSnapshot?.links ?? [])
  const [contacts, setContacts] = useState<EditableContact[]>(cachedSnapshot?.contacts ?? [])
  const [originalLinkIds, setOriginalLinkIds] = useState<string[]>(cachedSnapshot?.links.flatMap((link) => link.id ? [link.id] : []) ?? [])
  const [originalContactIds, setOriginalContactIds] = useState<string[]>(cachedSnapshot?.contacts.flatMap((contact) => contact.id ? [contact.id] : []) ?? [])
  const [section, setSection] = useState<EditorSection>('links')
  const [loading, setLoading] = useState(!cachedSnapshot)
  const [saving, setSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft | null>(null)
  const [notice, setNotice] = useState('')
  const [temporaryAccount, setTemporaryAccount] = useState<{ is_temporary: boolean; expired?: boolean; login_count?: number; remaining_logins?: number; desired_handle?: string; desired_name?: string } | null>(null)
  const [temporaryCheckPending, setTemporaryCheckPending] = useState(Boolean(cachedSnapshot))
  const [temporaryCheckError, setTemporaryCheckError] = useState(false)
  const [error, setError] = useState('')
  const [newLinkId, setNewLinkId] = useState<string | null>(null)
  const capabilities = capabilitiesForTier('free')

  const applyTemporaryResult = (data: unknown, failed: boolean) => {
    if (failed) {
      setTemporaryCheckError(true)
      setTemporaryAccount(null)
      return
    }
    const tempData = data as { is_temporary?: boolean; expired?: boolean; login_count?: number; remaining_logins?: number; desired_handle?: string; desired_name?: string } | null
    setTemporaryCheckError(false)
    setTemporaryAccount(tempData?.is_temporary ? { is_temporary: true, expired: tempData.expired, login_count: tempData.login_count, remaining_logins: tempData.remaining_logins, desired_handle: tempData.desired_handle, desired_name: tempData.desired_name } : null)
  }

  const loadData = async (jwtRetry = 0) => {
    setLoading(true)
    setTemporaryCheckPending(true)
    setError('')
    if (targetId) {
      try {
        const data = await loadStaffProfile(targetId)
        setProfile(data.profile); setLinks(data.links); setContacts(data.contacts)
        setOriginalLinkIds(data.links.flatMap(link => link.id ? [link.id] : []))
        setOriginalContactIds(data.contacts.flatMap(contact => contact.id ? [contact.id] : []))
        persistedHandle.current = data.profile.handle; persistedPublished.current = data.profile.is_published
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось загрузить профиль.') }
      setLoading(false); setTemporaryCheckPending(false)
      return null
    }
    const [profileResult, linksResult, contactsResult, temporaryResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('profile_links').select('*').eq('profile_id', user.id).order('position'),
      supabase.from('profile_contacts').select('*').eq('profile_id', user.id).order('position'),
      supabase.rpc('temporary_account_session'),
    ])

    applyTemporaryResult(temporaryResult.data, Boolean(temporaryResult.error))
    const queryErrors = [profileResult.error, linksResult.error, contactsResult.error].filter(Boolean)
    const jwtTimingError = queryErrors.some((queryError) => queryError?.message.toLowerCase().includes('jwt issued at future'))
    if (jwtTimingError && jwtRetry < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500 * (jwtRetry + 1)))
      await supabase.auth.refreshSession()
      return loadData(jwtRetry + 1)
    }

    if (queryErrors.length) {
      setError(jwtTimingError
        ? 'Время авторизации ещё синхронизируется. Проверьте автоматическую дату и время на устройстве и войдите снова.'
        : queryErrors[0]?.message ?? 'Не удалось загрузить данные профиля.')
    }

    const nextProfile = !profileResult.error ? await withAvatarPreview(profileResult.data as Profile) : null
    const nextLinks = !linksResult.error ? (linksResult.data as ProfileLink[]).map(toEditable) : null
    const nextContacts = !contactsResult.error ? (contactsResult.data as ProfileContact[]).map(toEditableContact) : null

    if (nextProfile) { setProfile(nextProfile); persistedHandle.current = nextProfile.handle; persistedPublished.current = nextProfile.is_published }

    if (nextLinks) {
      setLinks(nextLinks)
      setOriginalLinkIds(nextLinks.flatMap((link) => link.id ? [link.id] : []))
    }

    if (nextContacts) {
      setContacts(nextContacts)
      setOriginalContactIds(nextContacts.flatMap((contact) => contact.id ? [contact.id] : []))
    }
    if (nextProfile && nextLinks && nextContacts) {
      editorSnapshot = { userId: user.id, profile: nextProfile, links: nextLinks, contacts: nextContacts }
    }
    setLoading(false)
    setTemporaryCheckPending(false)
    return nextProfile && nextLinks && nextContacts ? { profile: nextProfile, links: nextLinks, contacts: nextContacts } : null
  }

  useEffect(() => {
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false
      // A cached editor snapshot must not skip temporary-account login accounting.
      void supabase.rpc('temporary_account_session').then(({ data, error: tempError }) => {
        applyTemporaryResult(data, Boolean(tempError))
        setTemporaryCheckPending(false)
      })
      return
    }
    void loadData()
    // The active user id is the stable key for this dashboard instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, targetId])

  // New links go to the top of the list and are scrolled into view right away.
  const addLink = () => {
    if (links.length >= capabilities.maxLinks) return
    const localId = crypto.randomUUID()
    setLinks((current) => [{
      localId,
      label: '',
      url: '',
      icon_key: 'link',
      position: 0,
      is_visible: true,
      is_sensitive: false,
    }, ...current.map((link, index) => ({ ...link, position: index + 1 }))])
    setNewLinkId(localId)
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

  const addContact = () => {
    setContacts((current) => [...current, {
      localId: crypto.randomUUID(),
      kind: 'phone',
      label: '',
      value: '',
      position: current.length,
      is_visible: true,
    }])
  }

  const updateContact = (localId: string, patch: Partial<EditableContact>) => {
    setContacts((current) => current.map((contact) => contact.localId === localId ? { ...contact, ...patch } : contact))
  }

  const removeContact = (localId: string) => {
    setContacts((current) => current.filter((contact) => contact.localId !== localId).map((contact, index) => ({ ...contact, position: index })))
  }

  const moveContact = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= contacts.length) return
    setContacts((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((contact, position) => ({ ...contact, position }))
    })
  }

  const uploadAvatar = async (blob: Blob, options?: AvatarUploadOptions) => {
    setAvatarUploading(true); setError(''); setNotice('')
    if (targetId) {
      try {
        const patch = await uploadStaffAvatar(targetId, blob, options)
        setProfile(current => ({ ...current, ...patch }))
        setNotice('Аватар обновлён')
        return true
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить аватар.')
        return false
      } finally { setAvatarUploading(false) }
    }
    const uploadedPaths: string[] = []
    let committed = false
    try {
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }
      if (!extensions[blob.type] || blob.size > 5 * 1024 * 1024) throw new Error('Допустимы фото, GIF и MP4/WebM до 5 МБ.')
      const nextPath = `${user.id}/avatar-${crypto.randomUUID()}.${extensions[blob.type]}`
      const upload = async (path: string, file: Blob) => {
        const { error } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
        if (error) throw error
        uploadedPaths.push(path)
      }
      await upload(nextPath, blob)
      const masterPath = options?.master ? `${user.id}/master-${crypto.randomUUID()}.${extensions[options.master.type]}` : null
      if (masterPath && options?.master) await upload(masterPath, options.master)
      const posterPath = options?.poster ? `${user.id}/poster-${crypto.randomUUID()}.${extensions[options.poster.type]}` : null
      if (posterPath && options?.poster) await upload(posterPath, options.poster)
      const patch = { avatar_path: nextPath, avatar_master_path: masterPath, avatar_url: null, avatar_media: options?.kind ?? 'image', avatar_crop: options?.crop ?? null, avatar_poster_path: posterPath }
      const { error: profileError } = await supabase.from('profiles').update(patch).eq('id', user.id)
      if (profileError) throw profileError
      committed = true
      const [signed, posterSigned] = await Promise.all([
        supabase.storage.from('avatars').createSignedUrl(nextPath, 60 * 60),
        posterPath ? supabase.storage.from('avatars').createSignedUrl(posterPath, 60 * 60) : Promise.resolve(null),
      ])
      setProfile(current => ({ ...current, ...patch, avatar_preview_url: signed.data?.signedUrl ?? null, avatar_poster_url: posterSigned?.data?.signedUrl ?? null }))
      const previousPaths = [profile.avatar_path, profile.avatar_master_path, profile.avatar_poster_path].filter((path): path is string => Boolean(path && path !== nextPath && path !== masterPath && path !== posterPath))
      if (previousPaths.length) await supabase.storage.from('avatars').remove(previousPaths)
      setNotice('Аватар обновлён'); window.setTimeout(() => setNotice(''), 2600)
      return true
    } catch (caught) {
      if (!committed && uploadedPaths.length) await supabase.storage.from('avatars').remove(uploadedPaths)
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить аватар.')
      return false
    } finally { setAvatarUploading(false) }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      if (!isValidDisplayName(profile.display_name.trim())) throw new Error('Имя должно содержать только буквы и пробелы (до 30 символов).')
      if (!isValidHandle(profile.handle) || (profile.handle !== persistedHandle.current && !isValidNewHandle(profile.handle))) throw new Error('User name: 3–30 латинских букв и не более одной точки или подчёркивания между словами.')
      const readyLinks = links
        .filter((link) => link.label.trim() || link.url.trim())
        .map((link) => ({ ...link, label: link.label.trim() || inferLinkLabel(link.url) }))
      const invalidLink = readyLinks.find((link) => !link.url.trim() || !isValidHttpUrl(link.url))
      if (invalidLink) throw new Error('Проверьте адрес ссылки. Можно вводить без https:// — мы добавим его сами.')
      const readyContacts = contacts.filter((contact) => contact.label.trim() || contact.value.trim())
      const invalidContact = readyContacts.find((contact) => !isValidContactValue(contact.kind, contact.value))
      if (invalidContact) throw new Error('Проверьте адрес, телефон или email в разделе контактов.')
      if (targetId) {
        await saveStaffProfile(targetId, { ...profile, display_name: profile.display_name.trim(), bio: profile.bio.trim() }, readyLinks.map(link => ({ ...link, url: normalizeUrl(link.url) })), readyContacts)
        await loadData()
        setNotice('Изменения пользователя сохранены в журнале')
        return
      }

      const { error: profileError } = await supabase.from('profiles').update({
        handle: profile.handle,
        display_name: profile.display_name.trim(),
        bio: profile.bio.trim(),
        name_font: profile.name_font ?? 'manrope',
        name_font_size: profile.name_font_size ?? 21,
        bio_font: profile.bio_font ?? 'manrope',
        bio_font_size: profile.bio_font_size ?? 10,
        handle_font: profile.handle_font ?? 'manrope',
        handle_font_size: profile.handle_font_size ?? 10,
        avatar_url: profile.avatar_url?.trim() || null,
        avatar_path: profile.avatar_path,
        background_preset: profile.background_preset,
        card_preset: profile.card_preset,
        card_radius: profile.card_radius ?? 13,
        avatar_shape: profile.avatar_shape,
        avatar_size: profile.avatar_size,
        avatar_scale: profile.avatar_scale,
        is_published: profile.is_published,
        show_qr: Boolean(profile.show_qr),
        qr_size: profile.qr_size ?? 176,
      }).eq('id', user.id)
      if (profileError) throw profileError

      const keptIds = readyLinks.flatMap((link) => link.id ? [link.id] : [])
      const removedIds = originalLinkIds.filter((id) => !keptIds.includes(id))
      if (removedIds.length) {
        const { error: deleteError } = await supabase.from('profile_links').delete().in('id', removedIds)
        if (deleteError) throw deleteError
      }

      const positionedLinks = readyLinks.map((link, position) => ({ link, position }))
      const existing = positionedLinks.filter(({ link }) => link.id).map(({ link, position }) => ({
        id: link.id,
        profile_id: user.id,
        label: link.label.trim(),
        label_font: link.label_font ?? 'manrope',
        label_font_size: link.label_font_size ?? 11,
        url: normalizeUrl(link.url),
        icon_key: link.icon_key,
        position,
        is_visible: link.is_visible,
        is_sensitive: link.is_sensitive,
      }))
      if (existing.length) {
        const { error: updateError } = await supabase.from('profile_links').upsert(existing)
        if (updateError) throw updateError
      }

      const fresh = positionedLinks.filter(({ link }) => !link.id).map(({ link, position }) => ({
        profile_id: user.id,
        label: link.label.trim(),
        label_font: link.label_font ?? 'manrope',
        label_font_size: link.label_font_size ?? 11,
        url: normalizeUrl(link.url),
        icon_key: link.icon_key,
        position,
        is_visible: link.is_visible,
        is_sensitive: link.is_sensitive,
      }))
      if (fresh.length) {
        const { error: insertError } = await supabase.from('profile_links').insert(fresh)
        if (insertError) throw insertError
      }

      const keptContactIds = readyContacts.flatMap((contact) => contact.id ? [contact.id] : [])
      const removedContactIds = originalContactIds.filter((id) => !keptContactIds.includes(id))
      if (removedContactIds.length) {
        const { error: deleteContactError } = await supabase.from('profile_contacts').delete().in('id', removedContactIds)
        if (deleteContactError) throw deleteContactError
      }

      const positionedContacts = readyContacts.map((contact, position) => ({ contact, position }))
      const existingContacts = positionedContacts.filter(({ contact }) => contact.id).map(({ contact, position }) => ({
        id: contact.id,
        profile_id: user.id,
        kind: contact.kind,
        label: contact.label.trim(),
        value: contact.value.trim(),
        latitude: contact.kind === 'address' ? contact.latitude ?? null : null,
        longitude: contact.kind === 'address' ? contact.longitude ?? null : null,
        label_font: contact.label_font ?? 'manrope',
        label_font_size: contact.label_font_size ?? 10,
        value_font: contact.value_font ?? 'manrope',
        value_font_size: contact.value_font_size ?? 9,
        position,
        is_visible: contact.is_visible,
      }))
      if (existingContacts.length) {
        const { error: updateContactError } = await supabase.from('profile_contacts').upsert(existingContacts)
        if (updateContactError) throw updateContactError
      }

      const freshContacts = positionedContacts.filter(({ contact }) => !contact.id).map(({ contact, position }) => ({
        profile_id: user.id,
        kind: contact.kind,
        label: contact.label.trim(),
        value: contact.value.trim(),
        latitude: contact.kind === 'address' ? contact.latitude ?? null : null,
        longitude: contact.kind === 'address' ? contact.longitude ?? null : null,
        label_font: contact.label_font ?? 'manrope',
        label_font_size: contact.label_font_size ?? 10,
        value_font: contact.value_font ?? 'manrope',
        value_font_size: contact.value_font_size ?? 9,
        position,
        is_visible: contact.is_visible,
      }))
      if (freshContacts.length) {
        const { error: insertContactError } = await supabase.from('profile_contacts').insert(freshContacts)
        if (insertContactError) throw insertContactError
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
    editorSnapshot = null
    await supabase.auth.signOut()
  }

  const openProfilePreview = () => {
    if (targetId) { navigate(`/admin/users/${targetId}/preview`); return }
    const state: PreviewLocationState = { profile, links, contacts }
    editorSnapshot = { userId: user.id, ...state }
    navigate(`/${profile.handle}`, { state })
  }

  if (loading || temporaryCheckPending) return <LoadingScreen />
  if (temporaryCheckError) return (
    <main className="private-access-page">
      <BrandMark />
      <div className="private-access-card">
        <ShieldAlert size={28} />
        <h1>Не удалось проверить доступ</h1>
        <p>Повторите проверку, чтобы открыть редактор.</p>
        <button className="button button--primary" onClick={() => void loadData()}>Повторить</button>
        <button className="button button--ghost" onClick={() => void signOut()}>Выйти</button>
      </div>
    </main>
  )
  if (!targetId && temporaryAccount) return <TemporaryAccountGate account={temporaryAccount} onClaimed={() => { setTemporaryAccount(null); void loadData() }} />
  if (!targetId && profile.onboarding_completed === false) return <OnboardingWizard onDeleted={async () => { editorSnapshot = null; await supabase.auth.signOut({ scope: 'local' }); navigate('/') }} userId={user.id} profile={profile} setProfile={setProfile} avatarUploading={avatarUploading} onAvatarUpload={uploadAvatar} avatarDraft={avatarDraft} onAvatarDraft={setAvatarDraft} uploadError={error} onFinish={async () => { const saved = await loadData(); if (saved) { if (saved.profile.is_published) { try { sessionStorage.setItem(`mylinks:welcome:${user.id}`, 'show') } catch { /* restricted storage */ } } navigate(`/${saved.profile.handle}`, { state: saved }) } }} />

  return (
    <div className={`dashboard-shell ${section === 'design' ? 'dashboard-shell--design' : section === 'links' ? 'dashboard-shell--links' : ''} ${avatarDraft ? 'dashboard-shell--cropping' : ''}`}>
      <header className="dashboard-topbar">
        <BrandMark />
        {targetId && <Link className="button button--secondary button--small" to={`/admin/users/${targetId}`}>← Карточка пользователя</Link>}
        {section === 'design' && <span className="appearance-topbar-title">Оформление</span>}
        <div className="dashboard-topbar__meta">
          <span className={`status-chip ${profile.is_published ? 'status-chip--published' : ''}`}><span /> {profile.is_published ? 'Опубликован' : 'Черновик'}</span>
          <button className="button button--ghost button--small dashboard-action" onClick={openProfilePreview} disabled={avatarUploading || Boolean(avatarDraft)} aria-label="Открыть страницу"><Eye size={16} /> <span className="button__label">Открыть страницу</span></button>
          <button className="button button--primary button--small" onClick={save} aria-label="Сохранить" disabled={saving || avatarUploading || Boolean(avatarDraft)} title={avatarDraft ? 'Сначала примените фото или отмените кадрирование' : undefined}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} <span className="button__label">Сохранить</span>
          </button>
          {!targetId && <button className="icon-button" onClick={signOut} aria-label="Выйти"><LogOut size={18} /></button>}
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="editor-nav">
          <div>
            <p className="editor-nav__label">Редактор</p>
            <button className={section === 'links' ? 'active' : ''} onClick={() => setSection('links')} disabled={avatarUploading || Boolean(avatarDraft)}><Link2 size={18} /> <span>Ссылки</span></button>
            <button className={section === 'design' ? 'active' : ''} onClick={() => setSection('design')}><Palette size={18} /> <span>Оформление</span></button>
            {!targetId && <button className={section === 'stats' ? 'active' : ''} onClick={() => setSection('stats')} disabled={avatarUploading || Boolean(avatarDraft)}><BarChart3 size={18} /><span>Статистика</span></button>}
            {staffRole && <Link className="editor-nav__staff-link" to="/admin"><ShieldCheck size={18} /><span className="editor-nav__staff-full">{staffRole === 'admin' ? 'Администрирование' : 'Модерация'}</span><span className="editor-nav__staff-short">{staffRole === 'admin' ? 'Админ' : 'Модератор'}</span></Link>}
          </div>
          <div className="editor-nav__account">
            <div className="avatar avatar--small">
              <AvatarMedia profile={profile} />
            </div>
            <div><strong>{profile.display_name}</strong><span>{user.email}</span></div>
          </div>
        </aside>

        <main className="editor-panel">
          <div className="editor-panel__heading">
            <div><span className="eyebrow">{section === 'links' ? 'Структура профиля' : section === 'stats' ? 'Посещаемость профиля' : 'Визуальный стиль'}</span><h1>{section === 'links' ? 'Ссылки и контакты' : section === 'stats' ? 'Статистика' : 'Оформление'}</h1></div>
            <span className="autosave-hint">{section === 'stats' ? 'Только для владельца' : 'Сохраняется вручную'}</span>
          </div>

          {!targetId && <ProfileTools userId={user.id} handle={persistedHandle.current || profile.handle} published={persistedPublished.current} />}
          {!targetId && !staffRole && <DeleteAccount onDeleted={async () => { editorSnapshot = null; await supabase.auth.signOut({ scope: 'local' }); navigate('/') }} />}
          {notice && <div className="toast toast--success"><Check size={16} /> {notice}</div>}
          {error && <div className="toast toast--error">{error}</div>}

          {section === 'links' ? (
            <ContentEditor
              profile={profile}
              setProfile={setProfile}
              links={links}
              contacts={contacts}
              addLink={addLink}
              updateLink={updateLink}
              removeLink={removeLink}
              moveLink={moveLink}
              addContact={addContact}
              updateContact={updateContact}
              removeContact={removeContact}
              moveContact={moveContact}
              newLinkId={newLinkId}
            />
          ) : section === 'stats' ? (
            <StatisticsPanel profileId={user.id} />
          ) : (
            <DesignEditor profile={profile} setProfile={setProfile} avatarUploading={avatarUploading} onAvatarUpload={uploadAvatar} onAvatarDraft={setAvatarDraft} />
          )}
        </main>

        <aside className="preview-panel">
          <div className="preview-panel__heading">
            <div><MonitorSmartphone size={17} /><span>Предпросмотр</span></div>
            <button className="button button--icon-text" onClick={() => void copyText(profileUrl(profile.handle))}><Copy size={14} /> Скопировать</button>
          </div>
          <div className="device-frame">
            <div className="device-frame__speaker" />
            <ProfilePreview profile={profile} links={links} contacts={contacts} showPrivacy={!profile.is_published} avatarDraft={avatarDraft} />
          </div>
          <div className="privacy-note"><ShieldCheck size={17} /><div><strong>{profile.is_published ? 'Профиль опубликован' : 'Профиль пока закрыт'}</strong><span>{profile.is_published ? `Страница mylinks.bar/${profile.handle} доступна всем по ссылке.` : 'Данные страницы доступны только владельцу, пока вы не включите публикацию.'}</span></div></div>
        </aside>
      </div>
    </div>
  )
}

interface ContentEditorProps {
  profile: Profile
  setProfile: (profile: Profile) => void
  links: EditableLink[]
  contacts: EditableContact[]
  addLink: () => void
  updateLink: (localId: string, patch: Partial<EditableLink>) => void
  removeLink: (localId: string) => void
  moveLink: (index: number, direction: -1 | 1) => void
  addContact: () => void
  updateContact: (localId: string, patch: Partial<EditableContact>) => void
  removeContact: (localId: string) => void
  moveContact: (index: number, direction: -1 | 1) => void
  newLinkId?: string | null
}

function ContentEditor({
  profile,
  setProfile,
  links,
  contacts,
  addLink,
  updateLink,
  removeLink,
  moveLink,
  addContact,
  updateContact,
  removeContact,
  moveContact,
  newLinkId = null,
}: ContentEditorProps) {
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [masterLinkCopied, setMasterLinkCopied] = useState(false)

  const copyMasterLink = async () => {
    if (!profile.handle) return
    if (await copyText(profileUrl(profile.handle))) {
      setMasterLinkCopied(true)
      window.setTimeout(() => setMasterLinkCopied(false), 1800)
    }
  }

  useEffect(() => {
    if (!newLinkId) return
    const card = document.querySelector<HTMLElement>(`[data-link-id="${newLinkId}"]`)
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.querySelector<HTMLInputElement>('input[aria-label="Адрес ссылки"]')?.focus({ preventScroll: true })
  }, [newLinkId])

  const changePlatform = (link: EditableLink, nextValue: LinkIconName) => {
    const currentPlatform = getLinkPlatform(link.icon_key)
    const nextPlatform = getLinkPlatform(nextValue)
    const currentUsername = currentPlatform.baseUrl
      ? platformUsernameFromUrl(currentPlatform, link.url)
      : platformUsernameFromUrl(nextPlatform, link.url)
    const labelWasAutomatic = !link.label.trim() || link.label === currentPlatform.label

    updateLink(link.localId, {
      icon_key: nextValue,
      url: nextPlatform.baseUrl ? buildPlatformUrl(nextPlatform, currentUsername) : link.url,
      label: labelWasAutomatic ? (nextValue === 'link' ? '' : nextPlatform.label) : link.label,
    })
  }

  return (
    <div className="editor-stack">
      <section className="settings-card">
        <div className="settings-card__title"><UserRound size={18} /><div><h2>Профиль</h2><p>Имя, описание и адрес вашей страницы.</p></div></div>
        <div className="field-grid">
          <div className="profile-text-field"><label>Отображаемое имя<input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: normalizeDisplayNameInput(event.target.value) })} maxLength={30} /></label><TypographyControls label="Имя" slot="name" font={profile.name_font} size={profile.name_font_size} onChange={(font, size) => setProfile({ ...profile, name_font: font, name_font_size: size })} /></div>
          <div className="profile-text-field"><label>Мастер‑ссылка<div className="input-prefix"><span>mylinks.bar/</span><input value={profile.handle} onChange={(event) => setProfile({ ...profile, handle: normalizeHandleInput(event.target.value) })} /><button type="button" className={`input-prefix__copy ${masterLinkCopied ? 'input-prefix__copy--done' : ''}`} onClick={(event) => { event.preventDefault(); void copyMasterLink() }} disabled={!profile.handle} aria-label={masterLinkCopied ? 'Мастер‑ссылка скопирована' : 'Скопировать мастер‑ссылку'} title="Скопировать ссылку">{masterLinkCopied ? <Check size={15} /> : <Copy size={15} />}</button></div></label><TypographyControls label="Мастер-ссылка" slot="handle" font={profile.handle_font} size={profile.handle_font_size} onChange={(font, size) => setProfile({ ...profile, handle_font: font, handle_font_size: size })} /></div>
          <div className="field-grid__full profile-text-field"><label>О себе<textarea aria-label="О себе" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} maxLength={160} rows={3} placeholder="Чем вы занимаетесь?" /><small>{profile.bio.length}/160</small></label><TypographyControls label="О себе" slot="bio" font={profile.bio_font} size={profile.bio_font_size} onChange={(font, size) => setProfile({ ...profile, bio_font: font, bio_font_size: size })} /></div>
        </div>
        <label className="publish-setting">
          <input type="checkbox" checked={profile.is_published} onChange={(event) => setProfile({ ...profile, is_published: event.target.checked })} />
          <span className="publish-setting__switch"><i /></span>
          <span><strong>Публичная страница</strong><small>{profile.is_published ? `Сейчас mylinks.bar/${profile.handle} доступна всем по ссылке.` : 'Включите, когда захотите поделиться профилем.'}</small></span>
        </label>
        <label className="publish-setting">
          <input type="checkbox" checked={Boolean(profile.show_qr)} onChange={(event) => setProfile({ ...profile, show_qr: event.target.checked })} />
          <span className="publish-setting__switch"><i /></span>
          <span><strong>QR-код на странице</strong><small>Показывать QR-код внизу опубликованного профиля. Нажатие на код откроет действия.</small></span>
        </label>
        {profile.show_qr && <label className="avatar-size-control">
          <span><span className="field-caption">Размер QR-кода на странице</span><strong>{profile.qr_size ?? 176} px</strong></span>
          <input aria-label="Размер QR-кода на странице" type="range" min="80" max="220" step="4" value={Math.min(220, Math.max(80, profile.qr_size ?? 176))} onChange={(event) => setProfile({ ...profile, qr_size: Number(event.target.value) })} />
          <small><span>Компактный</span><span>Крупный</span></small>
        </label>}
      </section>

      <section className="settings-card">
        <div className="settings-card__title settings-card__title--action">
          <div className="settings-card__title-copy"><Link2 size={18} /><div><h2>Ссылки</h2><p>{links.length} из {FREE_CAPABILITIES.maxLinks}</p></div></div>
          <div className="settings-card__actions">
            <button className="button button--secondary button--small" onClick={addLink} disabled={links.length >= FREE_CAPABILITIES.maxLinks}><Plus size={16} /> Добавить</button>
          </div>
        </div>
        {links.length > 1 && <p className="reorder-hint">Отметьте карточку галочкой и перемещайте её двумя стрелками.</p>}

        <div className="links-editor">
          {links.length === 0 && (
            <button className="empty-links" onClick={addLink}><span><Plus size={21} /></span><strong>Добавьте первую ссылку</strong><p>Instagram, Telegram, сайт или любой другой адрес.</p></button>
          )}
          {links.map((link, index) => (
            <article className={`link-editor ${selectedLinkId === link.localId ? 'link-editor--selected' : ''} ${newLinkId === link.localId ? 'link-editor--new' : ''}`} key={link.localId} data-link-id={link.localId}>
              <div className="link-editor__move" aria-label="Перемещение ссылки">
                <button className="icon-button" type="button" onClick={() => moveLink(index, -1)} disabled={selectedLinkId !== link.localId || index === 0} aria-label="Переместить ссылку выше"><ArrowUp size={16} /></button>
              <button
                className={`selection-check ${selectedLinkId === link.localId ? 'selection-check--selected' : ''}`}
                type="button"
                aria-pressed={selectedLinkId === link.localId}
                aria-label={selectedLinkId === link.localId ? 'Снять выбор ссылки' : 'Выбрать ссылку для перемещения'}
                onClick={() => setSelectedLinkId((current) => current === link.localId ? null : link.localId)}
              >{selectedLinkId === link.localId && <Check size={15} />}</button>
                <button className="icon-button" type="button" onClick={() => moveLink(index, 1)} disabled={selectedLinkId !== link.localId || index === links.length - 1} aria-label="Переместить ссылку ниже"><ArrowDown size={16} /></button>
              </div>
              <div className="link-editor__body">
                <div className="link-editor__row">
                  <select aria-label="Площадка" value={LINK_PLATFORMS.some((platform) => platform.value === link.icon_key) ? link.icon_key : 'link'} onChange={(event) => changePlatform(link, event.target.value as LinkIconName)}>
                    {LINK_PLATFORMS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input aria-label="Название ссылки" value={link.label} onChange={(event) => updateLink(link.localId, { label: event.target.value })} placeholder="Название" maxLength={80} />
                </div>
                {(() => {
                  const platform = getLinkPlatform(link.icon_key)
                  if (!platform.baseUrl) {
                    return <input aria-label="Адрес ссылки" value={link.url} onChange={(event) => updateLink(link.localId, { url: event.target.value })} placeholder={platform.placeholder} inputMode="url" autoCapitalize="none" />
                  }

                  return (
                    <div className="input-prefix input-prefix--compact">
                      <span>{platform.inputPrefix}</span>
                      <input
                        aria-label={`Имя пользователя в ${platform.label}`}
                        value={platformUsernameFromUrl(platform, link.url)}
                        onChange={(event) => updateLink(link.localId, {
                          url: buildPlatformUrl(platform, event.target.value),
                          label: link.label.trim() ? link.label : platform.label,
                        })}
                        placeholder={platform.placeholder}
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                  )
                })()}
                <TypographyControls label="Название ссылки" slot="link" font={link.label_font} size={link.label_font_size} onChange={(font, size) => updateLink(link.localId, { label_font: font, label_font_size: size })} />
                <small className="link-editor__hint">{getLinkPlatform(link.icon_key).baseUrl ? 'Введите только имя после адреса площадки' : 'Можно без https:// · логотип подтянется автоматически'}</small>
                <div className="link-editor__footer">
                  <span className="link-editor__site-icon" role="img" aria-label="Иконка сайта"><LinkIcon name={link.icon_key} url={link.url} size={28} /></span>
                <label className={`sensitive-toggle ${isKnownSensitiveUrl(link.url) ? 'sensitive-toggle--forced' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isKnownSensitiveUrl(link.url) || link.is_sensitive}
                    disabled={isKnownSensitiveUrl(link.url)}
                    onChange={(event) => updateLink(link.localId, { is_sensitive: event.target.checked })}
                  />
                  <span className="sensitive-toggle__switch"><i /></span>
                  <span><ShieldAlert size={14} /><strong>Предупреждение 18+</strong><small>{isKnownSensitiveUrl(link.url) ? 'Включено автоматически для этой площадки' : 'Включите, если по ссылке возможен контент для взрослых'}</small></span>
                </label>
                </div>
              </div>
              <div className="link-editor__actions">
                <button className="icon-button" onClick={() => updateLink(link.localId, { is_visible: !link.is_visible })} aria-label={link.is_visible ? 'Скрыть' : 'Показать'}>{link.is_visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
                <button className="icon-button icon-button--danger" onClick={() => { removeLink(link.localId); if (selectedLinkId === link.localId) setSelectedLinkId(null) }} aria-label="Удалить"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__title settings-card__title--action">
          <div className="settings-card__title-copy"><MapPin size={18} /><div><h2>Контакты</h2><p>Адреса, телефоны и почта · без ограничений</p></div></div>
          <div className="settings-card__actions">
            <button className="button button--secondary button--small" type="button" onClick={addContact}><Plus size={16} /> Добавить</button>
          </div>
        </div>
        {contacts.length > 1 && <p className="reorder-hint">Отметьте карточку галочкой и перемещайте её двумя стрелками.</p>}

        <div className="links-editor">
          {contacts.length === 0 && (
            <button className="empty-links" type="button" onClick={addContact}><span><Plus size={21} /></span><strong>Добавьте контакты</strong><p>Адрес, телефон или электронную почту.</p></button>
          )}
          {contacts.map((contact, index) => (
            <article className={`link-editor contact-editor ${selectedContactId === contact.localId ? 'link-editor--selected' : ''}`} key={contact.localId} data-contact-id={contact.localId}>
              <div className="link-editor__move" aria-label="Перемещение контакта">
                <button className="icon-button" type="button" onClick={() => moveContact(index, -1)} disabled={selectedContactId !== contact.localId || index === 0} aria-label="Переместить контакт выше"><ArrowUp size={16} /></button>
              <button
                className={`selection-check ${selectedContactId === contact.localId ? 'selection-check--selected' : ''}`}
                type="button"
                aria-pressed={selectedContactId === contact.localId}
                aria-label={selectedContactId === contact.localId ? 'Снять выбор контакта' : 'Выбрать контакт для перемещения'}
                onClick={() => setSelectedContactId((current) => current === contact.localId ? null : contact.localId)}
              >{selectedContactId === contact.localId && <Check size={15} />}</button>
                <button className="icon-button" type="button" onClick={() => moveContact(index, 1)} disabled={selectedContactId !== contact.localId || index === contacts.length - 1} aria-label="Переместить контакт ниже"><ArrowDown size={16} /></button>
              </div>
              <div className="link-editor__body">
                <div className="link-editor__row">
                  <select aria-label="Тип контакта" value={contact.kind} onChange={(event) => updateContact(contact.localId, { kind: event.target.value as ContactKind, latitude: null, longitude: null })}>
                    {CONTACT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input aria-label="Подпись контакта" value={contact.label} onChange={(event) => updateContact(contact.localId, { label: event.target.value })} placeholder="Подпись (необязательно)" maxLength={80} />
                </div>
                <TypographyControls label="Подпись контакта" slot="contactLabel" font={contact.label_font} size={contact.label_font_size} onChange={(font, size) => updateContact(contact.localId, { label_font: font, label_font_size: size })} />
                <input
                  aria-label="Значение контакта"
                  type={contact.kind === 'email' ? 'email' : contact.kind === 'phone' ? 'tel' : 'text'}
                  inputMode={contact.kind === 'email' ? 'email' : contact.kind === 'phone' ? 'tel' : 'text'}
                  value={contact.value}
                  onChange={(event) => updateContact(contact.localId, { value: event.target.value, latitude: null, longitude: null })}
                  placeholder={contactPlaceholder(contact.kind)}
                />
                <TypographyControls label="Значение контакта" slot="contactValue" font={contact.value_font} size={contact.value_font_size} onChange={(font, size) => updateContact(contact.localId, { value_font: font, value_font_size: size })} />
                <small className="link-editor__hint">{contact.kind === 'address' ? 'Откроется в приложении карт' : contact.kind === 'phone' ? 'Откроется набор номера' : 'Нажатие копирует · удержание открывает почту'}</small>
              </div>
              <div className="link-editor__actions">
                <button className="icon-button" type="button" onClick={() => updateContact(contact.localId, { is_visible: !contact.is_visible })} aria-label={contact.is_visible ? 'Скрыть' : 'Показать'}>{contact.is_visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
                <button className="icon-button icon-button--danger" type="button" onClick={() => { removeContact(contact.localId); if (selectedContactId === contact.localId) setSelectedContactId(null) }} aria-label="Удалить"><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function DesignEditor({
  profile,
  setProfile,
  avatarUploading,
  onAvatarUpload,
  onAvatarDraft,
}: {
  profile: Profile
  setProfile: (profile: Profile) => void
  avatarUploading: boolean
  onAvatarUpload: (blob: Blob, options?: AvatarUploadOptions) => Promise<boolean>
  onAvatarDraft: (draft: AvatarDraft | null) => void
}) {
  return (
    <div className="editor-stack appearance-settings">

      <section className="settings-card">
        <div className="settings-card__title"><Palette size={18} /><div><h2>Фон</h2><p>Выберите настроение профиля.</p></div></div>
        <div className="theme-picker">
          {([
            ['midnight', 'Полночь'],
            ['mist', 'Туман'],
            ['cobalt', 'Кобальт'],
          ] as const).map(([value, label]) => (
            <button aria-pressed={profile.background_preset === value} className={`theme-option theme-option--${value} ${profile.background_preset === value ? 'selected' : ''}`} onClick={() => setProfile({ ...profile, background_preset: value })} key={value}>
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
          ] as const).map(([value, label]) => <button aria-pressed={profile.card_preset === value} className={profile.card_preset === value ? 'selected' : ''} onClick={() => setProfile({ ...profile, card_preset: value })} key={value}>{label}</button>)}
        </div>
        <label className="avatar-size-control">
          <span><span className="field-caption">Скругление карточек</span><strong>{profile.card_radius ?? 13} px</strong></span>
          <input type="range" aria-label="Скругление карточек" min="4" max="28" step="1" value={profile.card_radius ?? 13} onChange={(event) => setProfile({ ...profile, card_radius: Number(event.target.value) })} />
          <small><span>Строго</span><span>Мягко</span></small>
        </label>
      </section>

      <AvatarEditor profile={profile} setProfile={setProfile} uploading={avatarUploading} onUpload={onAvatarUpload} onDraftChange={onAvatarDraft} />
    </div>
  )
}

function ProfilePage({ session }: { session: Session | null }) {
  const { handle = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationState = location.state as PreviewLocationState | null
  const instantPreview = navigationState?.profile.handle === handle && navigationState.profile.id === session?.user.id
    ? navigationState
    : null
  const [profile, setProfile] = useState<Profile | null>(instantPreview?.profile ?? null)
  const [links, setLinks] = useState<EditableLink[]>(instantPreview?.links ?? [])
  const [contacts, setContacts] = useState<EditableContact[]>(instantPreview?.contacts ?? [])
  const [loading, setLoading] = useState(!instantPreview)

  useEffect(() => {
    if (instantPreview) return

    const load = async () => {
      setLoading(true)
      const { data: profileData } = await supabase.from('profiles').select('*').eq('handle', handle).maybeSingle()
      if (!profileData) {
        setProfile(null)
        setLoading(false)
        return
      }
      const typedProfile = profileData as Profile
      const [linksResult, contactsResult] = await Promise.all([
        supabase.from('profile_links').select('*').eq('profile_id', typedProfile.id).order('position'),
        supabase.from('profile_contacts').select('*').eq('profile_id', typedProfile.id).order('position'),
      ])
      setProfile(await withAvatarPreview(typedProfile))
      setLinks(((linksResult.data ?? []) as ProfileLink[]).map(toEditable))
      setContacts(((contactsResult.data ?? []) as ProfileContact[]).map(toEditableContact))
      setLoading(false)
    }

    void load()
  }, [handle, instantPreview, session])

  if (loading) return <LoadingScreen />
  if (!profile) return (
    <main className="private-access-page">
      <BrandMark />
      <div className="private-access-card"><LockKeyhole size={28} /><h1>Страница не опубликована</h1><p>Владелец ещё не открыл этот профиль или адрес указан неверно.</p><Link className="button button--primary" to="/">Перейти на mylinks.bar</Link></div>
    </main>
  )

  const isOwner = session?.user.id === profile.id

  return (
    <main className={`public-preview-page theme-${profile.background_preset}`}>
      {isOwner && <button className="back-button" onClick={() => navigate('/')}><ArrowLeft size={17} /> Личный кабинет</button>}
      {profile.is_published && <ProfileTools handle={profile.handle} published />}
      <div className="public-preview-page__content"><ProfilePreview profile={profile} links={links} contacts={contacts} interactive showPrivacy={!profile.is_published} /></div>
    </main>
  )
}

export default App


