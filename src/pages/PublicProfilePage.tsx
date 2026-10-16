import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, RefreshCw } from 'lucide-react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { BrandMark } from '../components/BrandMark'
import { ActivationChecklist } from '../components/ActivationChecklist'
import { ProfilePreview } from '../components/ProfilePreview'
import { supabase } from '../lib/supabase'
import { recordProfileEvent } from '../lib/analytics'
import { publicSupabase } from '../lib/supabasePublic'
import { publicAvatarUrls } from '../lib/publicAssets'
import type { EditableContact, EditableLink, Profile, ProfileContact, ProfileLink } from '../types'
import './publicProfile.css'

interface PageData {
  profile: Profile
  links: EditableLink[]
  contacts: EditableContact[]
}

interface CacheEntry {
  avatarSignedAt: number
  data: PageData
}

type Status = 'loading' | 'ready' | 'missing' | 'error'

const CACHE_PREFIX = 'mylinks:page:'

const writeCache = (handle: string, entry: CacheEntry) => {
  try {
    if (!entry.data.profile.is_published) {
      localStorage.removeItem(CACHE_PREFIX + handle)
      return
    }
    localStorage.setItem(CACHE_PREFIX + handle, JSON.stringify(entry))
  } catch {
    // Storage can be unavailable (private mode); the page works without the cache.
  }
}

const clearCache = (handle: string) => {
  try {
    localStorage.removeItem(CACHE_PREFIX + handle)
  } catch {
    // Nothing to clear.
  }
}

const toEditable = (link: ProfileLink, handle?: string): EditableLink => ({
  id: link.id,
  profile_id: link.profile_id,
  localId: link.id,
  label: link.label,
  label_font: link.label_font,
  label_font_size: link.label_font_size,
  label_color: link.label_color,
  url: link.url,
  icon_key: link.icon_key,
  icon_snapshot_path: handle && link.icon_snapshot_path?.match(/^\/link-icon\/([a-f0-9-]{36})\/([a-f0-9]{12})\.png$/)
    ? link.icon_snapshot_path.replace('/link-icon/', `/link-icon/${handle}/`) : link.icon_snapshot_path,
  card_preset_override: link.card_preset_override,
  card_radius_override: link.card_radius_override,
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
  label_color: contact.label_color,
  value_font: contact.value_font,
  value_font_size: contact.value_font_size,
  value_color: contact.value_color,
  position: contact.position,
  is_visible: contact.is_visible,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
})

const readInitialProfile = (handle: string): PageData | null => {
  try {
    const element = document.getElementById('initial-profile')
    if (!element?.textContent) return null
    const value = JSON.parse(element.textContent) as { profile: Profile; links: ProfileLink[]; contacts: ProfileContact[] }
    if (value.profile?.handle !== handle || value.profile.is_published !== true || !Array.isArray(value.links) || !Array.isArray(value.contacts)) return null
    return {
      profile: { ...value.profile, ...publicAvatarUrls(value.profile) },
      links: value.links.filter(link => link.profile_id === value.profile.id && link.is_visible === true).map(link => toEditable(link, handle)),
      contacts: value.contacts.filter(contact => contact.profile_id === value.profile.id && contact.is_visible === true).map(toEditableContact),
    }
  } catch { return null }
}

interface AvatarReuse {
  path: string
  url: string
}

