import { ArrowUpRight, LockKeyhole, MoreHorizontal } from 'lucide-react'
import type { EditableLink, Profile } from '../types'
import { BrandMark } from './BrandMark'
import { LinkIcon } from './LinkIcon'

interface ProfilePreviewProps {
  profile: Profile
  links: EditableLink[]
  interactive?: boolean
  showPrivacy?: boolean
}

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase() || 'ML'

export function ProfilePreview({ profile, links, interactive = false, showPrivacy = true }: ProfilePreviewProps) {
  const visibleLinks = links.filter((link) => link.is_visible && link.label && link.url)

  return (
    <section className={`profile-card theme-${profile.background_preset}`} aria-label={`Профиль ${profile.display_name}`}>
      <div className="profile-card__noise" />
      <div className="profile-card__topline">
        {showPrivacy ? (
          <span className="privacy-pill"><LockKeyhole size={12} /> Закрытый просмотр</span>
        ) : <span />}
        <button className="icon-button icon-button--glass" type="button" aria-label="Дополнительные действия">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="profile-card__identity">
        <div className={`avatar avatar--${profile.avatar_shape} avatar--${profile.avatar_size}`}>
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials(profile.display_name)}</span>}
        </div>
        <h1>{profile.display_name || 'Ваше имя'}</h1>
        <p className="profile-card__handle">@{profile.handle || 'username'}</p>
        <p className="profile-card__bio">{profile.bio || 'Коротко расскажите о себе и о том, чем делитесь.'}</p>
      </div>

      <div className="profile-card__links">
        {visibleLinks.length > 0 ? visibleLinks.map((link) => {
          const content = (
            <>
              <span className="profile-link__icon"><LinkIcon name={link.icon_key} url={link.url} /></span>
              <span>{link.label}</span>
              <ArrowUpRight className="profile-link__arrow" size={17} />
            </>
          )
          return interactive ? (
            <a className={`profile-link card-${profile.card_preset}`} href={link.url} target="_blank" rel="noreferrer" key={link.localId}>
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
    </section>
  )
}
