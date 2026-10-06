import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, RefreshCw } from 'lucide-react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { BrandMark } from '../components/BrandMark'
import { ProfilePreview } from '../components/ProfilePreview'
import { supabase } from '../lib/supabase'
import { publicSupabase } from '../lib/supabasePublic'
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
/** Signed avatar links live for an hour; reuse them a bit shorter so the cached photo never expires on screen. */
const AVATAR_TTL_MS = 50 * 60 * 1000

const readCache = (handle: string): CacheEntry | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + handle)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry?.data?.profile) return null
    if (Date.now() - entry.avatarSignedAt > AVATAR_TTL_MS) entry.data.profile.avatar_preview_url = null
    return entry
  } catch {
    return null
  }
}

const writeCache = (handle: string, entry: CacheEntry) => {
  try {
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

const toEditable = (link: ProfileLink): EditableLink => ({
  id: link.id,
  profile_id: link.profile_id,
  localId: link.id,
  label: link.label,
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
  position: contact.position,
  is_visible: contact.is_visible,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
})

/** Downloads the photo into the browser cache so the card appears together with its avatar. */
const preloadImage = (src: string, timeoutMs = 1500) => new Promise<void>((resolve) => {
  const image = new Image()
  image.onload = () => resolve()
  image.onerror = () => resolve()
  image.src = src
  window.setTimeout(resolve, timeoutMs)
})

interface AvatarReuse {
  path: string
  url: string
}

/** Two round trips: the profile first, then links, contacts and the avatar link in parallel. */
const fetchPage = async (client: SupabaseClient, handle: string, reuse: AvatarReuse | null): Promise<PageData | null> => {
  const { data: row, error } = await client.from('profiles').select('*').eq('handle', handle).maybeSingle()
  if (error) throw error
  if (!row) return null

  const profileRow = row as Profile
  const reusedUrl = reuse && profileRow.avatar_path && reuse.path === profileRow.avatar_path ? reuse.url : null
  const [linksResult, contactsResult, signed] = await Promise.all([
    client.from('profile_links').select('*').eq('profile_id', profileRow.id).order('position'),
    client.from('profile_contacts').select('*').eq('profile_id', profileRow.id).order('position'),
    profileRow.avatar_path && !reusedUrl
      ? client.storage.from('avatars').createSignedUrl(profileRow.avatar_path, 60 * 60)
      : Promise.resolve(null),
  ])
  if (linksResult.error) throw linksResult.error
  if (contactsResult.error) throw contactsResult.error

  const avatarUrl = reusedUrl ?? signed?.data?.signedUrl ?? null
  if (avatarUrl && !reusedUrl) await preloadImage(avatarUrl)

  return {
    profile: {
      ...profileRow,
      avatar_scale: Number(profileRow.avatar_scale) || ({ small: 12, medium: 28, large: 40 }[profileRow.avatar_size] ?? 28),
      avatar_preview_url: avatarUrl,
    },
    links: ((linksResult.data ?? []) as ProfileLink[]).map(toEditable),
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
  const [initial] = useState<CacheEntry | null>(() => (instant ? { avatarSignedAt: Date.now(), data: instant } : readCache(handle)))
  const [data, setData] = useState<PageData | null>(initial?.data ?? null)
  const [status, setStatus] = useState<Status>(initial ? 'ready' : 'loading')
  const [attempt, setAttempt] = useState(0)
  const [session, setSession] = useState<Session | null>(null)

  // The session only decides whether to show the "back to editor" button; it never blocks the page.
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (active) setSession(sessionData.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
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
          if (sessionData.session) page = await fetchPage(supabase, handle, cachedAvatar)
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

  if (!data) {
    return (
      <main className="private-access-page">
        <BrandMark />
        <div className="private-access-card"><LockKeyhole size={28} /><h1>Страница не опубликована</h1><p>Владелец ещё не открыл этот профиль или адрес указан неверно.</p><Link className="button button--primary" to="/">Перейти на mylinks.bar</Link></div>
      </main>
    )
  }

  const isOwner = Boolean(session && session.user.id === data.profile.id)

  return (
    <main className={`public-preview-page theme-${data.profile.background_preset}`}>
      {isOwner && <button className="back-button" onClick={() => navigate('/')}><ArrowLeft size={17} /> В редактор</button>}
      <div className="public-preview-page__content"><ProfilePreview profile={data.profile} links={data.links} contacts={data.contacts} interactive showPrivacy={!data.profile.is_published} /></div>
    </main>
  )
}
