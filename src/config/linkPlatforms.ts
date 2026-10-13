import { normalizeUrl } from '../lib/validation'
import type { LinkIcon } from '../types'

export interface LinkPlatform {
  value: LinkIcon
  label: string
  inputPrefix: string
  placeholder: string
  baseUrl?: string
  usernamePrefix?: string
}

export const LINK_PLATFORMS: LinkPlatform[] = [
  { value: 'link', label: 'Своя ссылка', inputPrefix: '', placeholder: 'example.com/page' },
  { value: 'instagram', label: 'Instagram', inputPrefix: 'instagram.com/', placeholder: 'user', baseUrl: 'https://instagram.com/' },
  { value: 'youtube', label: 'YouTube', inputPrefix: 'youtube.com/@', placeholder: 'user', baseUrl: 'https://youtube.com/', usernamePrefix: '@' },
  { value: 'telegram', label: 'Telegram', inputPrefix: 't.me/', placeholder: 'user', baseUrl: 'https://t.me/' },
  { value: 'tiktok', label: 'TikTok', inputPrefix: 'tiktok.com/@', placeholder: 'user', baseUrl: 'https://tiktok.com/', usernamePrefix: '@' },
  { value: 'whatsapp', label: 'WhatsApp', inputPrefix: 'wa.me/', placeholder: '79990000000', baseUrl: 'https://wa.me/' },
  { value: 'vk', label: 'VK', inputPrefix: 'vk.com/', placeholder: 'user', baseUrl: 'https://vk.com/' },
  { value: 'facebook', label: 'Facebook', inputPrefix: 'facebook.com/', placeholder: 'user', baseUrl: 'https://facebook.com/' },
  { value: 'x', label: 'X', inputPrefix: 'x.com/', placeholder: 'user', baseUrl: 'https://x.com/' },
  { value: 'onlyfans', label: 'OnlyFans', inputPrefix: 'onlyfans.com/', placeholder: 'user', baseUrl: 'https://onlyfans.com/' },
]

export const getLinkPlatform = (value: LinkIcon) =>
  LINK_PLATFORMS.find((platform) => platform.value === value) ?? LINK_PLATFORMS[0]

const removeKnownPrefix = (value: string) => value
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/^www\./i, '')
  .replace(/^[^/]+\//, '')
  .replace(/^@/, '')
  .replace(/\/$/, '')

export const platformUsernameFromUrl = (platform: LinkPlatform, value: string) => {
  if (!value.trim()) return ''
  if (!platform.baseUrl) return value

  try {
    const parsed = new URL(normalizeUrl(value))
    const platformHost = new URL(platform.baseUrl).hostname.replace(/^www\./, '')
    if (parsed.hostname.replace(/^www\./, '') !== platformHost) return ''
    return parsed.pathname.replace(/^\//, '').replace(/^@/, '').replace(/\/$/, '')
  } catch {
    return removeKnownPrefix(value)
  }
}

export const buildPlatformUrl = (platform: LinkPlatform, value: string) => {
  if (!platform.baseUrl) return value
  const username = removeKnownPrefix(value)
  if (!username) return ''
  return `${platform.baseUrl}${platform.usernamePrefix ?? ''}${username}`
}

// The onboarding form accepts a short account name; saved links are always full HTTPS URLs.
export const onboardingPlatformUrl = (platform: LinkPlatform, input: string) => {
  const value = input.trim()
  if (!value) return ''
  if (!platform.baseUrl) return normalizeUrl(value)
  if (platform.value === 'whatsapp') {
    const raw = value.replace(/^(?:https?:\/\/)?(?:www\.)?wa\.me\//i, '')
    if (!/^\+?[\d\s()-]+$/.test(raw)) return ''
    const digits = raw.replace(/\D/g, '')
    return /^\d{7,15}$/.test(digits) ? `https://wa.me/${digits}` : ''
  }

  const shortName = value.replace(/^@/, '')
  if (/^[a-z0-9._-]{1,80}$/i.test(shortName)) return buildPlatformUrl(platform, shortName)
  try {
    const url = new URL(value)
    const expectedHost = new URL(platform.baseUrl).hostname
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.hostname.replace(/^www\./, '') === expectedHost ? url.href : ''
  } catch {
    return ''
  }
}

export const inferLinkLabel = (value: string) => {
  try {
    const hostname = new URL(normalizeUrl(value)).hostname.replace(/^www\./, '')
    return hostname || 'Ссылка'
  } catch {
    return 'Ссылка'
  }
}

export const faviconUrl = (value: string) => {
  try {
    const hostname = new URL(normalizeUrl(value)).hostname
    if (!hostname) return ''
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
  } catch {
    return ''
  }
}
