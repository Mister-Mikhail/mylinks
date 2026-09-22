import { normalizeUrl } from './validation'

const SENSITIVE_HOSTS = [
  'onlyfans.com',
  'fansly.com',
  'pornhub.com',
  'redtube.com',
  'stripchat.com',
  'xhamster.com',
  'xvideos.com',
  'youporn.com',
] as const

export const isKnownSensitiveUrl = (value: string) => {
  if (!value.trim()) return false

  try {
    const hostname = new URL(normalizeUrl(value)).hostname.toLowerCase().replace(/^www\./, '')
    return SENSITIVE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}
