import { useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Check, Copy, LockKeyhole, ShieldAlert, X } from 'lucide-react'
import type { AvatarDraft, EditableContact, EditableLink, Profile } from '../types'
import { textStyle } from '../lib/typography'
import { appearanceStyle, appearanceTheme } from '../lib/appearance'
import { cardOverrideStyle } from '../lib/cardStyle'
import { isKnownSensitiveUrl } from '../lib/sensitiveLinks'
import { copyText, profileUrl } from '../lib/clipboard'
import { BrandMark } from './BrandMark'
import { LinkIcon } from './LinkIcon'
import { ProfileContacts } from './ProfileContacts'
import { PublicShareTools } from './PublicShareTools'
import { AvatarMedia } from './AvatarMedia'
import './extras.css'

interface ProfilePreviewProps {
  profile: Profile
  links: EditableLink[]
  contacts?: EditableContact[]
  interactive?: boolean
  avatarDraft?: AvatarDraft | null
  showPrivacy?: boolean
  onLinkActivate?: (link: EditableLink) => void
  selectedLinkId?: string | null
  onSelectLink?: (id: string) => void
}


export function ProfilePreview({ profile, links, contacts = [], interactive = false, showPrivacy = true, avatarDraft = null, onLinkActivate, selectedLinkId, onSelectLink }: ProfilePreviewProps) {
  const visibleLinks = links.filter((link) => link.is_visible && link.label && link.url)
  const [sensitiveLink, setSensitiveLink] = useState<EditableLink | null>(null)
  const [profileLinkCopied, setProfileLinkCopied] = useState(false)
  const clickAudio = useRef<HTMLAudioElement | null>(null)

  const playClickSound = () => {
    if (!interactive) return
    const audio = clickAudio.current ?? new Audio('/sounds/link-click.mp3')
    clickAudio.current = audio
    audio.volume = 0.55
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }

  const copyProfileLink = async () => {
    if (!await copyText(profileUrl(profile.handle))) return
    setProfileLinkCopied(true)
    window.setTimeout(() => setProfileLinkCopied(false), 1800)
  }

  const openLink = (event: MouseEvent<HTMLAnchorElement>, link: EditableLink) => {
    playClickSound()
    if (!link.is_sensitive && !isKnownSensitiveUrl(link.url)) {
      onLinkActivate?.(link)
      return
    }
    event.preventDefault()
    setSensitiveLink(link)
  }

  const confirmSensitiveLink = () => {
    if (!sensitiveLink) return
    onLinkActivate?.(sensitiveLink)
    const popup = window.open(sensitiveLink.url, '_blank', 'noopener,noreferrer')
    if (popup) popup.opener = null
    setSensitiveLink(null)
  }

  return (
    <section className={`profile-card theme-${appearanceTheme(profile)}`} style={appearanceStyle(profile)} aria-label={`Профиль ${profile.display_name}`}>
      <div className="profile-card__noise" />
      <div className="profile-card__topline">
        {showPrivacy ? (
          <span className="privacy-pill"><LockKeyhole size={12} /> Закрытый просмотр</span>
        ) : null}
      </div>

      <div className="profile-card__identity">
        <div className={`avatar avatar--${profile.avatar_shape}`} style={{ '--avatar-size': `${Math.round(42 + (profile.avatar_scale || 28) * 2.1)}px`, '--avatar-width': `${profile.avatar_scale || 28}%` } as CSSProperties}>
          <AvatarMedia profile={profile} draft={avatarDraft} />
        </div>
        <h1 style={textStyle(profile.name_font, profile.name_font_size, 'name', profile.name_color)}>{profile.display_name || 'Ваше имя'}</h1>
        <button className="profile-card__handle" style={textStyle(profile.handle_font, profile.handle_font_size, 'handle', profile.handle_color)} type="button" onClick={() => void copyProfileLink()} aria-label="Скопировать ссылку на профиль">
          {profileLinkCopied ? <Check size={11} /> : <Copy size={10} />}
          <span>mylinks.bar/{profile.handle || 'username'}</span>
        </button>
        <p className="profile-card__bio" style={textStyle(profile.bio_font, profile.bio_font_size, 'bio', profile.bio_color)}>{profile.bio || 'Коротко расскажите о себе и о том, чем делитесь.'}</p>
        <span className={`profile-card__copy-toast ${profileLinkCopied ? 'profile-card__copy-toast--visible' : ''}`} aria-live="polite">Ссылка скопирована</span>
      </div>

      <div className="profile-card__body">
      <ProfileContacts contacts={contacts} cardPreset={profile.card_preset} interactive={interactive} onActivate={playClickSound} />

      <div className="profile-card__links">
        {visibleLinks.length > 0 ? visibleLinks.map((link) => {
          const cardStyle = { ...(link.card_radius_override == null ? {} : { '--card-radius': `${Math.min(28, Math.max(4, link.card_radius_override))}px` }), ...cardOverrideStyle(link.card_style) } as CSSProperties
          const featured=link.presentation === 'featured'
          const cardClass = `profile-link card-${link.card_preset_override ?? profile.card_preset}${featured?' profile-link--featured':''}`
          const content = (
            <>
              {featured && (link.image_url && !(interactive && (link.is_sensitive || isKnownSensitiveUrl(link.url))) ? <img className="profile-link__image" src={link.image_url} alt={link.image_alt || ''} loading="lazy" decoding="async" style={{objectPosition:`${link.image_position_x ?? 50}% ${link.image_position_y ?? 50}%`}} onError={event=>{event.currentTarget.style.display='none'}}/> : <span className="profile-link__image-placeholder">{link.is_sensitive || isKnownSensitiveUrl(link.url) ? <ShieldAlert size={28}/> : <LinkIcon name={link.icon_key} url={link.url} publicView={interactive}/>}</span>)}
              <span className="profile-link__icon"><LinkIcon name={link.icon_key} url={link.url} snapshotPath={link.icon_snapshot_path} publicView={interactive} /></span>
              <span className="profile-link__label" style={textStyle(link.label_font ?? profile.link_font, link.label_font_size ?? profile.link_font_size, 'link', link.label_color ?? profile.link_color)}><span className="profile-link__text">{link.label}</span>{(link.is_sensitive || isKnownSensitiveUrl(link.url)) && <small>18+</small>}</span>
            </>
          )
          return interactive ? (
            <a className={cardClass} style={cardStyle} href={link.url} target="_blank" rel="noreferrer" key={link.localId} onClick={(event) => openLink(event, link)}>
              {content}
            </a>
          ) : (
            onSelectLink ? <button type="button" className={`${cardClass} ${selectedLinkId === link.localId ? 'profile-link--selected' : ''}`} style={cardStyle} key={link.localId} onClick={() => onSelectLink(link.localId)} aria-pressed={selectedLinkId === link.localId} aria-label={`Оформить карточку: ${link.label}`}>{content}</button> : <div className={cardClass} style={cardStyle} key={link.localId}>{content}</div>
          )
        }) : (
          <div className={`profile-link profile-link--empty card-${profile.card_preset}`}>
            <span>Здесь появятся ваши ссылки</span>
          </div>
        )}
      </div>

      {interactive && profile.is_published && <PublicShareTools handle={profile.handle} name={profile.display_name} contacts={contacts} showQr={Boolean(profile.show_qr)} size={profile.qr_size ?? 176} updatedAt={profile.updated_at} avatarPath={profile.avatar_path} />}
      </div>

      <div className="profile-card__footer">
        {interactive ? (
          // Start page for visitors; signed-in owners land in their editor on the same route.
          <Link className="profile-card__home" to="/" aria-label="mylinks.bar — на главную"><BrandMark light /></Link>
        ) : <BrandMark light />}
      </div>

      {sensitiveLink && createPortal(
        <div className="sensitive-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSensitiveLink(null)}>
          <section className="sensitive-dialog" role="dialog" aria-modal="true" aria-labelledby="sensitive-dialog-title">
            <button className="sensitive-dialog__close" type="button" onClick={() => setSensitiveLink(null)} aria-label="Закрыть предупреждение"><X size={17} /></button>
            <span className="sensitive-dialog__icon"><ShieldAlert size={25} /></span>
            <span className="eyebrow">Предупреждение 18+</span>
            <h2 id="sensitive-dialog-title">Возможен контент для взрослых</h2>
            <p>Ссылка «{sensitiveLink.label}» может вести на материалы, предназначенные только для совершеннолетних.</p>
            <button className="button button--primary button--full" type="button" onClick={confirmSensitiveLink}>Мне есть 18 — продолжить</button>
            <button className="button button--ghost button--full" type="button" onClick={() => setSensitiveLink(null)}>Вернуться</button>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

