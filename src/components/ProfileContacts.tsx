import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Copy, ExternalLink, Mail, MapPin, Phone } from 'lucide-react'
import { addressHref, contactKindLabel, emailHref, phoneHref } from '../lib/contacts'
import type { CardPreset, EditableContact } from '../types'

interface ProfileContactsProps {
  contacts: EditableContact[]
  cardPreset: CardPreset
  interactive: boolean
}

const ContactCopy = ({ contact }: { contact: EditableContact }) => (
  <span className="profile-contact__copy">
    <strong>{contact.label.trim() || contactKindLabel(contact.kind)}</strong>
    <small>{contact.value}</small>
  </span>
)

function EmailContact({ contact, cardPreset }: { contact: EditableContact; cardPreset: CardPreset }) {
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const [copied, setCopied] = useState(false)

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  const startLongPress = () => {
    longPressed.current = false
    clearTimer()
    timer.current = window.setTimeout(() => {
      longPressed.current = true
      window.location.href = emailHref(contact.value)
    }, 650)
  }

  const copyEmail = async () => {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    await navigator.clipboard.writeText(contact.value.trim())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const finishPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    clearTimer()
  }

  return (
    <button
      className={`profile-link profile-contact card-${cardPreset}`}
      type="button"
      onClick={() => void copyEmail()}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        startLongPress()
      }}
      onPointerUp={finishPress}
      onPointerCancel={finishPress}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`${copied ? 'Скопировано' : 'Скопировать email'} ${contact.value}. Удерживайте, чтобы написать письмо.`}
    >
      <span className="profile-link__icon"><Mail size={18} /></span>
      <ContactCopy contact={contact} />
      {copied ? <span className="profile-contact__status">Скопировано</span> : <Copy className="profile-link__arrow" size={16} />}
    </button>
  )
}

export function ProfileContacts({ contacts, cardPreset, interactive }: ProfileContactsProps) {
  const visible = contacts.filter((contact) => contact.is_visible && contact.value.trim())
  if (!visible.length) return null

  return (
    <div className="profile-card__contacts" aria-label="Контакты">
      {visible.map((contact) => {
        if (interactive && contact.kind === 'email') {
          return <EmailContact contact={contact} cardPreset={cardPreset} key={contact.localId} />
        }

        const icon = contact.kind === 'address' ? <MapPin size={18} /> : contact.kind === 'phone' ? <Phone size={18} /> : <Mail size={18} />
        const href = contact.kind === 'address' ? addressHref(contact.value) : contact.kind === 'phone' ? phoneHref(contact.value) : emailHref(contact.value)
        const content = (
          <>
            <span className="profile-link__icon">{icon}</span>
            <ContactCopy contact={contact} />
            <ExternalLink className="profile-link__arrow" size={16} />
          </>
        )

        return interactive ? (
          <a className={`profile-link profile-contact card-${cardPreset}`} href={href} key={contact.localId}>
            {content}
          </a>
        ) : (
          <div className={`profile-link profile-contact card-${cardPreset}`} key={contact.localId}>{content}</div>
        )
      })}
    </div>
  )
}
