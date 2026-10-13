import type { ContactKind } from '../types'

export const CONTACT_OPTIONS: Array<{ value: ContactKind; label: string; placeholder: string }> = [
  { value: 'address', label: 'Адрес', placeholder: 'Город, улица, дом' },
  { value: 'phone', label: 'Телефон', placeholder: '+31 6 1234 5678' },
  { value: 'email', label: 'Email', placeholder: 'hello@example.com' },
]

export const contactKindLabel = (kind: ContactKind) =>
  CONTACT_OPTIONS.find((option) => option.value === kind)?.label ?? 'Контакт'

export const contactPlaceholder = (kind: ContactKind) =>
  CONTACT_OPTIONS.find((option) => option.value === kind)?.placeholder ?? ''

export const normalizePhone = (value: string) => value.trim().replace(/[\s()-]/g, '')

export const isValidInternationalPhone = (value: string) =>
  /^[+\d\s()-]+$/.test(value) && /^\+[1-9]\d{6,14}$/.test(normalizePhone(value))

export const phoneHref = (value: string) => `tel:${normalizePhone(value)}`

export const emailHref = (value: string) => `mailto:${value.trim()}`

export const addressHref = (value: string) => {
  const query = encodeURIComponent(value.trim())
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) return `geo:0,0?q=${query}`
  if (typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)) return `https://maps.apple.com/?q=${query}`
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

export const isValidContactValue = (kind: ContactKind, value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  if (kind === 'phone') return /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, '').length >= 5 && value.replace(/\D/g, '').length <= 15
  return trimmed.length >= 3
}
