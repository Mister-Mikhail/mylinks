import { useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, LockKeyhole, ShieldAlert, X } from 'lucide-react'
import type { EditableContact, EditableLink, Profile } from '../types'
import { isKnownSensitiveUrl } from '../lib/sensitiveLinks'
import { BrandMark } from './BrandMark'
import { LinkIcon } from './LinkIcon'
import { ProfileContacts } from './ProfileContacts'

interface ProfilePreviewProps {
  profile: Profile
  links: EditableLink[]
  contacts?: EditableContact[]
  interactive?: boolean
  showPrivacy?: boolean
}

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase() || 'ML'

export function ProfilePreview({ profile, links, contacts = [], interactive = false, showPrivacy = true }: ProfilePreviewProps) {
  const visibleLinks = links.filter((link) => link.is_visible && link.label && link.url)
  const [sensitiveLink, setSensitiveLink] = useState<EditableLink | null>(null)

  const openLink = (event: MouseEvent<HTMLAnchorElement>, link: EditableLink) => {
    if (!link.is_sensitive && !isKnownSensitiveUrl(link.url)) return
    event.preventDefault()
    setSensitiveLink(link)
  }

  const confirmSensitiveLink = () => {
    if (!sensitiveLink) return
    const popup = window.open(sensitiveLink.url, '_blank', 'noopener,noreferrer')
    if (popup) popup.opener = null
    setSensitiveLink(null)
  }

  return (
    <section className={`profile-card theme-${profile.background_preset}`} aria-label={`Профиль ${profile.display_name}`}>
      <div className="profile-card__noise" />
      <div className="profile-card__topline">
        {showPrivacy ? (
          <span className="privacy-pill"><LockKeyhole size={12} /> Закрытый просмотр</span>
        ) : null}
      </div>

      <div className="profile-card__identity">
        <div className={`avatar avatar--${profile.avatar_shape}`} style={{ '--avatar-size': `${Math.round(42 + (profile.avatar_scale || 28) * 2.1)}px` } as CSSProperties}>
          {profile.avatar_preview_url || profile.avatar_url ? <img src={profile.avatar_preview_url || profile.avatar_url || ''} alt="" /> : <span>{initials(profile.display_name)}</span>}
        </div>
        <h1>{profile.display_name || 'Ваше имя'}</h1>
        <p className="profile-card__handle">@{profile.handle || 'username'}</p>
        <p className="profile-card__bio">{profile.bio || 'Коротко расскажите о себе и о том, чем делитесь.'}</p>
      </div>

      <ProfileContacts contacts={contacts} cardPreset={profile.card_preset} interactive={interactive} />

      <div className="profile-card__links">
        {visibleLinks.length > 0 ? visibleLinks.map((link) => {
          const content = (
            <>
              <span className="profile-link__icon"><LinkIcon name={link.icon_key} url={link.url} /></span>
              <span className="profile-link__label">{link.label}{(link.is_sensitive || isKnownSensitiveUrl(link.url)) && <small>18+</small>}</span>
              <ArrowUpRight className="profile-link__arrow" size={17} />
            </>
          )
          return interactive ? (
            <a className={`profile-link card-${profile.card_preset}`} href={link.url} target="_blank" rel="noreferrer" key={link.localId} onClick={(event) => openLink(event, link)}>
              {content}
            </a>
          ) : (
            <div className={`profile-link card-${profile.card_preset}`} key={link.localId}>{content}</div>
          )
        }) : (
          <div className={`profile-link profile-link--empty card-${profile.card_preset}`}>
            <span>Здесь появятся ваши ссылки</span>
          </div>
        )}
      </div>

      <div className="profile-card__footer">
        <BrandMark light />
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