/** Background refresh; the public page already rendered from the HTML payload. */
const fetchPage = async (client: SupabaseClient, handle: string, reuse: AvatarReuse | null): Promise<PageData | null> => {
  const { data: row, error } = await client.from('profiles').select('*').eq('handle', handle).maybeSingle()
  if (error) throw error
  if (!row) return null

  const profileRow = row as Profile
  const published = profileRow.is_published === true
  const reusedUrl = !published && reuse && profileRow.avatar_path && reuse.path === profileRow.avatar_path ? reuse.url : null
  const [linksResult, contactsResult, signed, poster] = await Promise.all([
    client.from('profile_links').select('*').eq('profile_id', profileRow.id).order('position'),
    client.from('profile_contacts').select('*').eq('profile_id', profileRow.id).order('position'),
    !published && profileRow.avatar_path && !reusedUrl
      ? client.storage.from('avatars').createSignedUrl(profileRow.avatar_path, 60 * 60)
      : Promise.resolve(null),
    !published && profileRow.avatar_poster_path ? client.storage.from('avatars').createSignedUrl(profileRow.avatar_poster_path, 60 * 60) : Promise.resolve(null),
  ])
  if (linksResult.error) throw linksResult.error
  if (contactsResult.error) throw contactsResult.error

  const avatarUrl = reusedUrl ?? signed?.data?.signedUrl ?? null
  const assetUrls = published ? publicAvatarUrls(profileRow) : {}

  return {
    profile: {
      ...profileRow,
      avatar_url: published && (profileRow.avatar_path || profileRow.avatar_url?.includes('/storage/v1/object/sign/')) ? null : profileRow.avatar_url,
      avatar_scale: Number(profileRow.avatar_scale) || ({ small: 12, medium: 28, large: 40 }[profileRow.avatar_size] ?? 28),
      avatar_preview_url: published ? assetUrls.avatar_preview_url : avatarUrl,
      avatar_master_url: published ? assetUrls.avatar_master_url : null,
      avatar_poster_url: published ? assetUrls.avatar_poster_url : poster?.data?.signedUrl ?? null,
      avatar_master_poster_url: published ? assetUrls.avatar_master_poster_url : null,
    },
    links: ((linksResult.data ?? []) as ProfileLink[]).map(link => toEditable(link, published ? handle : undefined)),
    contacts: ((contactsResult.data ?? []) as ProfileContact[]).map(toEditableContact),
  }
}

function ProfileSkeleton() {
  return (
    <main className="public-preview-page theme-midnight" aria-busy="true" aria-label="Загрузка профиля">
      <div className="public-preview-page__content">
        <div className="profile-skeleton">
          <span className="profile-skeleton__avatar" />
          <span className="profile-skeleton__line profile-skeleton__line--title" />
          <span className="profile-skeleton__line" />
          <span className="profile-skeleton__link" />
          <span className="profile-skeleton__link" />
          <span className="profile-skeleton__link" />
        </div>
      </div>
    </main>
  )
}

