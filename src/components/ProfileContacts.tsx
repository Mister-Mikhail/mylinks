import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Mail, MapPin, Phone } from 'lucide-react'
import { addressHref, contactKindLabel, emailHref, phoneHref } from '../lib/contacts'
import { textStyle } from '../lib/typography'
import type { CardPreset, EditableContact } from '../types'

interface ProfileContactsProps {
  contacts: EditableContact[]
  cardPreset: CardPreset
  interactive: boolean
  onActivate?: () => void
}

const ContactCopy = ({ contact, status }: { contact: EditableContact; status?: string }) => (
  <span className="profile-contact__copy">
    <strong style={textStyle(contact.label_font, contact.label_font_size, 'contactLabel', contact.label_color)}>{contact.label.trim() || contactKindLabel(contact.kind)}</strong>
    <small style={textStyle(contact.value_font, contact.value_font_size, 'contactValue', contact.value_color)}>{status || contact.value}</small>
  </span>
)

function EmailContact({ contact, cardPreset, onActivate }: { contact: EditableContact; cardPreset: CardPreset; onActivate?: () => void }) {
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
    onActivate?.()
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
      <ContactCopy contact={contact} status={copied ? 'Скопировано' : undefined} />
    </button>
  )
}

export function ProfileContacts({ contacts, cardPreset, interactive, onActivate }: ProfileContactsProps) {
  const visible = contacts.filter((contact) => contact.is_visible && contact.value.trim())
  if (!visible.length) return null

  return (
    <div className="profile-card__contacts" aria-label="Контакты">
      {visible.map((contact) => {
        if (interactive && contact.kind === 'email') {
          return <EmailContact contact={contact} cardPreset={cardPreset} onActivate={onActivate} key={contact.localId} />
        }

        const icon = contact.kind === 'address' ? <MapPin size={18} /> : contact.kind === 'phone' ? <Phone size={18} /> : <Mail size={18} />
        const href = contact.kind === 'address' ? addressHref(contact.value, contact.latitude, contact.longitude) : contact.kind === 'phone' ? phoneHref(contact.value) : emailHref(contact.value)
        const content = (
          <>
            <span className="profile-link__icon">{icon}</span>
            <ContactCopy contact={contact} />
          </>
        )

        return interactive ? (
          <a className={`profile-link profile-contact card-${cardPreset}`} href={href} key={contact.localId} onClick={onActivate}>
            {content}
          </a>
        ) : (
          <div className={`profile-link profile-contact card-${cardPreset}`} key={contact.localId}>{content}</div>
        )
      })}
    </div>
  )
}