export function PublicProfilePage({ handle }: { handle: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = location.state as PageData | null
  // The editor opens the page with its current (possibly unsaved) data: show it as is.
  const instant = navState?.profile?.handle === handle ? navState : null
  const [initial] = useState<CacheEntry | null>(() => {
    const page = instant ?? readInitialProfile(handle)
    return page ? { avatarSignedAt: Date.now(), data: page } : null
  })
  const [data, setData] = useState<PageData | null>(initial?.data ?? null)
  const [status, setStatus] = useState<Status>(initial ? 'ready' : 'loading')
  const [attempt, setAttempt] = useState(0)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionResolved, setSessionResolved] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportEmail, setReportEmail] = useState('')
  const [reportCategory, setReportCategory] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')

  // The session only decides whether to show the "back to editor" button; it never blocks the page.
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (active) {
        setSession(sessionData.session)
        setSessionResolved(true)
      }
    }).catch(() => {
      if (active) setSessionResolved(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setSessionResolved(true)
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (instant) return
    let cancelled = false
    const cachedAvatar = initial?.data.profile.avatar_path && initial.data.profile.avatar_preview_url
      ? { path: initial.data.profile.avatar_path, url: initial.data.profile.avatar_preview_url }
      : null

    const load = async () => {
      try {
        // Public pages are read anonymously, without waiting for any authorization.
        let page = await fetchPage(publicSupabase, handle, cachedAvatar)
        if (!page) {
          // Not public: it may be the owner's own unpublished page, which needs the signed-in session.
          const { data: sessionData } = await supabase.auth.getSession()
          if (sessionData.session) {
            const ownPage = await fetchPage(supabase, handle, cachedAvatar)
            if (ownPage?.profile.id === sessionData.session.user.id) page = ownPage
          }
        }
        if (cancelled) return
        if (page) {
          const reused = Boolean(cachedAvatar && page.profile.avatar_preview_url === cachedAvatar.url)
          setData(page)
          setStatus('ready')
          writeCache(handle, { avatarSignedAt: reused && initial ? initial.avatarSignedAt : Date.now(), data: page })
        } else {
          setData(null)
          setStatus('missing')
          clearCache(handle)
        }
      } catch {
        if (!cancelled) setStatus((current) => (current === 'loading' ? 'error' : current))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [handle, instant, initial, attempt])

  const canTrack = sessionResolved && status === 'ready' && Boolean(data?.profile.is_published) && session?.user.id !== data?.profile.id && !instant
  useEffect(() => {
    if (canTrack && data) recordProfileEvent(data.profile.id)
  }, [canTrack, data])

  if (status === 'loading') return <ProfileSkeleton />

  if (status === 'error' && !data) {
    return (
      <main className="private-access-page">
        <BrandMark />
        <div className="private-access-card">
          <RefreshCw size={28} />
          <h1>Не удалось загрузить страницу</h1>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button className="button button--primary" type="button" onClick={() => { setStatus('loading'); setAttempt((current) => current + 1) }}>Повторить</button>
        </div>
      </main>
    )
  }

  const visibleData = data && (data.profile.is_published || session?.user.id === data.profile.id) ? data : null
  if (data && !visibleData && !sessionResolved) return <ProfileSkeleton />

  if (!visibleData) {
    return (
      <main className="private-access-page">
        <BrandMark />
        <div className="private-access-card"><LockKeyhole size={28} /><h1>Страница не опубликована</h1><p>Владелец ещё не открыл этот профиль или адрес указан неверно.</p><Link className="button button--primary" to="/">Перейти на mylinks.bar</Link></div>
      </main>
    )
  }

  const isOwner = Boolean(session && session.user.id === visibleData.profile.id)

  const sendReport = async (event: FormEvent) => {
    event.preventDefault()
    setReportBusy(true)
    setReportError('')
    const { error } = await supabase.rpc('submit_profile_report', {
      target_handle: visibleData.profile.handle,
      target_link: null,
      report_category: reportCategory,
      report_details: reportDetails.trim(),
      contact_email: reportEmail.trim(),
    })
    if (error) setReportError(error.message)
    else setReportSent(true)
    setReportBusy(false)
  }

  return (
    <main className={`public-preview-page theme-${visibleData.profile.background_preset}`}>
      {isOwner && <button className="back-button" onClick={() => navigate('/')}><ArrowLeft size={17} /> Личный кабинет</button>}
      {isOwner && visibleData.profile.is_published && <ActivationChecklist id={visibleData.profile.id} handle={visibleData.profile.handle} />}
      <div className="public-preview-page__content"><ProfilePreview profile={visibleData.profile} links={visibleData.links} contacts={visibleData.contacts} interactive onLinkActivate={canTrack ? link => { if (link.id) recordProfileEvent(visibleData.profile.id, link.id) } : undefined} showPrivacy={!visibleData.profile.is_published} />
        {visibleData.profile.is_published && !isOwner && <button className="public-report-trigger" type="button" onClick={() => { setReportOpen(true); setReportSent(false); setReportError('') }}>Пожаловаться на страницу</button>}
      </div>
      {reportOpen && <div className="report-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !reportBusy) setReportOpen(false) }}>
        <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <button className="report-close" type="button" onClick={() => setReportOpen(false)} aria-label="Закрыть">×</button>
          {reportSent ? <><h2 id="report-title">Жалоба отправлена</h2><p>Спасибо. Команда mylinks.bar проверит страницу.</p><button className="button button--primary" onClick={() => setReportOpen(false)}>Готово</button></> :
            <><h2 id="report-title">Сообщить о нарушении</h2><p>Укажите причину и email для связи. Жалоба будет рассмотрена командой.</p>
              <form onSubmit={sendReport}>
                <label>Причина<select value={reportCategory} onChange={event => setReportCategory(event.target.value)}><option value="spam">Спам или обман</option><option value="scam">Мошенничество</option><option value="abuse">Оскорбления или угрозы</option><option value="adult">Недопустимый контент</option><option value="copyright">Нарушение авторских прав</option><option value="other">Другое</option></select></label>
                <label>Подробности <span className="report-optional">необязательно</span><textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={2000} rows={3} placeholder="Что именно стоит проверить?" /></label>
                <label>Email для связи<input type="email" value={reportEmail} onChange={event => setReportEmail(event.target.value)} maxLength={254} required placeholder="you@example.com" autoComplete="email" /></label>
                {reportError && <p className="report-error" role="alert">{reportError}</p>}
                <div className="report-actions"><button type="button" className="button button--ghost" onClick={() => setReportOpen(false)} disabled={reportBusy}>Отмена</button><button type="submit" className="button button--primary" disabled={reportBusy}>{reportBusy ? 'Отправляем…' : 'Отправить жалобу'}</button></div>
              </form></>}
        </section>
      </div>}
    </main>
  )
}

